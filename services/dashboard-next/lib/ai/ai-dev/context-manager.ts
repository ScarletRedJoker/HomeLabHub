/**
 * AI Developer Context Manager - Memory management for multi-turn agent sessions
 * Maintains context across multiple tool calls and remembers important codebase information
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface FileReadRecord {
  content: string;
  lastRead: Date;
  tokenCount?: number;
}

export interface SearchResultRecord {
  query: string;
  results: unknown[];
  timestamp: Date;
}

export interface DecisionRecord {
  step: number;
  action: string;
  reasoning: string;
  timestamp: Date;
}

export interface FindingRecord {
  type: string;
  description: string;
  relatedFiles: string[];
  timestamp: Date;
}

export interface AgentContext {
  jobId: string;
  sessionId: string;
  startedAt: Date;
  lastUpdated: Date;
  
  exploredPaths: string[];
  readFiles: Map<string, FileReadRecord>;
  searchResults: SearchResultRecord[];
  
  decisions: DecisionRecord[];
  
  findings: FindingRecord[];
  
  messageSummary: string;
  totalTokensUsed: number;
  
  metadata?: Record<string, unknown>;
}

export interface ContextSummary {
  filesAnalyzed: number;
  keyFindings: string[];
  pendingTasks: string[];
  currentFocus: string;
  recentDecisions: string[];
  exploredAreas: string[];
  tokenBudgetUsed: number;
}

export interface ContextUpdateParams {
  exploredPaths?: string[];
  messageSummary?: string;
  totalTokensUsed?: number;
  metadata?: Record<string, unknown>;
}

interface SerializedContext {
  jobId: string;
  sessionId: string;
  startedAt: string;
  lastUpdated: string;
  exploredPaths: string[];
  readFiles: Array<[string, FileReadRecord & { lastRead: string }]>;
  searchResults: Array<SearchResultRecord & { timestamp: string }>;
  decisions: Array<DecisionRecord & { timestamp: string }>;
  findings: Array<FindingRecord & { timestamp: string }>;
  messageSummary: string;
  totalTokensUsed: number;
  metadata?: Record<string, unknown>;
}

const MAX_FILE_CONTENT_LENGTH = 10000;
const MAX_SEARCH_RESULTS_STORED = 20;
const MAX_DECISIONS_STORED = 50;
const MAX_FINDINGS_STORED = 100;
const MAX_FILE_CACHE_SIZE = 50;
const TOKEN_BUDGET_WARNING_THRESHOLD = 50000;
const CONTEXT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REDIS_KEY_PREFIX = 'ai-dev:context:';

export class ContextManager {
  private contexts: Map<string, AgentContext> = new Map();
  private redis: Redis | null = null;
  private redisAvailable: boolean = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.log('[ContextManager] Redis not configured, using in-memory storage only');
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

      await this.redis.connect();
      this.redisAvailable = true;
      console.log('[ContextManager] Redis connection established');
    } catch (error) {
      console.warn('[ContextManager] Redis connection failed, using in-memory storage:', error);
      this.redis = null;
      this.redisAvailable = false;
    }
  }

  createContext(jobId: string): AgentContext {
    const context: AgentContext = {
      jobId,
      sessionId: uuidv4(),
      startedAt: new Date(),
      lastUpdated: new Date(),
      exploredPaths: [],
      readFiles: new Map(),
      searchResults: [],
      decisions: [],
      findings: [],
      messageSummary: '',
      totalTokensUsed: 0,
    };

    this.contexts.set(jobId, context);
    this.persistContext(jobId, context);

    return context;
  }

  async getContext(jobId: string): Promise<AgentContext | null> {
    let context = this.contexts.get(jobId);

    if (!context && this.redisAvailable && this.redis) {
      try {
        const serialized = await this.redis.get(`${REDIS_KEY_PREFIX}${jobId}`);
        if (serialized) {
          context = this.deserializeContext(JSON.parse(serialized));
          this.contexts.set(jobId, context);
        }
      } catch (error) {
        console.warn('[ContextManager] Failed to load context from Redis:', error);
      }
    }

    return context || null;
  }

  async updateContext(jobId: string, updates: ContextUpdateParams): Promise<AgentContext | null> {
    const context = await this.getContext(jobId);
    if (!context) return null;

    if (updates.exploredPaths) {
      const newPaths = updates.exploredPaths.filter(
        p => !context.exploredPaths.includes(p)
      );
      context.exploredPaths.push(...newPaths);
    }

    if (updates.messageSummary !== undefined) {
      context.messageSummary = updates.messageSummary;
    }

    if (updates.totalTokensUsed !== undefined) {
      context.totalTokensUsed = updates.totalTokensUsed;
    }

    if (updates.metadata) {
      context.metadata = { ...context.metadata, ...updates.metadata };
    }

    context.lastUpdated = new Date();
    this.persistContext(jobId, context);

    return context;
  }

  async recordFileRead(jobId: string, filePath: string, content: string): Promise<void> {
    const context = await this.getContext(jobId);
    if (!context) return;

    const compressedContent = this.compressFileContent(content);
    const tokenCount = this.estimateTokens(compressedContent);

    context.readFiles.set(filePath, {
      content: compressedContent,
      lastRead: new Date(),
      tokenCount,
    });

    if (!context.exploredPaths.includes(filePath)) {
      context.exploredPaths.push(filePath);
    }

    if (context.readFiles.size > MAX_FILE_CACHE_SIZE) {
      this.evictOldestFiles(context);
    }

    context.lastUpdated = new Date();
    this.persistContext(jobId, context);
  }

  async recordSearch(jobId: string, query: string, results: unknown[]): Promise<void> {
    const context = await this.getContext(jobId);
    if (!context) return;

    context.searchResults.push({
      query,
      results: results.slice(0, 50),
      timestamp: new Date(),
    });

    if (context.searchResults.length > MAX_SEARCH_RESULTS_STORED) {
      context.searchResults = context.searchResults.slice(-MAX_SEARCH_RESULTS_STORED);
    }

    context.lastUpdated = new Date();
    this.persistContext(jobId, context);
  }

  async recordDecision(
    jobId: string,
    step: number,
    action: string,
    reasoning: string
  ): Promise<void> {
    const context = await this.getContext(jobId);
    if (!context) return;

    context.decisions.push({
      step,
      action,
      reasoning,
      timestamp: new Date(),
    });

    if (context.decisions.length > MAX_DECISIONS_STORED) {
      context.decisions = context.decisions.slice(-MAX_DECISIONS_STORED);
    }

    context.lastUpdated = new Date();
    this.persistContext(jobId, context);
  }

  async addFinding(
    jobId: string,
    finding: { type: string; description: string; relatedFiles: string[] }
  ): Promise<void> {
    const context = await this.getContext(jobId);
    if (!context) return;

    context.findings.push({
      ...finding,
      timestamp: new Date(),
    });

    if (context.findings.length > MAX_FINDINGS_STORED) {
      context.findings = context.findings.slice(-MAX_FINDINGS_STORED);
    }

    context.lastUpdated = new Date();
    this.persistContext(jobId, context);
  }

  async summarizeContext(jobId: string): Promise<ContextSummary | null> {
    const context = await this.getContext(jobId);
    if (!context) return null;

    const recentDecisions = context.decisions
      .slice(-5)
      .map(d => `Step ${d.step}: ${d.action}`);

    const keyFindings = context.findings
      .slice(-10)
      .map(f => `[${f.type}] ${f.description}`);

    const exploredDirs = new Set(
      context.exploredPaths.map(p => p.split('/').slice(0, -1).join('/'))
    );

    return {
      filesAnalyzed: context.readFiles.size,
      keyFindings,
      pendingTasks: this.extractPendingTasks(context),
      currentFocus: this.determineCurrentFocus(context),
      recentDecisions,
      exploredAreas: Array.from(exploredDirs).slice(0, 10),
      tokenBudgetUsed: context.totalTokensUsed,
    };
  }

  async generateContextPrompt(jobId: string, maxTokens: number = 2000): Promise<string> {
    const summary = await this.summarizeContext(jobId);
    if (!summary) return '';

    const context = await this.getContext(jobId);
    if (!context) return '';

    const sections: string[] = [];

    sections.push('## Session Context');
    sections.push(`- Files analyzed: ${summary.filesAnalyzed}`);
    sections.push(`- Token budget used: ${summary.tokenBudgetUsed}`);
    sections.push(`- Current focus: ${summary.currentFocus}`);

    if (summary.exploredAreas.length > 0) {
      sections.push('\n## Explored Areas');
      sections.push(summary.exploredAreas.map(a => `- ${a}`).join('\n'));
    }

    if (summary.keyFindings.length > 0) {
      sections.push('\n## Key Findings');
      sections.push(summary.keyFindings.map(f => `- ${f}`).join('\n'));
    }

    if (summary.recentDecisions.length > 0) {
      sections.push('\n## Recent Decisions');
      sections.push(summary.recentDecisions.map(d => `- ${d}`).join('\n'));
    }

    const recentFiles = this.getRecentFilesSummary(context, 5);
    if (recentFiles) {
      sections.push('\n## Recently Accessed Files');
      sections.push(recentFiles);
    }

    let prompt = sections.join('\n');
    
    while (this.estimateTokens(prompt) > maxTokens && sections.length > 2) {
      sections.pop();
      prompt = sections.join('\n');
    }

    return prompt;
  }

  async clearContext(jobId: string): Promise<void> {
    this.contexts.delete(jobId);

    if (this.redisAvailable && this.redis) {
      try {
        await this.redis.del(`${REDIS_KEY_PREFIX}${jobId}`);
      } catch (error) {
        console.warn('[ContextManager] Failed to delete context from Redis:', error);
      }
    }
  }

  async pruneOldContext(maxAgeMs: number = CONTEXT_TTL_MS): Promise<number> {
    const now = Date.now();
    let prunedCount = 0;

    for (const [jobId, context] of Array.from(this.contexts.entries())) {
      if (now - context.lastUpdated.getTime() > maxAgeMs) {
        await this.clearContext(jobId);
        prunedCount++;
      }
    }

    if (this.redisAvailable && this.redis) {
      try {
        const keys = await this.redis.keys(`${REDIS_KEY_PREFIX}*`);
        for (const key of keys) {
          const serialized = await this.redis.get(key);
          if (serialized) {
            const data = JSON.parse(serialized) as SerializedContext;
            const lastUpdated = new Date(data.lastUpdated).getTime();
            if (now - lastUpdated > maxAgeMs) {
              await this.redis.del(key);
              prunedCount++;
            }
          }
        }
      } catch (error) {
        console.warn('[ContextManager] Failed to prune Redis contexts:', error);
      }
    }

    return prunedCount;
  }

  async compressContext(jobId: string): Promise<void> {
    const context = await this.getContext(jobId);
    if (!context) return;

    if (context.totalTokensUsed < TOKEN_BUDGET_WARNING_THRESHOLD) {
      return;
    }

    for (const [path, record] of Array.from(context.readFiles.entries())) {
      if (record.content.length > MAX_FILE_CONTENT_LENGTH / 2) {
        context.readFiles.set(path, {
          ...record,
          content: this.createFileExcerpt(record.content),
          tokenCount: this.estimateTokens(this.createFileExcerpt(record.content)),
        });
      }
    }

    if (context.searchResults.length > 10) {
      context.searchResults = context.searchResults.slice(-10);
    }

    if (context.decisions.length > 20) {
      const oldDecisions = context.decisions.slice(0, -20);
      context.decisions = context.decisions.slice(-20);
      
      if (oldDecisions.length > 0) {
        const summary = `Summarized ${oldDecisions.length} earlier decisions. Key actions: ${
          oldDecisions.slice(-5).map(d => d.action).join(', ')
        }`;
        context.messageSummary = context.messageSummary 
          ? `${context.messageSummary}\n${summary}`
          : summary;
      }
    }

    context.lastUpdated = new Date();
    this.persistContext(jobId, context);
  }

  getActiveContextCount(): number {
    return this.contexts.size;
  }

  async getContextStats(jobId: string): Promise<{
    filesRead: number;
    searchesPerformed: number;
    decisionsRecorded: number;
    findingsCount: number;
    estimatedTokens: number;
    ageMs: number;
  } | null> {
    const context = await this.getContext(jobId);
    if (!context) return null;

    let estimatedTokens = context.totalTokensUsed;
    for (const record of Array.from(context.readFiles.values())) {
      estimatedTokens += record.tokenCount || 0;
    }

    return {
      filesRead: context.readFiles.size,
      searchesPerformed: context.searchResults.length,
      decisionsRecorded: context.decisions.length,
      findingsCount: context.findings.length,
      estimatedTokens,
      ageMs: Date.now() - context.startedAt.getTime(),
    };
  }

  private compressFileContent(content: string): string {
    if (content.length <= MAX_FILE_CONTENT_LENGTH) {
      return content;
    }
    return this.createFileExcerpt(content);
  }

  private createFileExcerpt(content: string): string {
    const lines = content.split('\n');
    const excerptLines: string[] = [];
    
    const importLines = lines.filter(l => 
      l.startsWith('import ') || l.startsWith('export ') || l.startsWith('from ')
    ).slice(0, 20);
    excerptLines.push(...importLines);
    excerptLines.push('');

    const signaturePattern = /^(export\s+)?(async\s+)?(function|class|interface|type|const|let|var)\s+\w+/;
    for (const line of lines) {
      if (signaturePattern.test(line.trim())) {
        excerptLines.push(line);
      }
    }

    const result = excerptLines.join('\n');
    if (result.length > MAX_FILE_CONTENT_LENGTH) {
      return result.substring(0, MAX_FILE_CONTENT_LENGTH) + '\n... [truncated]';
    }
    return result + '\n... [file content summarized]';
  }

  private evictOldestFiles(context: AgentContext): void {
    const entries = Array.from(context.readFiles.entries());
    entries.sort((a, b) => a[1].lastRead.getTime() - b[1].lastRead.getTime());
    
    const toRemove = entries.slice(0, Math.floor(MAX_FILE_CACHE_SIZE / 4));
    for (const [path] of toRemove) {
      context.readFiles.delete(path);
    }
  }

  private extractPendingTasks(context: AgentContext): string[] {
    const pendingTasks: string[] = [];
    
    for (const finding of context.findings.slice(-10)) {
      if (finding.type === 'todo' || finding.type === 'task') {
        pendingTasks.push(finding.description);
      }
    }
    
    return pendingTasks;
  }

  private determineCurrentFocus(context: AgentContext): string {
    if (context.decisions.length === 0) {
      return 'Starting analysis';
    }

    const lastDecision = context.decisions[context.decisions.length - 1];
    return lastDecision.action;
  }

  private getRecentFilesSummary(context: AgentContext, limit: number): string {
    const entries = Array.from(context.readFiles.entries());
    entries.sort((a, b) => b[1].lastRead.getTime() - a[1].lastRead.getTime());
    
    const recent = entries.slice(0, limit);
    if (recent.length === 0) return '';

    return recent.map(([path, record]) => {
      const preview = record.content.substring(0, 100).replace(/\n/g, ' ');
      return `- ${path}: ${preview}...`;
    }).join('\n');
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private async persistContext(jobId: string, context: AgentContext): Promise<void> {
    if (!this.redisAvailable || !this.redis) return;

    try {
      const serialized = this.serializeContext(context);
      await this.redis.setex(
        `${REDIS_KEY_PREFIX}${jobId}`,
        Math.floor(CONTEXT_TTL_MS / 1000),
        JSON.stringify(serialized)
      );
    } catch (error) {
      console.warn('[ContextManager] Failed to persist context to Redis:', error);
    }
  }

  private serializeContext(context: AgentContext): SerializedContext {
    return {
      jobId: context.jobId,
      sessionId: context.sessionId,
      startedAt: context.startedAt.toISOString(),
      lastUpdated: context.lastUpdated.toISOString(),
      exploredPaths: context.exploredPaths,
      readFiles: Array.from(context.readFiles.entries()).map(([path, record]) => [
        path,
        { ...record, lastRead: record.lastRead.toISOString() },
      ]) as SerializedContext['readFiles'],
      searchResults: context.searchResults.map(r => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
      })) as SerializedContext['searchResults'],
      decisions: context.decisions.map(d => ({
        ...d,
        timestamp: d.timestamp.toISOString(),
      })) as SerializedContext['decisions'],
      findings: context.findings.map(f => ({
        ...f,
        timestamp: f.timestamp.toISOString(),
      })) as SerializedContext['findings'],
      messageSummary: context.messageSummary,
      totalTokensUsed: context.totalTokensUsed,
      metadata: context.metadata,
    };
  }

  private deserializeContext(data: SerializedContext): AgentContext {
    return {
      jobId: data.jobId,
      sessionId: data.sessionId,
      startedAt: new Date(data.startedAt),
      lastUpdated: new Date(data.lastUpdated),
      exploredPaths: data.exploredPaths,
      readFiles: new Map(
        data.readFiles.map(([path, record]) => [
          path,
          { ...record, lastRead: new Date(record.lastRead) },
        ])
      ),
      searchResults: data.searchResults.map(r => ({
        ...r,
        timestamp: new Date(r.timestamp),
      })),
      decisions: data.decisions.map(d => ({
        ...d,
        timestamp: new Date(d.timestamp),
      })),
      findings: data.findings.map(f => ({
        ...f,
        timestamp: new Date(f.timestamp),
      })),
      messageSummary: data.messageSummary,
      totalTokensUsed: data.totalTokensUsed,
      metadata: data.metadata,
    };
  }

  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.redisAvailable = false;
    }
  }
}

export const contextManager = new ContextManager();
