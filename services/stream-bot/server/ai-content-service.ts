/**
 * AI Content Assistant Service
 * Generates stream titles, descriptions, social media posts, and more
 * Uses Ollama as primary provider with OpenAI fallback
 */
import OpenAI from 'openai';

const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102';
const OLLAMA_URL = process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const OLLAMA_CONNECT_TIMEOUT = 5000;
const OLLAMA_REQUEST_TIMEOUT = 60000;

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) return openaiClient;
  
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('[AI Content] No OpenAI API key configured');
    return null;
  }
  
  openaiClient = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey,
  });
  
  return openaiClient;
}

function getOllamaUrl(): string {
  return OLLAMA_URL;
}

function isLocalAIOnly(): boolean {
  return process.env.LOCAL_AI_ONLY === 'true';
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_CONNECT_TIMEOUT);
    
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    return false;
  }
}

export interface ContentGenerationRequest {
  type: 'title' | 'description' | 'social_post' | 'tags' | 'clip_caption' | 'schedule_post';
  platform?: 'twitch' | 'youtube' | 'kick' | 'twitter' | 'instagram' | 'discord';
  gameOrCategory?: string;
  tone?: 'professional' | 'casual' | 'hype' | 'funny' | 'chill';
  keywords?: string[];
  context?: string;
  existingContent?: string;
  maxLength?: number;
}

export interface GeneratedContent {
  success: boolean;
  content: string;
  alternatives?: string[];
  error?: string;
  provider?: string;
  latencyMs?: number;
}

const TONE_DESCRIPTORS: Record<string, string> = {
  professional: 'professional, polished, and informative',
  casual: 'casual, friendly, and approachable',
  hype: 'exciting, energetic, and attention-grabbing with emojis',
  funny: 'humorous, witty, and entertaining',
  chill: 'relaxed, laid-back, and cozy'
};

const PLATFORM_GUIDELINES: Record<string, string> = {
  twitch: 'Keep it under 140 characters. Use relevant emotes/emojis. Include game/category if relevant.',
  youtube: 'SEO-friendly, include relevant keywords. Can be longer and more descriptive.',
  kick: 'Similar to Twitch style, casual and engaging.',
  twitter: 'Under 280 characters. Use hashtags sparingly. Engaging and shareable.',
  instagram: 'Visual-focused, use relevant hashtags, emojis encouraged.',
  discord: 'Can be more detailed. Use Discord markdown if helpful.'
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

async function chatWithOllama(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ content: string; provider: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_REQUEST_TIMEOUT);
  
  try {
    const response = await fetch(`${getOllamaUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.8,
          num_predict: options.maxTokens ?? 500,
        },
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      content: data.message?.content || '',
      provider: 'ollama',
    };
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Ollama request timed out');
    }
    throw error;
  }
}

async function chatWithOpenAI(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ content: string; provider: string }> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI not configured');
  }
  
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 500,
  });
  
  return {
    content: response.choices[0]?.message?.content?.trim() || '',
    provider: 'openai',
  };
}

async function chatWithFallback(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ content: string; provider: string; fallbackUsed: boolean; latencyMs: number }> {
  const startTime = Date.now();
  
  const ollamaAvailable = await isOllamaAvailable();
  
  if (ollamaAvailable) {
    console.log('[AI Content] Using Ollama as primary provider');
    try {
      const result = await chatWithOllama(messages, options);
      const latencyMs = Date.now() - startTime;
      console.log(`[AI Content] Ollama request completed in ${latencyMs}ms`);
      return { ...result, fallbackUsed: false, latencyMs };
    } catch (ollamaError: any) {
      console.log(`[AI Content] Ollama failed: ${ollamaError.message}`);
      
      if (isLocalAIOnly()) {
        throw new Error(
          `Local AI (Ollama) failed and LOCAL_AI_ONLY=true prevents cloud fallback. ` +
          `Error: ${ollamaError.message}. ` +
          `Please ensure Ollama is running at ${getOllamaUrl()} or set LOCAL_AI_ONLY=false to allow OpenAI fallback.`
        );
      }
      
      const client = getOpenAIClient();
      if (client) {
        console.log('[AI Content] Falling back to OpenAI');
        const result = await chatWithOpenAI(messages, options);
        const latencyMs = Date.now() - startTime;
        console.log(`[AI Content] OpenAI fallback completed in ${latencyMs}ms`);
        return { ...result, fallbackUsed: true, latencyMs };
      }
      
      throw ollamaError;
    }
  }
  
  if (isLocalAIOnly()) {
    throw new Error(
      `Ollama is not available at ${getOllamaUrl()} and LOCAL_AI_ONLY=true prevents cloud fallback. ` +
      `Please start Ollama on your Windows VM or set LOCAL_AI_ONLY=false to allow OpenAI fallback.`
    );
  }
  
  const client = getOpenAIClient();
  if (client) {
    console.log('[AI Content] Ollama unavailable, using OpenAI directly');
    const result = await chatWithOpenAI(messages, options);
    const latencyMs = Date.now() - startTime;
    console.log(`[AI Content] OpenAI request completed in ${latencyMs}ms`);
    return { ...result, fallbackUsed: false, latencyMs };
  }
  
  throw new Error(
    'No AI provider available. Start Ollama on Windows VM or configure OpenAI API key.'
  );
}

export async function generateContent(request: ContentGenerationRequest): Promise<GeneratedContent> {
  try {
    const tone = TONE_DESCRIPTORS[request.tone || 'casual'];
    const platformGuide = request.platform ? PLATFORM_GUIDELINES[request.platform] : '';
    
    let systemPrompt = `You are an expert content creator for live streamers and content creators. 
You create engaging, authentic content that feels natural and connects with audiences.
Always match the requested tone and platform guidelines.`;

    let userPrompt = '';
    
    switch (request.type) {
      case 'title':
        userPrompt = `Generate 3 stream title options for a ${request.platform || 'streaming'} stream.
${request.gameOrCategory ? `Game/Category: ${request.gameOrCategory}` : ''}
${request.context ? `Context: ${request.context}` : ''}
${request.keywords?.length ? `Keywords to include: ${request.keywords.join(', ')}` : ''}
Tone: ${tone}
${platformGuide ? `Platform guidelines: ${platformGuide}` : ''}
${request.maxLength ? `Max length: ${request.maxLength} characters` : ''}

Return exactly 3 title options, one per line, no numbering or bullets.`;
        break;
        
      case 'description':
        userPrompt = `Write a stream/video description for ${request.platform || 'a streaming platform'}.
${request.gameOrCategory ? `Game/Category: ${request.gameOrCategory}` : ''}
${request.context ? `Context: ${request.context}` : ''}
${request.existingContent ? `Existing title: ${request.existingContent}` : ''}
Tone: ${tone}
${platformGuide ? `Platform guidelines: ${platformGuide}` : ''}

Include:
- Brief intro about what viewers can expect
- Call to action (follow, subscribe, etc.)
- Relevant social links placeholder [SOCIALS]
${request.maxLength ? `Max length: ${request.maxLength} characters` : 'Keep it concise but informative.'}`;
        break;
        
      case 'social_post':
        userPrompt = `Create a social media post announcing a stream going live.
Platform: ${request.platform || 'Twitter'}
${request.gameOrCategory ? `Playing: ${request.gameOrCategory}` : ''}
${request.context ? `Context: ${request.context}` : ''}
${request.existingContent ? `Stream title: ${request.existingContent}` : ''}
Tone: ${tone}
${platformGuide ? `Platform guidelines: ${platformGuide}` : ''}

The post should:
- Grab attention quickly
- Include a call to action to watch
- Use appropriate emojis/hashtags for the platform
${request.maxLength ? `Max length: ${request.maxLength} characters` : ''}`;
        break;
        
      case 'tags':
        userPrompt = `Generate 10-15 relevant tags/keywords for a stream or video.
${request.gameOrCategory ? `Game/Category: ${request.gameOrCategory}` : ''}
${request.context ? `Context: ${request.context}` : ''}
${request.existingContent ? `Title: ${request.existingContent}` : ''}
Platform: ${request.platform || 'YouTube'}

Return tags as a comma-separated list, no hashtags, lowercase preferred.
Include a mix of broad and specific tags for discoverability.`;
        break;
        
      case 'clip_caption':
        userPrompt = `Write a short, engaging caption for a stream clip or highlight.
${request.context ? `What happens in the clip: ${request.context}` : ''}
${request.gameOrCategory ? `Game: ${request.gameOrCategory}` : ''}
Platform: ${request.platform || 'TikTok/Shorts'}
Tone: ${tone}

The caption should:
- Be attention-grabbing
- Work without context
- Be under 100 characters
- Include 1-2 relevant emojis`;
        break;
        
      case 'schedule_post':
        userPrompt = `Create a stream schedule announcement post.
${request.context ? `Schedule details: ${request.context}` : 'Weekly streaming schedule'}
Platform: ${request.platform || 'Discord'}
Tone: ${tone}

The post should:
- Be clear about days/times (use [DAY] [TIME] placeholders)
- Build excitement for upcoming streams
- Encourage viewers to follow for notifications
- Include relevant emojis`;
        break;
    }
    
    const result = await chatWithFallback(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      { temperature: 0.8, maxTokens: 500 }
    );
    
    const content = result.content.trim();
    
    if (request.type === 'title') {
      const lines = content.split('\n').filter(l => l.trim());
      return {
        success: true,
        content: lines[0] || content,
        alternatives: lines.slice(1),
        provider: result.provider,
        latencyMs: result.latencyMs,
      };
    }
    
    return {
      success: true,
      content,
      provider: result.provider,
      latencyMs: result.latencyMs,
    };
    
  } catch (error: any) {
    console.error('[AI Content] Error generating content:', error);
    return {
      success: false,
      content: '',
      error: error.message || 'Failed to generate content'
    };
  }
}

export async function improveContent(
  originalContent: string,
  instruction: string
): Promise<GeneratedContent> {
  try {
    const result = await chatWithFallback(
      [
        { 
          role: 'system', 
          content: 'You are a helpful content editor for streamers. Improve the given content based on the instruction. Return only the improved content, no explanations.' 
        },
        { 
          role: 'user', 
          content: `Original content:\n${originalContent}\n\nInstruction: ${instruction}` 
        }
      ],
      { temperature: 0.7, maxTokens: 500 }
    );
    
    return {
      success: true,
      content: result.content.trim() || originalContent,
      provider: result.provider,
      latencyMs: result.latencyMs,
    };
  } catch (error: any) {
    return {
      success: false,
      content: originalContent,
      error: error.message
    };
  }
}

export async function generateHashtags(
  content: string,
  platform: string,
  count: number = 5
): Promise<string[]> {
  try {
    const result = await chatWithFallback(
      [
        { 
          role: 'system', 
          content: `Generate ${count} relevant hashtags for the given content. Platform: ${platform}. Return only hashtags, one per line, including the # symbol.` 
        },
        { role: 'user', content: content }
      ],
      { temperature: 0.6, maxTokens: 100 }
    );
    
    const hashtags = result.content.trim().split('\n')
      .map(h => h.trim())
      .filter(h => h.startsWith('#'))
      .slice(0, count) || [];
    
    return hashtags;
  } catch (error) {
    console.error('[AI Content] Error generating hashtags:', error);
    return [];
  }
}

export async function suggestStreamIdeas(
  category: string,
  pastStreams?: string[],
  audience?: string
): Promise<string[]> {
  try {
    const result = await chatWithFallback(
      [
        { 
          role: 'system', 
          content: 'You are a stream content strategist. Suggest creative stream ideas that will engage viewers.' 
        },
        { 
          role: 'user', 
          content: `Generate 5 stream ideas for a ${category} streamer.
${audience ? `Target audience: ${audience}` : ''}
${pastStreams?.length ? `Recent streams (avoid repeating): ${pastStreams.join(', ')}` : ''}

For each idea, provide:
1. A catchy stream title
2. Brief description of the content/format
3. Why it would engage viewers

Format: One idea per paragraph, numbered 1-5.` 
        }
      ],
      { temperature: 0.9, maxTokens: 800 }
    );
    
    return [result.content.trim() || ''];
  } catch (error) {
    console.error('[AI Content] Error suggesting ideas:', error);
    return [];
  }
}
