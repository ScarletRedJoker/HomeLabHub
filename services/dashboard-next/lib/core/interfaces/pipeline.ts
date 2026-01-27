/**
 * Pipeline Abstraction Layer
 * 
 * Defines generic pipeline interfaces for content generation, asset processing,
 * and multi-stage workflows. Designed for composable, extensible pipelines that
 * can integrate AI, rendering, and processing stages.
 * 
 * Future use cases:
 * - AI-driven game asset pipelines (prompt → concept → 3D model → texture → game-ready)
 * - Video production pipelines (script → storyboard → animation → compositing)
 * - AR/VR content creation workflows
 * - Simulation data processing pipelines
 * - Real-time content generation for streaming
 * 
 * @module core/interfaces/pipeline
 */

/**
 * Validation result for pipeline input.
 */
export interface ValidationResult {
  /** Is the input valid */
  valid: boolean;
  /** Validation errors if any */
  errors: ValidationError[];
  /** Validation warnings (non-blocking) */
  warnings: ValidationWarning[];
}

/**
 * Validation error detail.
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Path to the invalid field */
  path?: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validation warning detail.
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Path to the problematic field */
  path?: string;
}

/**
 * Context passed through pipeline stages.
 * Accumulates data and metadata as the pipeline executes.
 */
export interface PipelineContext {
  /** Unique execution ID */
  executionId: string;
  /** Pipeline ID */
  pipelineId: string;
  /** Start timestamp */
  startTime: Date;
  /** Current stage index */
  currentStageIndex: number;
  /** Accumulated stage outputs */
  stageOutputs: Map<string, unknown>;
  /** Metadata accumulated during execution */
  metadata: Record<string, unknown>;
  /** User-provided context data */
  userData?: Record<string, unknown>;
  /** Execution environment info */
  environment?: ExecutionEnvironment;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Execution environment information.
 */
export interface ExecutionEnvironment {
  /** Environment name (development, staging, production) */
  name: string;
  /** Available resources */
  resources?: {
    gpuAvailable: boolean;
    gpuMemory?: number;
    cpuCores?: number;
    memoryLimit?: number;
  };
  /** Service endpoints */
  endpoints?: Record<string, string>;
}

/**
 * Result from pipeline execution.
 */
export interface PipelineResult<TOutput> {
  /** Was the pipeline successful */
  success: boolean;
  /** Final output data */
  output?: TOutput;
  /** Error if pipeline failed */
  error?: PipelineError;
  /** Execution metadata */
  metadata: PipelineMetadata;
  /** Outputs from each stage */
  stageResults: StageResult[];
}

/**
 * Pipeline error information.
 */
export interface PipelineError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Stage where error occurred */
  stage?: string;
  /** Stage index where error occurred */
  stageIndex?: number;
  /** Original error */
  cause?: Error;
  /** Can the pipeline be retried */
  retryable: boolean;
}

/**
 * Metadata about pipeline execution.
 */
export interface PipelineMetadata {
  /** Unique execution ID */
  executionId: string;
  /** Pipeline ID */
  pipelineId: string;
  /** Total execution time in milliseconds */
  totalTimeMs: number;
  /** Number of stages executed */
  stagesExecuted: number;
  /** Number of stages that succeeded */
  stagesSucceeded: number;
  /** Was any rollback performed */
  rolledBack: boolean;
  /** Resource usage */
  resourceUsage?: ResourceUsage;
  /** Cost estimate (if applicable) */
  estimatedCost?: number;
}

/**
 * Resource usage during pipeline execution.
 */
export interface ResourceUsage {
  /** CPU time in milliseconds */
  cpuTimeMs?: number;
  /** GPU time in milliseconds */
  gpuTimeMs?: number;
  /** Peak memory usage in bytes */
  peakMemory?: number;
  /** Network bytes transferred */
  networkBytes?: number;
  /** Storage bytes written */
  storageBytes?: number;
}

/**
 * Result from individual stage execution.
 */
export interface StageResult {
  /** Stage name */
  name: string;
  /** Stage index */
  index: number;
  /** Was the stage successful */
  success: boolean;
  /** Stage output */
  output?: unknown;
  /** Error if stage failed */
  error?: string;
  /** Execution time in milliseconds */
  timeMs: number;
  /** Stage-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Progress update during streaming pipeline execution.
 */
export interface PipelineProgress<TOutput> {
  /** Current stage being executed */
  currentStage: string;
  /** Current stage index (0-based) */
  stageIndex: number;
  /** Total number of stages */
  totalStages: number;
  /** Overall progress percentage (0-100) */
  overallProgress: number;
  /** Current stage progress percentage (0-100) */
  stageProgress: number;
  /** Status message */
  message?: string;
  /** Partial output (if available) */
  partialOutput?: Partial<TOutput>;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
  /** Is this the final update */
  isFinal: boolean;
  /** Final result (only on final update) */
  result?: PipelineResult<TOutput>;
}

/**
 * Individual stage in a pipeline.
 * Stages are executed sequentially, with each stage receiving the output of the previous.
 */
export interface PipelineStage<TIn, TOut> {
  /** Stage name (unique within pipeline) */
  name: string;
  /** Stage description */
  description?: string;
  /** Stage type for categorization */
  type?: 'transform' | 'generate' | 'validate' | 'enrich' | 'filter' | 'aggregate';
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: RetryConfig;
  
  /**
   * Execute the stage.
   * @param input Input data from previous stage
   * @param context Pipeline execution context
   * @returns Output data for next stage
   */
  execute(input: TIn, context: PipelineContext): Promise<TOut>;
  
  /**
   * Rollback changes made by this stage.
   * Optional: Implement for stages that make reversible changes.
   * @param context Pipeline execution context
   */
  rollback?(context: PipelineContext): Promise<void>;
  
  /**
   * Validate input before execution.
   * Optional: Implement for stages with specific input requirements.
   * @param input Input data to validate
   */
  validateInput?(input: TIn): Promise<ValidationResult>;
  
  /**
   * Report progress during execution.
   * Optional: Implement for long-running stages.
   */
  onProgress?(callback: (progress: number, message?: string) => void): void;
}

/**
 * Retry configuration for stages.
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Error codes that should trigger retry */
  retryableCodes?: string[];
}

/**
 * Pipeline definition and executor.
 * Implement this interface to create custom pipelines.
 * 
 * @example
 * // Asset generation pipeline
 * const assetPipeline: IPipeline<PromptInput, GameAsset> = {
 *   id: 'asset-gen-v1',
 *   stages: [
 *     conceptArtStage,      // Generate concept art from prompt
 *     modelGenStage,        // Generate 3D model from concept
 *     textureGenStage,      // Generate textures
 *     optimizationStage,    // Optimize for game engine
 *   ],
 *   async execute(input, context) {
 *     // Execute stages in sequence
 *   }
 * };
 */
export interface IPipeline<TInput, TOutput, TContext = unknown> {
  /** Unique pipeline identifier */
  readonly id: string;
  /** Pipeline name */
  readonly name?: string;
  /** Pipeline version */
  readonly version?: string;
  /** Pipeline stages */
  readonly stages: PipelineStage<unknown, unknown>[];
  
  /**
   * Execute the pipeline.
   * @param input Initial input data
   * @param context Optional user context
   * @returns Pipeline result with final output
   */
  execute(input: TInput, context?: TContext): Promise<PipelineResult<TOutput>>;
  
  /**
   * Execute the pipeline with streaming progress updates.
   * @param input Initial input data
   * @param context Optional user context
   * @returns Async iterable of progress updates
   */
  executeStream(input: TInput, context?: TContext): AsyncIterable<PipelineProgress<TOutput>>;
  
  /**
   * Validate input before execution.
   * @param input Input data to validate
   * @returns Validation result
   */
  validate(input: TInput): Promise<ValidationResult>;
  
  /**
   * Estimate execution time and cost.
   * Optional: Implement for resource-aware scheduling.
   * @param input Input data for estimation
   */
  estimate?(input: TInput): Promise<PipelineEstimate>;
  
  /**
   * Cancel a running pipeline execution.
   * @param executionId Execution ID to cancel
   */
  cancel?(executionId: string): Promise<void>;
}

/**
 * Estimate for pipeline execution.
 */
export interface PipelineEstimate {
  /** Estimated execution time in milliseconds */
  estimatedTimeMs: number;
  /** Estimated cost in USD */
  estimatedCost?: number;
  /** Estimated resource usage */
  estimatedResources?: ResourceUsage;
  /** Confidence level of estimate */
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Pipeline builder for fluent pipeline construction.
 * 
 * @example
 * const pipeline = new PipelineBuilder<Input, Output>('my-pipeline')
 *   .addStage(stage1)
 *   .addStage(stage2)
 *   .withRetry({ maxRetries: 3 })
 *   .build();
 */
export interface IPipelineBuilder<TInput, TOutput> {
  /**
   * Add a stage to the pipeline.
   */
  addStage<TStageOut>(stage: PipelineStage<unknown, TStageOut>): IPipelineBuilder<TInput, TStageOut>;
  
  /**
   * Set default retry configuration for all stages.
   */
  withRetry(config: RetryConfig): IPipelineBuilder<TInput, TOutput>;
  
  /**
   * Set pipeline-level timeout.
   */
  withTimeout(timeoutMs: number): IPipelineBuilder<TInput, TOutput>;
  
  /**
   * Add error handler.
   */
  onError(handler: (error: PipelineError, context: PipelineContext) => Promise<void>): IPipelineBuilder<TInput, TOutput>;
  
  /**
   * Build the pipeline.
   */
  build(): IPipeline<TInput, TOutput>;
}

/**
 * Pipeline registry for managing pipeline definitions.
 */
export interface IPipelineRegistry {
  /**
   * Register a pipeline.
   */
  register<TIn, TOut>(pipeline: IPipeline<TIn, TOut>): void;
  
  /**
   * Get a pipeline by ID.
   */
  get<TIn, TOut>(pipelineId: string): IPipeline<TIn, TOut> | undefined;
  
  /**
   * Get all registered pipelines.
   */
  getAll(): IPipeline<unknown, unknown>[];
  
  /**
   * Unregister a pipeline.
   */
  unregister(pipelineId: string): boolean;
}

/**
 * Pre-built stage types for common operations.
 */
export type StageType = 
  | 'ai-generate'      // AI content generation
  | 'ai-transform'     // AI-powered transformation
  | 'render'           // 3D rendering
  | 'image-process'    // Image processing
  | 'video-process'    // Video processing
  | 'audio-process'    // Audio processing
  | 'file-convert'     // File format conversion
  | 'validate'         // Data validation
  | 'filter'           // Data filtering
  | 'aggregate'        // Data aggregation
  | 'upload'           // File upload
  | 'download'         // File download
  | 'cache'            // Caching operation
  | 'notify';          // Notification/webhook
