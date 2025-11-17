import OpenAI from "openai";
import type { ModerationRule, LinkWhitelist } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export type ModerationDecision = {
  allow: boolean;
  action: "allow" | "warn" | "timeout" | "ban";
  ruleTriggered?: string;
  severity?: "low" | "medium" | "high";
  reason?: string;
  timeoutDuration?: number;
};

interface MessageCache {
  result: any;
  timestamp: number;
}

class ModerationService {
  private messageCache: Map<string, MessageCache> = new Map();
  private readonly CACHE_TTL = 3600000;
  private userMessageHistory: Map<string, { messages: string[], timestamps: number[] }> = new Map();
  private readonly SPAM_WINDOW = 30000;
  private readonly SPAM_THRESHOLD = 5;

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, cache] of Array.from(this.messageCache.entries())) {
      if (now - cache.timestamp > this.CACHE_TTL) {
        this.messageCache.delete(key);
      }
    }
  }

  async checkMessage(
    message: string,
    username: string,
    rules: ModerationRule[],
    whitelist: LinkWhitelist[],
    bannedWords?: string[]
  ): Promise<ModerationDecision> {
    this.cleanCache();

    // Check banned words first (if provided)
    if (bannedWords && bannedWords.length > 0) {
      const bannedWordDecision = this.checkBannedWords(message, bannedWords);
      if (!bannedWordDecision.allow) {
        return bannedWordDecision;
      }
    }

    const enabledRules = rules.filter(r => r.isEnabled);
    
    for (const rule of enabledRules) {
      let decision: ModerationDecision | null = null;

      switch (rule.ruleType) {
        case "toxic":
          decision = await this.checkToxic(message, rule);
          break;
        case "spam":
          decision = this.checkSpam(message, username, rule);
          break;
        case "links":
          decision = this.checkLinks(message, whitelist, rule);
          break;
        case "caps":
          decision = this.checkCaps(message, rule);
          break;
        case "symbols":
          decision = this.checkSymbols(message, rule);
          break;
      }

      if (decision && !decision.allow) {
        return decision;
      }
    }

    return { allow: true, action: "allow" };
  }

  private async checkToxic(
    message: string,
    rule: ModerationRule
  ): Promise<ModerationDecision> {
    try {
      const cacheKey = `toxic:${message.toLowerCase()}`;
      const cached = this.messageCache.get(cacheKey);
      
      if (cached) {
        const result = cached.result;
        return this.processOpenAIResult(result, rule);
      }

      const moderation = await openai.moderations.create({
        input: message,
      });

      const result = moderation.results[0];
      this.messageCache.set(cacheKey, { result, timestamp: Date.now() });

      return this.processOpenAIResult(result, rule);
    } catch (error: any) {
      console.error("[ModerationService] OpenAI Moderation API error:", error);
      
      if (error.message?.includes("429") || error.message?.includes("rate limit")) {
        return {
          allow: true,
          action: "allow",
          reason: "Rate limit - allowing message"
        };
      }
      
      return { allow: true, action: "allow" };
    }
  }

  private processOpenAIResult(
    result: any,
    rule: ModerationRule
  ): ModerationDecision {
    if (!result.flagged) {
      return { allow: true, action: "allow" };
    }

    const categories = result.categories || {};
    const scores = result.category_scores || {};
    
    const triggeredCategories: string[] = [];
    let maxScore = 0;

    for (const [category, isFlagged] of Object.entries(categories)) {
      if (isFlagged) {
        triggeredCategories.push(category);
        const score = scores[category] || 0;
        maxScore = Math.max(maxScore, score);
      }
    }

    if (triggeredCategories.length === 0) {
      return { allow: true, action: "allow" };
    }

    let severity: "low" | "medium" | "high" = "low";
    if (maxScore > 0.8) {
      severity = "high";
    } else if (maxScore > 0.5) {
      severity = "medium";
    }

    const shouldTrigger = this.checkSeverityThreshold(severity, rule.severity as "low" | "medium" | "high");
    
    if (!shouldTrigger) {
      return { allow: true, action: "allow" };
    }

    return {
      allow: false,
      action: rule.action as "warn" | "timeout" | "ban" | "allow",
      ruleTriggered: "toxic",
      severity,
      reason: `Toxic content detected: ${triggeredCategories.join(", ")}`,
      timeoutDuration: rule.timeoutDuration || 60
    };
  }

  private checkSpam(
    message: string,
    username: string,
    rule: ModerationRule
  ): ModerationDecision {
    const now = Date.now();
    const userKey = `${username}:spam`;
    
    if (!this.userMessageHistory.has(userKey)) {
      this.userMessageHistory.set(userKey, { messages: [], timestamps: [] });
    }
    
    const history = this.userMessageHistory.get(userKey)!;
    
    history.timestamps = history.timestamps.filter(t => now - t < this.SPAM_WINDOW);
    history.messages = history.messages.slice(-this.SPAM_THRESHOLD);
    
    history.messages.push(message);
    history.timestamps.push(now);
    
    if (history.timestamps.length >= this.SPAM_THRESHOLD) {
      const uniqueMessages = new Set(history.messages.slice(-this.SPAM_THRESHOLD));
      
      if (uniqueMessages.size <= 2) {
        return {
          allow: false,
          action: rule.action as "warn" | "timeout" | "ban" | "allow",
          ruleTriggered: "spam",
          severity: rule.severity as "low" | "medium" | "high" | undefined,
          reason: "Repetitive messages detected",
          timeoutDuration: rule.timeoutDuration || 60
        };
      }
    }
    
    // Count emojis using character ranges that work without ES6 unicode flag
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;
    const emojis = message.match(emojiRegex);
    const emojiCount = emojis ? emojis.length : 0;
    
    if (emojiCount > 10) {
      return {
        allow: false,
        action: rule.action as "warn" | "timeout" | "ban" | "allow",
        ruleTriggered: "spam",
        severity: rule.severity as "low" | "medium" | "high" | undefined,
        reason: "Excessive emojis detected",
        timeoutDuration: rule.timeoutDuration || 60
      };
    }

    return { allow: true, action: "allow" };
  }

  private checkLinks(
    message: string,
    whitelist: LinkWhitelist[],
    rule: ModerationRule
  ): ModerationDecision {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|tv|gg|me|co)[^\s]*)/gi;
    const urls = message.match(urlRegex);
    
    if (!urls || urls.length === 0) {
      return { allow: true, action: "allow" };
    }

    const whitelistedDomains = whitelist.map(w => w.domain.toLowerCase());
    
    for (const url of urls) {
      let domain: string;
      try {
        if (url.startsWith('http')) {
          domain = new URL(url).hostname;
        } else if (url.startsWith('www.')) {
          domain = url.split('/')[0];
        } else {
          const match = url.match(/^([a-zA-Z0-9-]+\.[a-zA-Z]+)/);
          domain = match ? match[1] : url.split('/')[0];
        }
        
        domain = domain.replace(/^www\./, '').toLowerCase();
      } catch (e) {
        continue;
      }

      const isWhitelisted = whitelistedDomains.some(wd => {
        return domain === wd || domain.endsWith(`.${wd}`);
      });

      if (!isWhitelisted) {
        return {
          allow: false,
          action: rule.action as "warn" | "timeout" | "ban" | "allow",
          ruleTriggered: "links",
          severity: rule.severity as "low" | "medium" | "high" | undefined,
          reason: `Unauthorized link detected: ${domain}`,
          timeoutDuration: rule.timeoutDuration || 60
        };
      }
    }

    return { allow: true, action: "allow" };
  }

  private checkBannedWords(
    message: string,
    bannedWords: string[]
  ): ModerationDecision {
    const lowerMessage = message.toLowerCase();
    
    for (const word of bannedWords) {
      const lowerWord = word.toLowerCase().trim();
      if (!lowerWord) continue;
      
      const wordRegex = new RegExp(`\\b${lowerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (wordRegex.test(message)) {
        return {
          allow: false,
          action: "timeout",
          ruleTriggered: "banned_words",
          severity: "high",
          reason: `Banned word detected: ${word}`,
          timeoutDuration: 300
        };
      }
    }

    return { allow: true, action: "allow" };
  }

  private checkCaps(
    message: string,
    rule: ModerationRule
  ): ModerationDecision {
    if (message.length < 10) {
      return { allow: true, action: "allow" };
    }

    const letters = message.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 5) {
      return { allow: true, action: "allow" };
    }

    const uppercase = message.replace(/[^A-Z]/g, '');
    const capsPercentage = (uppercase.length / letters.length) * 100;

    if (capsPercentage > 50) {
      return {
        allow: false,
        action: rule.action as "warn" | "timeout" | "ban" | "allow",
        ruleTriggered: "caps",
        severity: rule.severity as "low" | "medium" | "high" | undefined,
        reason: `Excessive caps detected (${Math.round(capsPercentage)}%)`,
        timeoutDuration: rule.timeoutDuration || 60
      };
    }

    return { allow: true, action: "allow" };
  }

  private checkSymbols(
    message: string,
    rule: ModerationRule
  ): ModerationDecision {
    const repeatedCharRegex = /(.)\1{4,}/g;
    const matches = message.match(repeatedCharRegex);
    
    if (matches && matches.length > 0) {
      return {
        allow: false,
        action: rule.action as "warn" | "timeout" | "ban" | "allow",
        ruleTriggered: "symbols",
        severity: rule.severity as "low" | "medium" | "high" | undefined,
        reason: "Repeated characters/symbol spam detected",
        timeoutDuration: rule.timeoutDuration || 60
      };
    }

    // Count symbols excluding word characters, whitespace, and common emojis
    const symbolRegex = /[^\w\s\uD800-\uDBFF\uDC00-\uDFFF\u2600-\u27BF]/g;
    const symbols = message.match(symbolRegex);
    const symbolCount = symbols ? symbols.length : 0;
    const totalChars = message.length;
    
    if (totalChars > 0 && (symbolCount / totalChars) > 0.3) {
      return {
        allow: false,
        action: rule.action as "warn" | "timeout" | "ban" | "allow",
        ruleTriggered: "symbols",
        severity: rule.severity as "low" | "medium" | "high" | undefined,
        reason: "Excessive symbols detected",
        timeoutDuration: rule.timeoutDuration || 60
      };
    }

    return { allow: true, action: "allow" };
  }

  private checkSeverityThreshold(
    detectedSeverity: "low" | "medium" | "high",
    ruleSeverity: "low" | "medium" | "high"
  ): boolean {
    const severityLevels = { low: 1, medium: 2, high: 3 };
    return severityLevels[detectedSeverity] >= severityLevels[ruleSeverity];
  }

  clearUserHistory(username: string): void {
    const userKey = `${username}:spam`;
    this.userMessageHistory.delete(userKey);
  }
}

export const moderationService = new ModerationService();
