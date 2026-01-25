export { ai, chat, getProviderStatus, type ChatMessage, type ChatOptions, type ChatResponse } from './client';
export { commandParser, parseCommand, executeCommand, clearCommandCache, type CommandIntent, type ParsedCommand } from './command-parser';
export { moderation, checkMessage, checkBulkMessages, getUserViolationCount, clearModerationCache, type ModerationAction, type ModerationResult, type ModerationConfig } from './moderation';
export { contextManager, addMessage, getContext, clearContext, chatWithContext, buildChatMessages, detectTopicChange, getContextStats, cleanupExpiredContexts, type ChannelMessage, type ChannelContext } from './context';
export { welcome, generateWelcome, generateGoodbye, generateServerBoostMessage, clearWelcomeCache, type WelcomeOptions, type WelcomeMessage } from './welcome';

import { ai } from './client';
import { commandParser } from './command-parser';
import { moderation } from './moderation';
import { contextManager } from './context';
import { welcome } from './welcome';

const rateLimits = new Map<string, number>();
const RATE_LIMIT_MS = 5000; // 5 seconds per user

export function checkRateLimit(userId: string): boolean {
  const lastCall = rateLimits.get(userId);
  const now = Date.now();
  
  if (lastCall && now - lastCall < RATE_LIMIT_MS) {
    return false;
  }
  
  rateLimits.set(userId, now);
  return true;
}

export function getRateLimitRemaining(userId: string): number {
  const lastCall = rateLimits.get(userId);
  if (!lastCall) return 0;
  
  const remaining = RATE_LIMIT_MS - (Date.now() - lastCall);
  return Math.max(0, remaining);
}

export function clearRateLimits(): void {
  rateLimits.clear();
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of rateLimits.entries()) {
    if (now - timestamp > RATE_LIMIT_MS * 2) {
      rateLimits.delete(userId);
    }
  }
}, 60000);

export const discordAI = {
  client: ai,
  commands: commandParser,
  moderation,
  context: contextManager,
  welcome,
  
  checkRateLimit,
  getRateLimitRemaining,
  clearRateLimits,
  
  async getStatus() {
    const providerStatus = await ai.getProviderStatus();
    const contextStats = contextManager.getStats();
    
    return {
      providers: providerStatus,
      context: contextStats,
      rateLimit: {
        activeUsers: rateLimits.size,
        windowMs: RATE_LIMIT_MS
      }
    };
  }
};

export default discordAI;
