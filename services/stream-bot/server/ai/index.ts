export { 
  titleGenerator, 
  generateTitles, 
  improveTitleWithFeedback,
  type TitleSuggestion,
  type TitleGeneratorOptions 
} from './title-generator';

export { 
  clipWriter, 
  describeClip, 
  generateClipVariations,
  improveClipDescription,
  type ClipDescription,
  type ClipWriterOptions 
} from './clip-writer';

export { 
  socialGenerator, 
  createGoLivePost, 
  createStreamEndPost,
  createSchedulePost,
  generateAllPlatformPosts,
  type StreamInfo,
  type SocialPost,
  type SocialPlatform 
} from './social-generator';

export { 
  scheduleOptimizer, 
  analyzeSchedule,
  suggestNextStreamTime,
  type StreamHistory,
  type ScheduleRecommendation,
  type ScheduleAnalysis 
} from './schedule-optimizer';

export {
  unifiedAIClient,
  type AIServiceConfig,
  type ImageGenerationOptions,
  type ImageGenerationResult,
  type TextGenerationOptions,
  type TextGenerationResult,
  type WorkflowExecutionOptions,
  type WorkflowExecutionResult,
  type AIServiceStatus,
  type AIJob,
} from './unified-ai-client';

export {
  handleAICommand,
  getAIStatus,
  type AICommandResult,
  type AICommandContext,
} from './ai-command-handler';

export {
  aiRateLimiter,
  type CommandType,
} from './ai-rate-limiter';

export {
  aiScheduler,
  type ScheduledAITask,
  type ScheduledTaskConfig,
  type SchedulerCallback,
} from './ai-scheduler';

import { titleGenerator } from './title-generator';
import { clipWriter } from './clip-writer';
import { socialGenerator } from './social-generator';
import { scheduleOptimizer } from './schedule-optimizer';
import { unifiedAIClient } from './unified-ai-client';
import { handleAICommand, getAIStatus } from './ai-command-handler';
import { aiRateLimiter } from './ai-rate-limiter';
import { aiScheduler } from './ai-scheduler';

export const streamAI = {
  titles: titleGenerator,
  clips: clipWriter,
  social: socialGenerator,
  schedule: scheduleOptimizer,
  unified: unifiedAIClient,
  commands: { handleAICommand, getAIStatus },
  rateLimiter: aiRateLimiter,
  scheduler: aiScheduler,
  
  async getStatus() {
    const serviceStatus = await unifiedAIClient.checkServiceHealth();
    return {
      available: true,
      features: ['titles', 'clips', 'social', 'schedule', 'imagine', 'ask', 'workflow'],
      services: serviceStatus,
      version: '2.0.0'
    };
  }
};

export default streamAI;
