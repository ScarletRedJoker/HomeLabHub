import fetch from 'node-fetch';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://100.118.44.102:11434';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = 'llama3.2:3b';
const TIMEOUT_MS = 30000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  provider: 'ollama' | 'openai';
  model: string;
}

async function checkOllamaHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`${OLLAMA_URL}/api/version`, {
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function chatOllama(options: ChatOptions): Promise<ChatResponse> {
  const { messages, model = DEFAULT_MODEL, temperature = 0.7 } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status}`);
    }

    const data = await res.json() as { message?: { content: string } };
    
    return {
      content: data.message?.content || '',
      provider: 'ollama',
      model
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function chatOpenAI(options: ChatOptions): Promise<ChatResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const { messages, model = 'gpt-3.5-turbo', temperature = 0.7, maxTokens = 500 } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`OpenAI error: ${res.status}`);
    }

    const data = await res.json() as { choices?: Array<{ message?: { content: string } }> };
    
    return {
      content: data.choices?.[0]?.message?.content || '',
      provider: 'openai',
      model
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function chat(options: ChatOptions): Promise<ChatResponse> {
  const ollamaHealthy = await checkOllamaHealth();
  
  if (ollamaHealthy) {
    try {
      return await chatOllama(options);
    } catch (error) {
      console.log('[AI] Ollama failed, falling back to OpenAI:', (error as Error).message);
    }
  }
  
  if (OPENAI_API_KEY) {
    return await chatOpenAI({
      ...options,
      model: 'gpt-3.5-turbo'
    });
  }
  
  throw new Error('No AI provider available');
}

export async function getProviderStatus(): Promise<{ ollama: boolean; openai: boolean }> {
  const ollamaHealthy = await checkOllamaHealth();
  return {
    ollama: ollamaHealthy,
    openai: !!OPENAI_API_KEY
  };
}

export const ai = {
  chat,
  checkOllamaHealth,
  getProviderStatus
};

export default ai;
