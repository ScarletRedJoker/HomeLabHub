import { chat, type ChatMessage } from './client';

export interface ChannelMessage {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: number;
}

export interface ChannelContext {
  channelId: string;
  guildId: string;
  messages: ChannelMessage[];
  lastUpdated: number;
  topic?: string;
}

const MAX_CONTEXT_MESSAGES = 10;
const CONTEXT_TTL = 60 * 60 * 1000; // 1 hour
const TOPIC_CHANGE_THRESHOLD = 0.7;

const contextStore = new Map<string, ChannelContext>();

export function getContextKey(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

export function addMessage(
  guildId: string,
  channelId: string,
  message: ChannelMessage
): void {
  const key = getContextKey(guildId, channelId);
  let context = contextStore.get(key);

  if (!context) {
    context = {
      channelId,
      guildId,
      messages: [],
      lastUpdated: Date.now()
    };
  }

  context.messages.push(message);
  
  if (context.messages.length > MAX_CONTEXT_MESSAGES) {
    context.messages = context.messages.slice(-MAX_CONTEXT_MESSAGES);
  }

  context.lastUpdated = Date.now();
  contextStore.set(key, context);
}

export function getContext(guildId: string, channelId: string): ChannelContext | null {
  const key = getContextKey(guildId, channelId);
  const context = contextStore.get(key);

  if (!context) return null;

  if (Date.now() - context.lastUpdated > CONTEXT_TTL) {
    contextStore.delete(key);
    return null;
  }

  return context;
}

export function clearContext(guildId: string, channelId: string): void {
  const key = getContextKey(guildId, channelId);
  contextStore.delete(key);
}

export function clearAllContexts(): void {
  contextStore.clear();
}

export function buildChatMessages(
  context: ChannelContext | null,
  systemPrompt: string,
  currentMessage: string
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt }
  ];

  if (context && context.messages.length > 0) {
    for (const msg of context.messages.slice(-5)) {
      messages.push({
        role: 'user',
        content: `${msg.authorName}: ${msg.content}`
      });
    }
  }

  messages.push({ role: 'user', content: currentMessage });

  return messages;
}

export async function chatWithContext(
  guildId: string,
  channelId: string,
  userId: string,
  userName: string,
  message: string,
  botPersonality: string = 'You are a helpful Discord bot assistant.'
): Promise<string> {
  const context = getContext(guildId, channelId);

  addMessage(guildId, channelId, {
    id: `${Date.now()}`,
    authorId: userId,
    authorName: userName,
    content: message,
    timestamp: Date.now()
  });

  const systemPrompt = `${botPersonality}

You are chatting in a Discord server. Be conversational, helpful, and match the tone of the conversation. Keep responses concise (under 300 characters unless more detail is needed).

${context?.topic ? `Current conversation topic: ${context.topic}` : ''}`;

  const messages = buildChatMessages(context, systemPrompt, `${userName}: ${message}`);

  try {
    const response = await chat({
      messages,
      model: 'llama3.2:3b',
      temperature: 0.7
    });

    addMessage(guildId, channelId, {
      id: `bot_${Date.now()}`,
      authorId: 'bot',
      authorName: 'Bot',
      content: response.content,
      timestamp: Date.now()
    });

    return response.content;
  } catch (error) {
    console.error('[Context] Chat error:', error);
    return "I'm having trouble responding right now. Please try again later.";
  }
}

export async function detectTopicChange(
  previousMessages: string[],
  newMessage: string
): Promise<boolean> {
  if (previousMessages.length < 3) return false;

  const recentContext = previousMessages.slice(-5).join('\n');
  
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'Determine if the new message represents a topic change from the conversation. Return only "true" or "false".'
    },
    {
      role: 'user',
      content: `Previous conversation:\n${recentContext}\n\nNew message: ${newMessage}`
    }
  ];

  try {
    const response = await chat({
      messages,
      model: 'llama3.2:3b',
      temperature: 0.1
    });

    return response.content.toLowerCase().includes('true');
  } catch {
    return false;
  }
}

export function getContextStats(): {
  activeChannels: number;
  totalMessages: number;
  oldestContext: number | null;
} {
  let totalMessages = 0;
  let oldestContext: number | null = null;

  for (const context of contextStore.values()) {
    totalMessages += context.messages.length;
    if (!oldestContext || context.lastUpdated < oldestContext) {
      oldestContext = context.lastUpdated;
    }
  }

  return {
    activeChannels: contextStore.size,
    totalMessages,
    oldestContext
  };
}

export function cleanupExpiredContexts(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, context] of contextStore.entries()) {
    if (now - context.lastUpdated > CONTEXT_TTL) {
      contextStore.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

setInterval(cleanupExpiredContexts, 5 * 60 * 1000);

export const contextManager = {
  add: addMessage,
  get: getContext,
  clear: clearContext,
  clearAll: clearAllContexts,
  chat: chatWithContext,
  buildMessages: buildChatMessages,
  detectTopicChange,
  getStats: getContextStats,
  cleanup: cleanupExpiredContexts
};

export default contextManager;
