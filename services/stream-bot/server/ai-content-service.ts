/**
 * AI Content Assistant Service
 * Generates stream titles, descriptions, social media posts, and more
 */
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

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
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 500
    });
    
    const content = response.choices[0]?.message?.content?.trim() || '';
    
    if (request.type === 'title') {
      const lines = content.split('\n').filter(l => l.trim());
      return {
        success: true,
        content: lines[0] || content,
        alternatives: lines.slice(1)
      };
    }
    
    return {
      success: true,
      content
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are a helpful content editor for streamers. Improve the given content based on the instruction. Return only the improved content, no explanations.' 
        },
        { 
          role: 'user', 
          content: `Original content:\n${originalContent}\n\nInstruction: ${instruction}` 
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    return {
      success: true,
      content: response.choices[0]?.message?.content?.trim() || originalContent
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: `Generate ${count} relevant hashtags for the given content. Platform: ${platform}. Return only hashtags, one per line, including the # symbol.` 
        },
        { role: 'user', content: content }
      ],
      temperature: 0.6,
      max_tokens: 100
    });
    
    const hashtags = response.choices[0]?.message?.content?.trim().split('\n')
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
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
      temperature: 0.9,
      max_tokens: 800
    });
    
    return [response.choices[0]?.message?.content?.trim() || ''];
  } catch (error) {
    console.error('[AI Content] Error suggesting ideas:', error);
    return [];
  }
}
