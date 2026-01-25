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

import { titleGenerator } from './title-generator';
import { clipWriter } from './clip-writer';
import { socialGenerator } from './social-generator';
import { scheduleOptimizer } from './schedule-optimizer';

export const streamAI = {
  titles: titleGenerator,
  clips: clipWriter,
  social: socialGenerator,
  schedule: scheduleOptimizer,
  
  async getStatus() {
    return {
      available: true,
      features: ['titles', 'clips', 'social', 'schedule'],
      version: '1.0.0'
    };
  }
};

export default streamAI;
