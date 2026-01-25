import { responseCache, getCacheKey, type AIResponseCache } from './cache';
import { promptOptimizer, type OptimizationResult } from './prompt-optimizer';
import { modelRouter, selectModel, detectTaskType, type ModelConfig, type TaskType, type RouterOptions } from './model-router';
import { costTracker, type CostSummary, type UsageRecord } from './cost-tracker';
import type { AIProviderName } from './types';

export interface OptimizedRequest {
  messages: Array<{ role: string; content: string }>;
  model: ModelConfig;
  cacheKey: string;
  estimatedCost: number;
  tokensSaved: number;
  originalTokens: number;
  optimizedTokens: number;
}

export interface OptimizerConfig {
  enableCaching: boolean;
  enablePromptOptimization: boolean;
  enableSmartRouting: boolean;
  enableCostTracking: boolean;
  preferLocal: boolean;
  maxDailyCost: number;
  localOnlyMode: boolean;
}

const DEFAULT_CONFIG: OptimizerConfig = {
  enableCaching: true,
  enablePromptOptimization: true,
  enableSmartRouting: true,
  enableCostTracking: true,
  preferLocal: true,
  maxDailyCost: parseFloat(process.env.MAX_DAILY_AI_COST || '5'),
  localOnlyMode: process.env.LOCAL_AI_ONLY === 'true',
};

class AIOptimizer {
  private config: OptimizerConfig;
  private requestCount: number = 0;
  private totalTokensSaved: number = 0;
  private totalCostSaved: number = 0;
  
  constructor(config: Partial<OptimizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  prepareRequest(
    messages: Array<{ role: string; content: string }>,
    options: RouterOptions & { taskHint?: string } = {}
  ): OptimizedRequest {
    let processedMessages = [...messages];
    let totalTokensSaved = 0;
    let originalTokens = 0;
    let optimizedTokens = 0;
    
    for (const msg of messages) {
      originalTokens += promptOptimizer.estimateTokens(msg.content);
    }
    
    if (this.config.enablePromptOptimization) {
      const optimized = promptOptimizer.optimizeMessages(messages);
      processedMessages = optimized.map(m => ({ role: m.role, content: m.content }));
      totalTokensSaved = optimized.reduce((sum, m) => sum + (m.tokensSaved || 0), 0);
    }
    
    for (const msg of processedMessages) {
      optimizedTokens += promptOptimizer.estimateTokens(msg.content);
    }
    
    const userContent = messages.find(m => m.role === 'user')?.content || '';
    const taskType = options.taskHint 
      ? detectTaskType(options.taskHint)
      : detectTaskType(userContent);
    
    let routerOptions: RouterOptions = {
      preferLocal: this.config.preferLocal,
      ...options,
    };
    
    if (this.config.localOnlyMode) {
      routerOptions.excludeProviders = ['openai'];
    }
    
    const model = this.config.enableSmartRouting
      ? selectModel(taskType, routerOptions)
      : modelRouter.AVAILABLE_MODELS['ollama:llama3.2:3b'];
    
    const cacheKey = this.config.enableCaching
      ? getCacheKey('optimizer', { messages: processedMessages, model: model.model })
      : '';
    
    const estimatedCost = modelRouter.estimateCost(model, optimizedTokens, optimizedTokens);
    
    this.requestCount++;
    this.totalTokensSaved += totalTokensSaved;
    
    return {
      messages: processedMessages,
      model,
      cacheKey,
      estimatedCost,
      tokensSaved: totalTokensSaved,
      originalTokens,
      optimizedTokens,
    };
  }
  
  async getCachedResponse<T>(cacheKey: string): Promise<T | null> {
    if (!this.config.enableCaching || !cacheKey) return null;
    return responseCache.get<T>(cacheKey);
  }
  
  async cacheResponse<T>(cacheKey: string, response: T, ttlMs?: number): Promise<void> {
    if (!this.config.enableCaching || !cacheKey) return;
    responseCache.set(cacheKey, response, ttlMs);
  }
  
  async trackUsage(
    model: ModelConfig,
    inputTokens: number,
    outputTokens: number,
    requestType: 'chat' | 'image' | 'embedding' = 'chat'
  ): Promise<void> {
    if (!this.config.enableCostTracking) return;
    
    costTracker.recordUsage({
      provider: model.provider as AIProviderName,
      model: model.model,
      inputTokens,
      outputTokens,
      imageCount: requestType === 'image' ? 1 : 0,
      requestType,
    });
  }
  
  async getCostSummary(): Promise<CostSummary> {
    return costTracker.getCostSummary();
  }
  
  async shouldSwitchToLocal(): Promise<boolean> {
    const summary = await this.getCostSummary();
    return summary.isNearLimit || summary.isOverLimit;
  }
  
  getStats(): {
    requestCount: number;
    totalTokensSaved: number;
    estimatedCostSaved: number;
    config: OptimizerConfig;
  } {
    const avgCostPer1K = 0.0005;
    const estimatedCostSaved = (this.totalTokensSaved / 1000) * avgCostPer1K;
    
    return {
      requestCount: this.requestCount,
      totalTokensSaved: this.totalTokensSaved,
      estimatedCostSaved,
      config: this.config,
    };
  }
  
  updateConfig(updates: Partial<OptimizerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
  
  enableLocalOnlyMode(): void {
    this.config.localOnlyMode = true;
  }
  
  disableLocalOnlyMode(): void {
    this.config.localOnlyMode = false;
  }
  
  resetStats(): void {
    this.requestCount = 0;
    this.totalTokensSaved = 0;
    this.totalCostSaved = 0;
  }
}

export const aiOptimizer = new AIOptimizer();

export async function optimizeAndExecute<T>(
  messages: Array<{ role: string; content: string }>,
  executor: (messages: Array<{ role: string; content: string }>, model: ModelConfig) => Promise<T>,
  options: RouterOptions & { taskHint?: string; cacheTtlMs?: number } = {}
): Promise<{ result: T; fromCache: boolean; stats: OptimizedRequest }> {
  const request = aiOptimizer.prepareRequest(messages, options);
  
  const cached = await aiOptimizer.getCachedResponse<T>(request.cacheKey);
  if (cached) {
    return { result: cached, fromCache: true, stats: request };
  }
  
  const result = await executor(request.messages, request.model);
  
  await aiOptimizer.cacheResponse(request.cacheKey, result, options.cacheTtlMs);
  
  const outputTokens = typeof result === 'string' 
    ? promptOptimizer.estimateTokens(result)
    : promptOptimizer.estimateTokens(JSON.stringify(result));
  
  await aiOptimizer.trackUsage(request.model, request.optimizedTokens, outputTokens);
  
  return { result, fromCache: false, stats: request };
}

export { promptOptimizer } from './prompt-optimizer';
export { modelRouter, selectModel, detectTaskType } from './model-router';
export { costTracker } from './cost-tracker';
export { responseCache, getCacheKey } from './cache';

export type { OptimizationResult } from './prompt-optimizer';
export type { ModelConfig, TaskType, RouterOptions } from './model-router';
export type { CostSummary, UsageRecord } from './cost-tracker';

export default aiOptimizer;
