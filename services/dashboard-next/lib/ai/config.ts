/**
 * AI Service Configuration - Production-safe environment-aware configuration
 * Removes all hardcoded localhost/IP assumptions
 * Build-time safe: No database connections, no side effects during build
 */

export interface AIEndpointConfig {
  url: string;
  timeout: number;
  healthCheckInterval: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface AIConfig {
  ollama: AIEndpointConfig;
  stableDiffusion: AIEndpointConfig;
  comfyui: AIEndpointConfig;
  openai: {
    apiKey: string | null;
    baseUrl: string;
    timeout: number;
  };
  fallback: {
    enabled: boolean;
    order: ('ollama' | 'openai')[];
    localOnlyMode: boolean;
  };
}

function isBuildTime(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build' ||
         process.argv.some(arg => arg.includes('next') && arg.includes('build')) ||
         (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production');
}

function getEnvOrNull(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : null;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return getEnvOrNull(key) || defaultValue;
}

function getWindowsVMIP(): string | null {
  return getEnvOrNull('WINDOWS_VM_TAILSCALE_IP');
}

function buildLocalAIUrl(port: number, path = ''): string | null {
  const windowsIP = getWindowsVMIP();
  if (!windowsIP) return null;
  return `http://${windowsIP}:${port}${path}`;
}

const isProduction = process.env.NODE_ENV === 'production';

function getOllamaUrl(): string {
  const explicit = getEnvOrNull('OLLAMA_URL') || getEnvOrNull('OLLAMA_BASE_URL');
  if (explicit) return explicit;
  
  const localUrl = buildLocalAIUrl(11434);
  if (localUrl) return localUrl;
  
  return 'http://localhost:11434';
}

function getStableDiffusionUrl(): string {
  const explicit = getEnvOrNull('STABLE_DIFFUSION_URL') || getEnvOrNull('SD_URL');
  if (explicit) return explicit;
  
  const localUrl = buildLocalAIUrl(7860);
  if (localUrl) return localUrl;
  
  return 'http://localhost:7860';
}

function getComfyUIUrl(): string {
  const explicit = getEnvOrNull('COMFYUI_URL');
  if (explicit) return explicit;
  
  const localUrl = buildLocalAIUrl(8188);
  if (localUrl) return localUrl;
  
  return 'http://localhost:8188';
}

function getOpenAIApiKey(): string | null {
  return getEnvOrNull('AI_INTEGRATIONS_OPENAI_API_KEY') || getEnvOrNull('OPENAI_API_KEY');
}

function getOpenAIBaseUrl(): string {
  return getEnvOrNull('AI_INTEGRATIONS_OPENAI_BASE_URL') || 
         getEnvOrNull('OPENAI_BASE_URL') || 
         'https://api.openai.com/v1';
}

function isLocalOnlyMode(): boolean {
  return getEnvOrNull('LOCAL_AI_ONLY')?.toLowerCase() === 'true';
}

function isFallbackEnabled(): boolean {
  const explicit = getEnvOrNull('AI_FALLBACK_ENABLED');
  if (explicit !== null) {
    return explicit.toLowerCase() === 'true';
  }
  return !isLocalOnlyMode() && !!getOpenAIApiKey();
}

export function getAIConfig(): AIConfig {
  const ollamaUrl = getOllamaUrl();
  const sdUrl = getStableDiffusionUrl();
  const comfyUrl = getComfyUIUrl();
  const openaiKey = getOpenAIApiKey();
  
  return {
    ollama: {
      url: ollamaUrl,
      timeout: parseInt(getEnvOrDefault('OLLAMA_TIMEOUT', '60000')),
      healthCheckInterval: parseInt(getEnvOrDefault('AI_HEALTH_CHECK_INTERVAL', '30000')),
      maxRetries: parseInt(getEnvOrDefault('OLLAMA_MAX_RETRIES', '3')),
      retryDelayMs: parseInt(getEnvOrDefault('OLLAMA_RETRY_DELAY', '1000')),
    },
    stableDiffusion: {
      url: sdUrl,
      timeout: parseInt(getEnvOrDefault('SD_TIMEOUT', '120000')),
      healthCheckInterval: parseInt(getEnvOrDefault('AI_HEALTH_CHECK_INTERVAL', '30000')),
      maxRetries: parseInt(getEnvOrDefault('SD_MAX_RETRIES', '2')),
      retryDelayMs: parseInt(getEnvOrDefault('SD_RETRY_DELAY', '2000')),
    },
    comfyui: {
      url: comfyUrl,
      timeout: parseInt(getEnvOrDefault('COMFYUI_TIMEOUT', '300000')),
      healthCheckInterval: parseInt(getEnvOrDefault('AI_HEALTH_CHECK_INTERVAL', '30000')),
      maxRetries: parseInt(getEnvOrDefault('COMFYUI_MAX_RETRIES', '2')),
      retryDelayMs: parseInt(getEnvOrDefault('COMFYUI_RETRY_DELAY', '2000')),
    },
    openai: {
      apiKey: openaiKey,
      baseUrl: getOpenAIBaseUrl(),
      timeout: parseInt(getEnvOrDefault('OPENAI_TIMEOUT', '30000')),
    },
    fallback: {
      enabled: isFallbackEnabled(),
      order: isLocalOnlyMode() ? ['ollama'] : ['ollama', 'openai'],
      localOnlyMode: isLocalOnlyMode(),
    },
  };
}

export function validateAIConfig(options: { strict?: boolean } = {}): { valid: boolean; warnings: string[]; errors: string[] } {
  const config = getAIConfig();
  const warnings: string[] = [];
  const errors: string[] = [];
  const strict = options.strict || isProduction;
  
  const hasLocalAIConfig = getWindowsVMIP() || getEnvOrNull('OLLAMA_URL');
  
  if (!hasLocalAIConfig) {
    const msg = 'No WINDOWS_VM_TAILSCALE_IP or OLLAMA_URL configured. Local AI uses localhost fallback.';
    if (strict) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  if (!config.openai.apiKey && !isLocalOnlyMode()) {
    warnings.push('No OpenAI API key configured. Cloud AI fallback is disabled.');
  }
  
  if (config.openai.apiKey && !config.openai.apiKey.startsWith('sk-')) {
    errors.push('OpenAI API key appears invalid (should start with "sk-")');
  }
  
  if (config.ollama.url.includes('localhost') && isProduction) {
    const msg = 'Ollama URL is localhost in production. This will not work in containerized environments.';
    if (strict) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  if (config.stableDiffusion.url.includes('localhost') && isProduction) {
    warnings.push('Stable Diffusion URL is localhost in production.');
  }
  
  if (config.comfyui.url.includes('localhost') && isProduction) {
    warnings.push('ComfyUI URL is localhost in production.');
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function logConfigStatus(): void {
  if (isBuildTime()) {
    return;
  }
  
  const config = getAIConfig();
  const validation = validateAIConfig();
  
  console.log('[AIConfig] Configuration loaded:');
  console.log(`  Ollama: ${config.ollama.url}`);
  console.log(`  Stable Diffusion: ${config.stableDiffusion.url}`);
  console.log(`  ComfyUI: ${config.comfyui.url}`);
  console.log(`  OpenAI: ${config.openai.apiKey ? 'configured' : 'not configured'}`);
  console.log(`  Fallback: ${config.fallback.enabled ? 'enabled' : 'disabled'}`);
  console.log(`  Local-only mode: ${config.fallback.localOnlyMode}`);
  
  validation.warnings.forEach(w => console.warn(`[AIConfig] Warning: ${w}`));
  validation.errors.forEach(e => console.error(`[AIConfig] Error: ${e}`));
}

export { isBuildTime };

export default getAIConfig;
