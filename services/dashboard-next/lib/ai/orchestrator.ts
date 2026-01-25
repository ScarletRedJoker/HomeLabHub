import type {
  AIProviderName,
  ChatRequest,
  ChatResponse,
  StreamingChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  OrchestratorMetadata,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
} from './types';
import { ollamaProvider } from './providers/ollama';
import { openaiProvider } from './providers/openai';
import { stableDiffusionProvider } from './providers/stable-diffusion';
import { healthChecker } from './health-checker';
import { responseCache, getCacheKey } from './cache';
import { 
  costTracker, 
  recordAIUsage, 
  shouldBlockCloudUsage, 
  getCostSummary,
  isLocalOnlyMode,
} from './cost-tracker';

export type RoutingStrategy = 'local-first' | 'cloud-first' | 'auto';

export interface OrchestratorConfig {
  routingStrategy: RoutingStrategy;
  enableCaching: boolean;
  cacheTTLMs: number;
  retryConfig: RetryConfig;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  routingStrategy: 'local-first',
  enableCaching: true,
  cacheTTLMs: 3600000,
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 4000,
    backoffMultiplier: 2,
  },
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt === config.maxRetries) {
        break;
      }

      const delayMs = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs
      );

      onRetry?.(attempt, error, delayMs);
      console.log(`[Orchestrator] Retry ${attempt}/${config.maxRetries}: ${error.message}. Waiting ${delayMs}ms`);
      
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('Retry exhausted');
}

class AIOrchestrator {
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfig(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  private selectChatProvider(): AIProviderName {
    const strategy = this.config.routingStrategy;

    if (shouldBlockCloudUsage()) {
      console.log('[Orchestrator] Cloud usage blocked due to cost limits, forcing local provider');
      if (healthChecker.isProviderAvailable('ollama')) {
        return 'ollama';
      }
      throw new Error('Daily AI cost limit exceeded and no local provider available');
    }

    if (strategy === 'local-first') {
      if (healthChecker.isProviderAvailable('ollama')) {
        return 'ollama';
      }
      if (healthChecker.isProviderAvailable('openai')) {
        return 'openai';
      }
    } else if (strategy === 'cloud-first') {
      if (healthChecker.isProviderAvailable('openai')) {
        return 'openai';
      }
      if (healthChecker.isProviderAvailable('ollama')) {
        return 'ollama';
      }
    } else {
      const ollamaStatus = healthChecker.getProviderStatus('ollama');
      const openaiStatus = healthChecker.getProviderStatus('openai');

      if (ollamaStatus.available && openaiStatus.available) {
        if ((ollamaStatus.latencyMs || 999999) < (openaiStatus.latencyMs || 999999)) {
          return 'ollama';
        }
        return 'openai';
      }
      
      if (ollamaStatus.available) return 'ollama';
      if (openaiStatus.available) return 'openai';
    }

    return 'ollama';
  }

  async chat(request: ChatRequest): Promise<ChatResponse & { metadata: OrchestratorMetadata }> {
    if (this.config.enableCaching) {
      const cacheKey = getCacheKey('chat', { messages: request.messages, model: request.model });
      const cached = responseCache.get<ChatResponse>(cacheKey);
      if (cached) {
        return {
          ...cached,
          metadata: {
            provider: cached.provider,
            latency: 0,
            tokensUsed: cached.tokensUsed,
            fallbackUsed: false,
            retryCount: 0,
          },
        };
      }
    }

    const primaryProvider = this.selectChatProvider();
    const fallbackProvider: AIProviderName = primaryProvider === 'ollama' ? 'openai' : 'ollama';

    let retryCount = 0;
    let fallbackUsed = false;

    const executeChat = async (provider: AIProviderName): Promise<ChatResponse> => {
      if (provider === 'ollama') {
        return ollamaProvider.chat(request);
      } else {
        return openaiProvider.chat(request);
      }
    };

    try {
      const response = await withExponentialBackoff(
        () => executeChat(primaryProvider),
        this.config.retryConfig,
        (attempt) => { retryCount = attempt; }
      );

      if (this.config.enableCaching) {
        const cacheKey = getCacheKey('chat', { messages: request.messages, model: request.model });
        responseCache.set(cacheKey, response, this.config.cacheTTLMs);
      }

      const usageRecord = recordAIUsage({
        provider: response.provider,
        model: response.model,
        inputTokens: response.usage?.promptTokens ?? 0,
        outputTokens: response.usage?.completionTokens ?? 0,
        requestType: 'chat',
      });

      return {
        ...response,
        metadata: {
          provider: response.provider,
          latency: response.latency,
          tokensUsed: response.tokensUsed,
          fallbackUsed: false,
          retryCount,
          cost: usageRecord.cost,
          localOnlyMode: isLocalOnlyMode(),
        },
      };
    } catch (primaryError: any) {
      console.log(`[Orchestrator] Primary provider ${primaryProvider} failed: ${primaryError.message}`);
      
      if (!healthChecker.isProviderAvailable(fallbackProvider)) {
        throw primaryError;
      }

      fallbackUsed = true;
      retryCount = 0;

      try {
        const response = await withExponentialBackoff(
          () => executeChat(fallbackProvider),
          this.config.retryConfig,
          (attempt) => { retryCount = attempt; }
        );

        if (this.config.enableCaching) {
          const cacheKey = getCacheKey('chat', { messages: request.messages, model: request.model });
          responseCache.set(cacheKey, response, this.config.cacheTTLMs);
        }

        const usageRecord = recordAIUsage({
          provider: response.provider,
          model: response.model,
          inputTokens: response.usage?.promptTokens ?? 0,
          outputTokens: response.usage?.completionTokens ?? 0,
          requestType: 'chat',
        });

        return {
          ...response,
          metadata: {
            provider: response.provider,
            latency: response.latency,
            tokensUsed: response.tokensUsed,
            fallbackUsed: true,
            retryCount,
            cost: usageRecord.cost,
            localOnlyMode: isLocalOnlyMode(),
          },
        };
      } catch (fallbackError: any) {
        throw new Error(`All providers failed. Primary (${primaryProvider}): ${primaryError.message}. Fallback (${fallbackProvider}): ${fallbackError.message}`);
      }
    }
  }

  private isTransientError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    const isTransient = 
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('temporary') ||
      message.includes('try again') ||
      message.includes('temporarily');
    
    return isTransient;
  }

  private emitStreamError(event: {
    provider: AIProviderName;
    error: Error;
    message: string;
    retryCount?: number;
  }): void {
    console.error(
      `[Orchestrator:StreamError] Provider: ${event.provider}, Message: ${event.message}`,
      {
        error: event.error.message,
        retryCount: event.retryCount || 0,
        timestamp: new Date().toISOString(),
      }
    );
  }

  private emitProviderSwitched(event: {
    fromProvider: AIProviderName;
    toProvider: AIProviderName;
    reason: string;
  }): void {
    console.warn(
      `[Orchestrator:FallbackTriggered] Switching from ${event.fromProvider} to ${event.toProvider}: ${event.reason}`,
      { timestamp: new Date().toISOString() }
    );
  }

  private trackFallbackUsage(event: {
    primaryProvider: AIProviderName;
    fallbackProvider: AIProviderName;
    success: boolean;
    retryCount?: number;
  }): void {
    console.log(
      `[Orchestrator:FallbackMetrics] Primary: ${event.primaryProvider}, Fallback: ${event.fallbackProvider}, Success: ${event.success}, Retries: ${event.retryCount || 0}`,
      { timestamp: new Date().toISOString() }
    );
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<StreamingChunk & { metadata?: OrchestratorMetadata }> {
    const primaryProvider = this.selectChatProvider();
    const fallbackProvider: AIProviderName = primaryProvider === 'ollama' ? 'openai' : 'ollama';

    let retryCount = 0;
    let fallbackUsed = false;
    let streamInitialized = false;

    const executeStream = async function* (provider: AIProviderName): AsyncGenerator<StreamingChunk> {
      if (provider === 'ollama') {
        yield* ollamaProvider.chatStream(request);
      } else {
        yield* openaiProvider.chatStream(request);
      }
    };

    // Primary provider attempt with retry logic
    let primaryAttempted = false;
    let primaryError: any = null;

    try {
      // Ensure primary provider is available before attempting
      if (!healthChecker.isProviderAvailable(primaryProvider)) {
        throw new Error(`Primary provider ${primaryProvider} is not available`);
      }

      primaryAttempted = true;
      const stream = executeStream(primaryProvider);
      
      for await (const chunk of stream) {
        streamInitialized = true;
        yield chunk;
      }
      
      // Successfully completed primary stream
      return;
    } catch (error: any) {
      primaryError = error;
      console.log(`[Orchestrator] Primary stream ${primaryProvider} failed: ${error.message}`);

      // Emit error event
      this.emitStreamError({
        provider: primaryProvider,
        error,
        message: `Primary provider ${primaryProvider} failed during streaming`,
        retryCount,
      });

      // Attempt retry with exponential backoff for transient errors
      if (this.isTransientError(error) && retryCount < this.config.retryConfig.maxRetries) {
        for (let attempt = 1; attempt <= this.config.retryConfig.maxRetries; attempt++) {
          try {
            const delayMs = Math.min(
              this.config.retryConfig.initialDelayMs * 
              Math.pow(this.config.retryConfig.backoffMultiplier, attempt - 1),
              this.config.retryConfig.maxDelayMs
            );

            console.log(
              `[Orchestrator] Retrying primary stream attempt ${attempt}/${this.config.retryConfig.maxRetries}. Waiting ${delayMs}ms`
            );
            await sleep(delayMs);

            retryCount = attempt;
            const retryStream = executeStream(primaryProvider);

            for await (const chunk of retryStream) {
              streamInitialized = true;
              yield chunk;
            }

            // Successfully recovered on retry
            return;
          } catch (retryError: any) {
            console.log(
              `[Orchestrator] Primary stream retry ${attempt} failed: ${retryError.message}`
            );
            primaryError = retryError;

            if (attempt === this.config.retryConfig.maxRetries) {
              break; // Fall through to fallback
            }
          }
        }
      }
    }

    // Fallback provider attempt (if primary exhausted or not available)
    try {
      // Check if fallback provider is available before attempting
      if (!healthChecker.isProviderAvailable(fallbackProvider)) {
        throw new Error(
          `All providers failed. Primary (${primaryProvider}): ${primaryError?.message || 'Not attempted'}. ` +
          `Fallback ${fallbackProvider} is not available`
        );
      }

      fallbackUsed = true;

      // Emit provider switch event
      this.emitProviderSwitched({
        fromProvider: primaryProvider,
        toProvider: fallbackProvider,
        reason: 'Primary provider failed during streaming',
      });

      // Yield notification chunk about fallback
      yield {
        content: '',
        done: false,
        provider: fallbackProvider,
        model: request.model,
        metadata: {
          provider: fallbackProvider,
          latency: 0,
          tokensUsed: 0,
          fallbackUsed: true,
          retryCount,
        },
      };

      // Stream from fallback provider with retry logic
      let fallbackAttempt = 0;
      let fallbackError: any = null;

      try {
        const fallbackStream = executeStream(fallbackProvider);

        for await (const chunk of fallbackStream) {
          streamInitialized = true;
          yield {
            ...chunk,
            metadata: {
              provider: fallbackProvider,
              latency: 0,
              tokensUsed: 0,
              fallbackUsed: true,
              retryCount,
            },
          };
        }

        // Successfully completed fallback stream
        this.trackFallbackUsage({
          primaryProvider,
          fallbackProvider,
          success: true,
          retryCount,
        });
        return;
      } catch (error: any) {
        fallbackError = error;
        console.log(`[Orchestrator] Fallback stream ${fallbackProvider} failed: ${error.message}`);

        // Emit error event for fallback failure
        this.emitStreamError({
          provider: fallbackProvider,
          error,
          message: `Fallback provider ${fallbackProvider} failed during streaming`,
          retryCount: fallbackAttempt,
        });

        // Attempt retry with exponential backoff for transient errors on fallback
        if (this.isTransientError(error) && fallbackAttempt < this.config.retryConfig.maxRetries) {
          for (let attempt = 1; attempt <= this.config.retryConfig.maxRetries; attempt++) {
            try {
              const delayMs = Math.min(
                this.config.retryConfig.initialDelayMs * 
                Math.pow(this.config.retryConfig.backoffMultiplier, attempt - 1),
                this.config.retryConfig.maxDelayMs
              );

              console.log(
                `[Orchestrator] Retrying fallback stream attempt ${attempt}/${this.config.retryConfig.maxRetries}. Waiting ${delayMs}ms`
              );
              await sleep(delayMs);

              fallbackAttempt = attempt;
              const retryFallbackStream = executeStream(fallbackProvider);

              for await (const chunk of retryFallbackStream) {
                streamInitialized = true;
                yield {
                  ...chunk,
                  metadata: {
                    provider: fallbackProvider,
                    latency: 0,
                    tokensUsed: 0,
                    fallbackUsed: true,
                    retryCount: fallbackAttempt,
                  },
                };
              }

              // Successfully recovered fallback on retry
              this.trackFallbackUsage({
                primaryProvider,
                fallbackProvider,
                success: true,
                retryCount: fallbackAttempt,
              });
              return;
            } catch (retryError: any) {
              console.log(
                `[Orchestrator] Fallback stream retry ${attempt} failed: ${retryError.message}`
              );
              fallbackError = retryError;

              if (attempt === this.config.retryConfig.maxRetries) {
                break;
              }
            }
          }
        }

        // Track failed fallback usage
        this.trackFallbackUsage({
          primaryProvider,
          fallbackProvider,
          success: false,
          retryCount: fallbackAttempt,
        });

        // Both providers exhausted
        throw new Error(
          `All providers failed. Primary (${primaryProvider}): ${primaryError?.message || 'Unknown error'}. ` +
          `Fallback (${fallbackProvider}): ${fallbackError?.message || 'Unknown error'}`
        );
      }
    } catch (error: any) {
      console.error(`[Orchestrator] ChatStream fatal error: ${error.message}`);
      throw error;
    }
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse & { metadata: OrchestratorMetadata }> {
    if (healthChecker.isProviderAvailable('ollama')) {
      const response = await ollamaProvider.embeddings(request);
      return {
        ...response,
        metadata: {
          provider: 'ollama',
          latency: response.latency,
          tokensUsed: 0,
          fallbackUsed: false,
        },
      };
    }

    if (healthChecker.isProviderAvailable('openai')) {
      const result = await openaiProvider.embeddings(request.input);
      return {
        embeddings: result.embeddings,
        provider: 'openai',
        model: 'text-embedding-3-small',
        latency: result.latency,
        metadata: {
          provider: 'openai',
          latency: result.latency,
          tokensUsed: 0,
          fallbackUsed: true,
        },
      };
    }

    throw new Error('No embedding provider available');
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse & { metadata: OrchestratorMetadata }> {
    if (healthChecker.isProviderAvailable('stable-diffusion')) {
      const response = await stableDiffusionProvider.generateImage(request);
      const usageRecord = recordAIUsage({
        provider: 'stable-diffusion',
        model: 'stable-diffusion',
        imageCount: response.images.length,
        requestType: 'image',
      });
      return {
        ...response,
        metadata: {
          provider: 'stable-diffusion',
          latency: response.latency,
          tokensUsed: 0,
          fallbackUsed: false,
          cost: usageRecord.cost,
          localOnlyMode: isLocalOnlyMode(),
        },
      };
    }

    if (shouldBlockCloudUsage()) {
      throw new Error('Daily AI cost limit exceeded. Image generation via cloud provider is blocked.');
    }

    if (healthChecker.isProviderAvailable('openai')) {
      const result = await openaiProvider.generateImage(
        request.prompt,
        `${request.width || 1024}x${request.height || 1024}` as any
      );
      const usageRecord = recordAIUsage({
        provider: 'openai',
        model: 'dall-e-3',
        imageCount: 1,
        requestType: 'image',
      });
      return {
        images: [result.url],
        provider: 'openai',
        latency: result.latency,
        metadata: {
          provider: 'openai',
          latency: result.latency,
          tokensUsed: 0,
          fallbackUsed: true,
          cost: usageRecord.cost,
          localOnlyMode: isLocalOnlyMode(),
        },
      };
    }

    throw new Error('No image generation provider available');
  }

  getProviderStatus() {
    return {
      ollama: {
        info: ollamaProvider.getProviderInfo(),
        health: healthChecker.getProviderStatus('ollama'),
      },
      openai: {
        info: openaiProvider.getProviderInfo(),
        health: healthChecker.getProviderStatus('openai'),
      },
      'stable-diffusion': {
        info: stableDiffusionProvider.getProviderInfo(),
        health: healthChecker.getProviderStatus('stable-diffusion'),
      },
    };
  }

  getCacheStats() {
    return responseCache.getStats();
  }

  clearCache(): number {
    return responseCache.invalidate();
  }

  startHealthMonitoring(): void {
    healthChecker.start();
  }

  stopHealthMonitoring(): void {
    healthChecker.stop();
  }

  getCostSummary() {
    return getCostSummary();
  }

  isLocalOnlyMode(): boolean {
    return isLocalOnlyMode();
  }
}

export const aiOrchestrator = new AIOrchestrator();

export {
  ollamaProvider,
  openaiProvider,
  stableDiffusionProvider,
  healthChecker,
  responseCache,
  costTracker,
  recordAIUsage,
  shouldBlockCloudUsage,
  getCostSummary,
  isLocalOnlyMode,
};

export * from './types';
