import { generateContent } from '../ai-content-service';

export interface StreamInfo {
  title: string;
  game: string;
  startTime: string;
  duration?: string;
  streamUrl?: string;
  thumbnailUrl?: string;
}

export interface SocialPost {
  content: string;
  platform: string;
  hashtags: string[];
  characterCount: number;
  withinLimit: boolean;
}

export type SocialPlatform = 'twitter' | 'discord' | 'instagram' | 'facebook' | 'threads';

const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  twitter: 280,
  discord: 2000,
  instagram: 2200,
  facebook: 63206,
  threads: 500
};

const PLATFORM_STYLES: Record<SocialPlatform, string> = {
  twitter: 'Concise, punchy, use 2-3 hashtags. Under 280 chars. Link at end.',
  discord: 'Use Discord markdown (bold, italics). More detailed. Include @everyone if important.',
  instagram: 'Engaging, visual-focused. 5-10 hashtags in a separate block at the end.',
  facebook: 'Conversational, can be longer. Ask engaging questions.',
  threads: 'Casual, conversational. Similar to Twitter but can be slightly longer.'
};

export async function createGoLivePost(
  stream: StreamInfo,
  platform: SocialPlatform
): Promise<SocialPost> {
  const limit = PLATFORM_LIMITS[platform];
  const style = PLATFORM_STYLES[platform];

  const prompt = `Create a ${platform} go-live announcement:

Stream Info:
- Title: ${stream.title}
- Game: ${stream.game}
- Starting: ${stream.startTime}
${stream.streamUrl ? `- Link: ${stream.streamUrl}` : ''}

Style: ${style}

${platform === 'twitter' ? 'MUST be under 280 characters including link and hashtags.' : ''}
${platform === 'discord' ? 'Use **bold** and other Discord formatting.' : ''}

Return ONLY the post text.`;

  try {
    const result = await generateContent({
      type: 'social_post',
      platform: platform === 'threads' ? 'twitter' : platform,
      gameOrCategory: stream.game,
      tone: 'hype',
      context: prompt,
      maxLength: limit
    });

    const content = result.success ? result.content.trim() : getDefaultGoLive(stream, platform);
    const hashtags = content.match(/#\w+/g) || [];

    return {
      content,
      platform,
      hashtags,
      characterCount: content.length,
      withinLimit: content.length <= limit
    };
  } catch (error) {
    console.error('[SocialGenerator] Error:', error);
    const content = getDefaultGoLive(stream, platform);
    return {
      content,
      platform,
      hashtags: [],
      characterCount: content.length,
      withinLimit: content.length <= limit
    };
  }
}

function getDefaultGoLive(stream: StreamInfo, platform: SocialPlatform): string {
  const base = `🔴 LIVE NOW! Playing ${stream.game}\n\n${stream.title}`;
  
  if (platform === 'discord') {
    return `🔴 **LIVE NOW!**\n\nPlaying **${stream.game}**\n\n> ${stream.title}\n\n${stream.streamUrl || 'Link in bio!'}`;
  }
  
  if (platform === 'twitter') {
    return `🔴 LIVE NOW!\n\n${stream.title}\n\nPlaying ${stream.game} 🎮\n\n${stream.streamUrl || ''} #Twitch #Live`;
  }
  
  return `${base}\n\n${stream.streamUrl || 'Link in bio!'}`;
}

export async function createStreamEndPost(
  stream: StreamInfo & { highlights?: string[]; viewerCount?: number }
): Promise<SocialPost> {
  const prompt = `Create a stream recap post for Twitter:

Stream: ${stream.title}
Game: ${stream.game}
Duration: ${stream.duration || 'Unknown'}
${stream.viewerCount ? `Peak viewers: ${stream.viewerCount}` : ''}
${stream.highlights?.length ? `Highlights: ${stream.highlights.join(', ')}` : ''}

Style: Grateful, engaging, tease next stream. Under 280 chars.`;

  try {
    const result = await generateContent({
      type: 'social_post',
      platform: 'twitter',
      gameOrCategory: stream.game,
      tone: 'casual',
      context: prompt
    });

    const content = result.success 
      ? result.content.trim()
      : `Thanks for hanging out! 💜 Great ${stream.game} session today. See you next time! #Twitch #Gaming`;

    return {
      content,
      platform: 'twitter',
      hashtags: content.match(/#\w+/g) || [],
      characterCount: content.length,
      withinLimit: content.length <= 280
    };
  } catch {
    const content = `Thanks for watching! 💜 Great ${stream.game} stream today. #Twitch`;
    return {
      content,
      platform: 'twitter',
      hashtags: ['#Twitch'],
      characterCount: content.length,
      withinLimit: true
    };
  }
}

export async function createSchedulePost(
  schedule: Array<{ day: string; time: string; game: string }>,
  platform: SocialPlatform
): Promise<SocialPost> {
  const scheduleText = schedule
    .map(s => `${s.day} ${s.time} - ${s.game}`)
    .join('\n');

  const prompt = `Create a weekly schedule announcement for ${platform}:

Schedule:
${scheduleText}

Style: ${PLATFORM_STYLES[platform]}
Make it engaging and easy to read.`;

  try {
    const result = await generateContent({
      type: 'schedule_post',
      platform: platform === 'threads' ? 'twitter' : platform,
      tone: 'casual',
      context: prompt
    });

    const content = result.success ? result.content.trim() : `📅 This Week's Schedule:\n\n${scheduleText}`;
    
    return {
      content,
      platform,
      hashtags: content.match(/#\w+/g) || [],
      characterCount: content.length,
      withinLimit: content.length <= PLATFORM_LIMITS[platform]
    };
  } catch {
    const content = `📅 Stream Schedule:\n\n${scheduleText}`;
    return {
      content,
      platform,
      hashtags: [],
      characterCount: content.length,
      withinLimit: true
    };
  }
}

export async function generateAllPlatformPosts(
  stream: StreamInfo
): Promise<Map<SocialPlatform, SocialPost>> {
  const platforms: SocialPlatform[] = ['twitter', 'discord', 'instagram'];
  const results = new Map<SocialPlatform, SocialPost>();

  const promises = platforms.map(async (platform) => {
    const post = await createGoLivePost(stream, platform);
    results.set(platform, post);
  });

  await Promise.all(promises);
  return results;
}

export const socialGenerator = {
  goLive: createGoLivePost,
  streamEnd: createStreamEndPost,
  schedule: createSchedulePost,
  allPlatforms: generateAllPlatformPosts
};

export default socialGenerator;
