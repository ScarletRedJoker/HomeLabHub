import { generateContent } from '../ai-content-service';

export interface ClipDescription {
  description: string;
  hashtags: string[];
  platform: string;
}

export interface ClipWriterOptions {
  clipUrl?: string;
  context: string;
  game?: string;
  platform?: 'twitter' | 'youtube' | 'instagram' | 'tiktok' | 'discord';
  style?: 'viral' | 'professional' | 'meme' | 'hype';
  includeHashtags?: boolean;
  maxLength?: number;
}

const STYLE_PROMPTS: Record<string, string> = {
  viral: 'Write like a viral clip caption - exciting, meme-friendly, shareable. Use caps for emphasis.',
  professional: 'Write a clean, professional caption suitable for esports or brand content.',
  meme: 'Write a meme-style caption with internet humor and references.',
  hype: 'Write an extremely hyped caption with lots of energy and exclamation marks.'
};

const PLATFORM_LIMITS: Record<string, number> = {
  twitter: 250,
  youtube: 500,
  instagram: 2200,
  tiktok: 150,
  discord: 1000
};

export async function describeClip(options: ClipWriterOptions): Promise<ClipDescription> {
  const {
    context,
    game,
    platform = 'twitter',
    style = 'viral',
    includeHashtags = true,
    maxLength = PLATFORM_LIMITS[platform] || 250
  } = options;

  const hashtags = game 
    ? [`#${game.replace(/\s+/g, '')}`, '#GamingClips', '#Twitch']
    : ['#GamingClips', '#Twitch'];

  const prompt = `Write a ${platform} clip description for this gaming moment:

Context: ${context}
${game ? `Game: ${game}` : ''}
Style: ${STYLE_PROMPTS[style] || style}
Max length: ${maxLength - (includeHashtags ? 50 : 0)} characters (leave room for hashtags)

${includeHashtags ? 'Include 2-4 relevant hashtags at the end.' : 'No hashtags.'}

Examples of good clip captions:
- "🔥 UNBELIEVABLE 1v5 ACE! This round had me SHOOK 😱 #Valorant #GamingClips"
- "When the timing is PERFECT 💀 My jaw DROPPED #Warzone #ClutchMoment"
- "They really thought they had me... 😏 #Apex #GamingHighlights"

Return ONLY the caption text, nothing else.`;

  try {
    const result = await generateContent({
      type: 'clip_caption',
      platform: platform === 'twitter' ? 'twitter' : 'youtube',
      gameOrCategory: game,
      tone: style === 'meme' ? 'funny' : style === 'professional' ? 'professional' : 'hype',
      context: prompt,
      maxLength
    });

    if (!result.success || !result.content) {
      return {
        description: `${context} 🔥`,
        hashtags,
        platform
      };
    }

    let description = result.content.trim();
    
    const hashtagMatch = description.match(/#\w+/g);
    const extractedHashtags = hashtagMatch ? hashtagMatch.slice(0, 5) : [];
    
    description = description.replace(/#\w+\s*/g, '').trim();
    
    if (description.length > maxLength) {
      description = description.substring(0, maxLength - 3) + '...';
    }

    return {
      description,
      hashtags: extractedHashtags.length > 0 ? extractedHashtags : hashtags,
      platform
    };
  } catch (error) {
    console.error('[ClipWriter] Error:', error);
    return {
      description: `${context} 🔥`,
      hashtags,
      platform
    };
  }
}

export async function generateClipVariations(
  context: string,
  platforms: string[]
): Promise<Map<string, ClipDescription>> {
  const results = new Map<string, ClipDescription>();
  
  const promises = platforms.map(async (platform) => {
    const desc = await describeClip({
      context,
      platform: platform as ClipWriterOptions['platform']
    });
    results.set(platform, desc);
  });

  await Promise.all(promises);
  return results;
}

export async function improveClipDescription(
  original: string,
  feedback: string
): Promise<string> {
  const prompt = `Improve this clip description based on feedback:

Original: "${original}"
Feedback: "${feedback}"

Return ONLY the improved description.`;

  try {
    const result = await generateContent({
      type: 'clip_caption',
      context: prompt,
      existingContent: original
    });

    return result.success ? result.content : original;
  } catch {
    return original;
  }
}

export const clipWriter = {
  describe: describeClip,
  variations: generateClipVariations,
  improve: improveClipDescription
};

export default clipWriter;
