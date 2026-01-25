import { chat, type ChatMessage } from './client';

export type ModerationAction = 'ALLOW' | 'WARN' | 'DELETE' | 'MUTE' | 'BAN';

export interface ModerationResult {
  action: ModerationAction;
  score: number;
  reason: string;
  categories: string[];
  timestamp: string;
}

export interface ModerationConfig {
  warnThreshold: number;
  deleteThreshold: number;
  muteThreshold: number;
  banThreshold: number;
  enableAI: boolean;
  bypassRoles: string[];
}

const DEFAULT_CONFIG: ModerationConfig = {
  warnThreshold: 5,
  deleteThreshold: 7,
  muteThreshold: 8,
  banThreshold: 9,
  enableAI: true,
  bypassRoles: []
};

const MODERATION_PROMPT = `You are a Discord content moderation AI. Analyze messages for rule violations.

Rate the message toxicity from 0-10:
- 0-4: Normal/acceptable content
- 5-6: Borderline, may warrant a warning
- 7-8: Clearly inappropriate, should be removed
- 9-10: Severe violation (hate speech, threats, etc.)

Categories to check:
- SPAM: Repetitive content, excessive caps, link spam
- TOXICITY: Insults, harassment, hostile behavior
- HATE_SPEECH: Discrimination, slurs, targeted harassment
- NSFW: Adult content, suggestive material
- THREATS: Violence, doxxing, real-world threats
- SCAM: Phishing, fake giveaways, suspicious links
- SELF_HARM: Content promoting self-harm

Return JSON only:
{
  "score": 0-10,
  "reason": "brief explanation",
  "categories": ["CATEGORY1", "CATEGORY2"]
}`;

const moderationCache = new Map<string, { result: ModerationResult; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

function hashMessage(content: string): string {
  return content.toLowerCase().trim().substring(0, 100);
}

export async function checkMessage(
  content: string,
  config: Partial<ModerationConfig> = {}
): Promise<ModerationResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enableAI) {
    return {
      action: 'ALLOW',
      score: 0,
      reason: 'AI moderation disabled',
      categories: [],
      timestamp: new Date().toISOString()
    };
  }

  const hash = hashMessage(content);
  const cached = moderationCache.get(hash);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: MODERATION_PROMPT },
    { role: 'user', content }
  ];

  try {
    const response = await chat({
      messages,
      model: 'llama3.2:3b',
      temperature: 0.1
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      score?: number;
      reason?: string;
      categories?: string[];
    };

    const score = typeof parsed.score === 'number' ? Math.min(10, Math.max(0, parsed.score)) : 0;
    
    let action: ModerationAction = 'ALLOW';
    if (score >= finalConfig.banThreshold) {
      action = 'BAN';
    } else if (score >= finalConfig.muteThreshold) {
      action = 'MUTE';
    } else if (score >= finalConfig.deleteThreshold) {
      action = 'DELETE';
    } else if (score >= finalConfig.warnThreshold) {
      action = 'WARN';
    }

    const result: ModerationResult = {
      action,
      score,
      reason: parsed.reason || 'No reason provided',
      categories: parsed.categories || [],
      timestamp: new Date().toISOString()
    };

    moderationCache.set(hash, { result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.error('[Moderation] Check error:', error);
    return {
      action: 'ALLOW',
      score: 0,
      reason: 'Moderation check failed',
      categories: [],
      timestamp: new Date().toISOString()
    };
  }
}

export async function checkBulkMessages(
  messages: Array<{ id: string; content: string; authorId: string }>,
  config: Partial<ModerationConfig> = {}
): Promise<Map<string, ModerationResult>> {
  const results = new Map<string, ModerationResult>();
  
  const checks = messages.map(async (msg) => {
    const result = await checkMessage(msg.content, config);
    results.set(msg.id, result);
  });

  await Promise.all(checks);
  return results;
}

export function getUserViolationCount(
  userId: string,
  history: Array<{ userId: string; action: ModerationAction; timestamp: string }>
): { total: number; recent: number; severity: 'low' | 'medium' | 'high' } {
  const userHistory = history.filter(h => h.userId === userId && h.action !== 'ALLOW');
  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
  const recent = userHistory.filter(h => new Date(h.timestamp).getTime() > recentCutoff);

  const total = userHistory.length;
  const recentCount = recent.length;

  let severity: 'low' | 'medium' | 'high' = 'low';
  if (recentCount >= 5 || total >= 10) {
    severity = 'high';
  } else if (recentCount >= 3 || total >= 5) {
    severity = 'medium';
  }

  return { total, recent: recentCount, severity };
}

export function clearModerationCache(): void {
  moderationCache.clear();
}

export const moderation = {
  check: checkMessage,
  checkBulk: checkBulkMessages,
  getViolationCount: getUserViolationCount,
  clearCache: clearModerationCache,
  DEFAULT_CONFIG
};

export default moderation;
