/**
 * AI Cluster Node Registry Schema
 * Supports single GPU today, scales to multi-node cluster
 * Nodes register capabilities, dashboard routes requests based on availability
 */

import { pgTable, text, integer, boolean, timestamp, jsonb, varchar, uuid, real } from 'drizzle-orm/pg-core';

/**
 * AI Compute Nodes
 * Each GPU-enabled machine registers as a node
 */
export const aiNodes = pgTable('ai_nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  nodeType: varchar('node_type', { length: 50 }).notNull(), // 'windows_vm', 'linux', 'cloud'
  tailscaleIp: varchar('tailscale_ip', { length: 50 }),
  publicIp: varchar('public_ip', { length: 50 }),
  
  // Hardware specs
  gpuModel: varchar('gpu_model', { length: 255 }),
  gpuVramMb: integer('gpu_vram_mb'),
  gpuCount: integer('gpu_count').default(1),
  cpuCores: integer('cpu_cores'),
  ramMb: integer('ram_mb'),
  
  // Capabilities (what this node can do)
  capabilities: jsonb('capabilities').$type<{
    llm: boolean;
    imageGen: boolean;
    videoGen: boolean;
    embedding: boolean;
    training: boolean;
    speech: boolean;
  }>().default({
    llm: false,
    imageGen: false,
    videoGen: false,
    embedding: false,
    training: false,
    speech: false,
  }),
  
  // Service endpoints on this node
  endpoints: jsonb('endpoints').$type<{
    ollama?: string;
    stableDiffusion?: string;
    comfyui?: string;
    whisper?: string;
  }>().default({}),
  
  // Status
  status: varchar('status', { length: 50 }).default('offline'), // 'online', 'offline', 'busy', 'error'
  lastHeartbeat: timestamp('last_heartbeat'),
  lastError: text('last_error'),
  
  // Priority (lower = preferred)
  priority: integer('priority').default(100),
  enabled: boolean('enabled').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * AI Job Queue
 * Track pending and running AI generation jobs
 */
export const aiJobs = pgTable('ai_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Job type and payload
  jobType: varchar('job_type', { length: 50 }).notNull(), // 'chat', 'image', 'video', 'embedding', 'training'
  model: varchar('model', { length: 255 }),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  
  // Assigned node (null = queued, set = running)
  nodeId: uuid('node_id').references(() => aiNodes.id),
  
  // Status tracking
  status: varchar('status', { length: 50 }).default('queued'), // 'queued', 'running', 'completed', 'failed', 'cancelled'
  progress: integer('progress').default(0), // 0-100
  
  // Resource requirements
  estimatedVramMb: integer('estimated_vram_mb'),
  priority: integer('priority').default(50), // Lower = higher priority
  
  // Results
  result: jsonb('result'),
  error: text('error'),
  
  // Timing
  createdAt: timestamp('created_at').defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  
  // Caller info
  callerId: varchar('caller_id', { length: 255 }),
  callerType: varchar('caller_type', { length: 50 }), // 'api', 'dashboard', 'discord', 'agent'
});

/**
 * AI Model Registry
 * Track which models are available where
 */
export const aiModels = pgTable('ai_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Model identity
  modelName: varchar('model_name', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'ollama', 'stable-diffusion', 'comfyui'
  modelType: varchar('model_type', { length: 50 }).notNull(), // 'llm', 'image', 'video', 'embedding', 'audio'
  
  // Where it's installed
  nodeId: uuid('node_id').references(() => aiNodes.id),
  
  // Specs
  sizeBytes: real('size_bytes'),
  vramRequiredMb: integer('vram_required_mb'),
  quantization: varchar('quantization', { length: 50 }),
  parameters: varchar('parameters', { length: 50 }), // '7B', '13B', etc.
  contextLength: integer('context_length'),
  
  // Status
  isLoaded: boolean('is_loaded').default(false),
  lastUsed: timestamp('last_used'),
  
  // Metadata
  tags: jsonb('tags').$type<string[]>().default([]),
  description: text('description'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * AI Usage Metrics
 * Track usage for monitoring and optimization
 */
export const aiUsageMetrics = pgTable('ai_usage_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  nodeId: uuid('node_id').references(() => aiNodes.id),
  modelName: varchar('model_name', { length: 255 }),
  jobType: varchar('job_type', { length: 50 }),
  
  // Metrics
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  durationMs: integer('duration_ms'),
  vramPeakMb: integer('vram_peak_mb'),
  
  // Request info
  success: boolean('success'),
  errorType: varchar('error_type', { length: 100 }),
  
  createdAt: timestamp('created_at').defaultNow(),
});

// Types for use in application code
export type AINode = typeof aiNodes.$inferSelect;
export type NewAINode = typeof aiNodes.$inferInsert;
export type AIJob = typeof aiJobs.$inferSelect;
export type NewAIJob = typeof aiJobs.$inferInsert;
export type AIModel = typeof aiModels.$inferSelect;
export type NewAIModel = typeof aiModels.$inferInsert;

// Helper to calculate VRAM requirements by job type
export const vramEstimates: Record<string, { min: number; typical: number; max: number }> = {
  'chat-3b': { min: 2000, typical: 2500, max: 3000 },
  'chat-7b': { min: 4000, typical: 5000, max: 6000 },
  'chat-8b': { min: 4500, typical: 5500, max: 6500 },
  'chat-13b': { min: 7000, typical: 8500, max: 10000 },
  'chat-16b': { min: 9000, typical: 10500, max: 12000 },
  'code-7b': { min: 4000, typical: 5000, max: 6000 },
  'code-13b': { min: 7000, typical: 8500, max: 10000 },
  'code-16b': { min: 9000, typical: 10500, max: 12000 },
  'embedding': { min: 300, typical: 500, max: 1000 },
  'image-sd15': { min: 3000, typical: 4000, max: 5000 },
  'image-sdxl': { min: 6000, typical: 8000, max: 10000 },
  'video-animatediff': { min: 5000, typical: 6000, max: 8000 },
  'video-svd': { min: 7000, typical: 8500, max: 10000 },
};
