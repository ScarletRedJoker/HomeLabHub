import { chat, type ChatMessage } from './client';

export interface WelcomeOptions {
  userName: string;
  userDisplayName: string;
  guildName: string;
  memberCount: number;
  rulesChannelId?: string;
  rolesChannelId?: string;
  introChannelId?: string;
  customPrompt?: string;
}

export interface WelcomeMessage {
  content: string;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

const DEFAULT_WELCOME_PROMPT = `You are a friendly Discord bot creating welcome messages for new members.

Create a warm, engaging welcome message that:
- Addresses the new member by name
- Welcomes them to the server
- Mentions they can find rules in the rules channel
- Encourages them to introduce themselves
- Uses 1-2 relevant emojis
- Is between 50-150 characters

Keep the tone friendly but not overly casual. Match the server's vibe.`;

const welcomeCache = new Map<string, { message: string; timestamp: number }>();
const CACHE_TTL = 300000; // 5 minutes
const VARIATION_PROMPTS = [
  'Be enthusiastic and upbeat',
  'Be warm and welcoming',
  'Be friendly and helpful',
  'Be casual and fun',
  'Be professional but warm'
];

function getCacheKey(options: WelcomeOptions): string {
  return `${options.guildName}:${options.userName}:${options.memberCount}`;
}

function getRandomVariation(): string {
  return VARIATION_PROMPTS[Math.floor(Math.random() * VARIATION_PROMPTS.length)];
}

export async function generateWelcome(options: WelcomeOptions): Promise<WelcomeMessage> {
  const cacheKey = getCacheKey(options);
  
  const variation = getRandomVariation();
  const systemPrompt = options.customPrompt || DEFAULT_WELCOME_PROMPT;

  const userPrompt = `Welcome ${options.userDisplayName} (username: ${options.userName}) to ${options.guildName}!
Server now has ${options.memberCount} members.
${options.rulesChannelId ? `Rules channel: <#${options.rulesChannelId}>` : ''}
${options.rolesChannelId ? `Roles channel: <#${options.rolesChannelId}>` : ''}
${options.introChannelId ? `Introductions channel: <#${options.introChannelId}>` : ''}

Style: ${variation}

Generate just the welcome message text, no JSON or formatting.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const response = await chat({
      messages,
      model: 'llama3.2:3b',
      temperature: 0.8
    });

    const content = response.content.trim();

    welcomeCache.set(cacheKey, { message: content, timestamp: Date.now() });

    return {
      content,
      embedTitle: `Welcome to ${options.guildName}!`,
      embedDescription: content,
      embedColor: 0x5865F2,
      fields: [
        ...(options.rulesChannelId ? [{
          name: '📜 Rules',
          value: `Check out <#${options.rulesChannelId}>`,
          inline: true
        }] : []),
        ...(options.introChannelId ? [{
          name: '👋 Introduce Yourself',
          value: `Say hi in <#${options.introChannelId}>`,
          inline: true
        }] : []),
        {
          name: '🎉 Member Count',
          value: `You're member #${options.memberCount}!`,
          inline: true
        }
      ]
    };
  } catch (error) {
    console.error('[Welcome] Generation error:', error);
    
    return {
      content: `Welcome to ${options.guildName}, ${options.userDisplayName}! 👋 We're glad you're here!`,
      embedTitle: `Welcome to ${options.guildName}!`,
      embedDescription: `Hey ${options.userDisplayName}, welcome to our community! Make sure to check out the rules and feel free to introduce yourself.`,
      embedColor: 0x5865F2
    };
  }
}

export async function generateGoodbye(
  userName: string,
  guildName: string,
  memberCount: number
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'Generate a brief goodbye message for someone leaving a Discord server. Keep it neutral and respectful, under 100 characters.'
    },
    {
      role: 'user',
      content: `${userName} has left ${guildName}. Server now has ${memberCount} members.`
    }
  ];

  try {
    const response = await chat({
      messages,
      model: 'llama3.2:3b',
      temperature: 0.7
    });

    return response.content.trim();
  } catch {
    return `${userName} has left the server. 👋`;
  }
}

export async function generateServerBoostMessage(
  userName: string,
  guildName: string,
  boostLevel: number,
  totalBoosts: number
): Promise<WelcomeMessage> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'Generate an enthusiastic thank you message for someone who boosted a Discord server. Use celebratory emojis, keep it under 200 characters.'
    },
    {
      role: 'user',
      content: `${userName} just boosted ${guildName}! Server is now at level ${boostLevel} with ${totalBoosts} total boosts.`
    }
  ];

  try {
    const response = await chat({
      messages,
      model: 'llama3.2:3b',
      temperature: 0.8
    });

    return {
      content: response.content.trim(),
      embedTitle: '🚀 Server Boosted!',
      embedDescription: response.content.trim(),
      embedColor: 0xF47FFF,
      fields: [
        { name: 'Booster', value: userName, inline: true },
        { name: 'Server Level', value: `Level ${boostLevel}`, inline: true },
        { name: 'Total Boosts', value: `${totalBoosts}`, inline: true }
      ]
    };
  } catch {
    return {
      content: `Thank you ${userName} for boosting ${guildName}! 🚀`,
      embedTitle: '🚀 Server Boosted!',
      embedDescription: `Thank you ${userName} for supporting our server!`,
      embedColor: 0xF47FFF
    };
  }
}

export function clearWelcomeCache(): void {
  welcomeCache.clear();
}

export const welcome = {
  generate: generateWelcome,
  generateGoodbye,
  generateBoostMessage: generateServerBoostMessage,
  clearCache: clearWelcomeCache
};

export default welcome;
