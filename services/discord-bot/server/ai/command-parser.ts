import { chat, type ChatMessage } from './client';

export type CommandIntent = 
  | 'REMINDER'
  | 'BAN'
  | 'MUTE'
  | 'KICK'
  | 'ANNOUNCE'
  | 'POLL'
  | 'EMBED'
  | 'ROLE'
  | 'CLEAR'
  | 'HELP'
  | 'UNKNOWN';

export interface ParsedCommand {
  intent: CommandIntent;
  confidence: number;
  params: Record<string, string | string[] | number | boolean>;
  originalMessage: string;
}

const COMMAND_PARSER_PROMPT = `You are a Discord bot command parser. Parse natural language into structured commands.

Return JSON only, no explanation:
{
  "intent": "REMINDER|BAN|MUTE|KICK|ANNOUNCE|POLL|EMBED|ROLE|CLEAR|HELP|UNKNOWN",
  "confidence": 0.0-1.0,
  "params": {
    // For REMINDER: { "target": "@user or @everyone", "when": "time expression", "message": "reminder text" }
    // For BAN/MUTE/KICK: { "user": "username or mention", "reason": "optional reason", "duration": "optional duration" }
    // For ANNOUNCE: { "channel": "channel name", "message": "announcement text" }
    // For POLL: { "question": "poll question", "options": ["option1", "option2", ...] }
    // For EMBED: { "title": "embed title", "description": "embed text", "color": "hex color" }
    // For ROLE: { "action": "add|remove", "user": "username", "role": "role name" }
    // For CLEAR: { "count": number, "channel": "optional channel" }
    // For HELP: { "topic": "optional topic" }
    // For UNKNOWN: { "query": "original text" }
  }
}

Examples:
- "remind everyone about the meeting tomorrow at 3pm" → REMINDER
- "ban user123 for spamming" → BAN
- "mute @toxic_user for 1 hour" → MUTE
- "announce in general that the server is updating" → ANNOUNCE
- "create a poll: favorite color? red, blue, green" → POLL
- "make an embed titled Welcome with blue color" → EMBED
- "give moderator role to @newmod" → ROLE
- "delete last 50 messages" → CLEAR

Parse this message:`;

const intentCache = new Map<string, { result: ParsedCommand; timestamp: number }>();
const CACHE_TTL = 300000; // 5 minutes

function getCacheKey(message: string): string {
  return message.toLowerCase().trim().replace(/\s+/g, ' ');
}

export async function parseCommand(message: string): Promise<ParsedCommand> {
  const cacheKey = getCacheKey(message);
  const cached = intentCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: COMMAND_PARSER_PROMPT },
    { role: 'user', content: message }
  ];

  try {
    const response = await chat({
      messages,
      model: 'llama3.2:3b',
      temperature: 0.3
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      intent?: string;
      confidence?: number;
      params?: Record<string, unknown>;
    };

    const result: ParsedCommand = {
      intent: (parsed.intent as CommandIntent) || 'UNKNOWN',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      params: (parsed.params as Record<string, string | string[] | number | boolean>) || {},
      originalMessage: message
    };

    intentCache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.error('[CommandParser] Parse error:', error);
    return {
      intent: 'UNKNOWN',
      confidence: 0,
      params: { query: message },
      originalMessage: message
    };
  }
}

export function clearCommandCache(): void {
  intentCache.clear();
}

export async function executeCommand(
  parsed: ParsedCommand,
  context: { guildId: string; channelId: string; userId: string }
): Promise<{ success: boolean; message: string; action?: string }> {
  const { intent, params, confidence } = parsed;

  if (confidence < 0.5) {
    return {
      success: false,
      message: `I'm not sure what you meant. Did you mean to ${intent.toLowerCase()}?`
    };
  }

  switch (intent) {
    case 'REMINDER':
      return {
        success: true,
        message: `Reminder set for ${params.target || 'you'} at ${params.when}: "${params.message}"`,
        action: 'CREATE_REMINDER'
      };

    case 'ANNOUNCE':
      return {
        success: true,
        message: `Announcement queued for ${params.channel}: "${params.message}"`,
        action: 'SEND_ANNOUNCEMENT'
      };

    case 'POLL':
      const options = Array.isArray(params.options) ? params.options : [];
      return {
        success: true,
        message: `Poll created: "${params.question}" with ${options.length} options`,
        action: 'CREATE_POLL'
      };

    case 'BAN':
    case 'MUTE':
    case 'KICK':
      return {
        success: true,
        message: `${intent} action prepared for ${params.user}${params.reason ? ` (Reason: ${params.reason})` : ''}`,
        action: `PREPARE_${intent}`
      };

    case 'ROLE':
      return {
        success: true,
        message: `Role ${params.action} ${params.role} ${params.action === 'add' ? 'to' : 'from'} ${params.user}`,
        action: 'MODIFY_ROLE'
      };

    case 'CLEAR':
      return {
        success: true,
        message: `Ready to clear ${params.count} messages${params.channel ? ` in ${params.channel}` : ''}`,
        action: 'CLEAR_MESSAGES'
      };

    case 'HELP':
      return {
        success: true,
        message: `Showing help${params.topic ? ` for ${params.topic}` : ''}`,
        action: 'SHOW_HELP'
      };

    default:
      return {
        success: false,
        message: "I couldn't understand that command. Try being more specific."
      };
  }
}

export const commandParser = {
  parse: parseCommand,
  execute: executeCommand,
  clearCache: clearCommandCache
};

export default commandParser;
