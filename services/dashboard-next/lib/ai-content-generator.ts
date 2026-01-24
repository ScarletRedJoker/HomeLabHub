/**
 * AI Content Generator - Unified service for code, website design, and social content generation
 * Supports Ollama (preferred for cost savings) with OpenAI fallback
 */
import { aiOrchestrator, type ChatMessage, type AIConfig, type StreamingChatChunk } from './ai-orchestrator';
import { recordContentUsage, type MetricProvider } from './ai-metrics';

function transformUsage(usage?: { promptTokens: number; completionTokens: number; totalTokens: number }): { prompt: number; completion: number; total: number } | undefined {
  if (!usage) return undefined;
  return {
    prompt: usage.promptTokens,
    completion: usage.completionTokens,
    total: usage.totalTokens,
  };
}

export type CodeGenType = 'component' | 'function' | 'api' | 'test' | 'refactor' | 'fix';
export type ProgrammingLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
export type WebsiteType = 'landing-page' | 'portfolio' | 'blog' | 'ecommerce' | 'dashboard';
export type WebsiteSection = 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer' | 'navbar' | 'contact' | 'about' | 'full';
export type SocialPlatform = 'twitter' | 'instagram' | 'discord' | 'linkedin' | 'youtube';
export type SocialPostType = 'announcement' | 'promotion' | 'engagement' | 'thread';
export type ContentType = 'description' | 'summary' | 'email' | 'documentation' | 'blog-post' | 'readme';

export interface CodeGenRequest {
  type: CodeGenType;
  language: ProgrammingLanguage;
  description: string;
  context?: string;
  existingCode?: string;
  framework?: string;
  includeTests?: boolean;
  includeComments?: boolean;
}

export interface CodeGenResponse {
  code: string;
  language: ProgrammingLanguage;
  explanation?: string;
  imports?: string[];
  tests?: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
}

export interface WebsiteDesignRequest {
  type: WebsiteType;
  section?: WebsiteSection;
  description: string;
  style?: 'modern' | 'minimal' | 'bold' | 'elegant' | 'playful';
  colorScheme?: string;
  framework?: 'html' | 'react' | 'nextjs' | 'vue';
  includeResponsive?: boolean;
  includeDarkMode?: boolean;
}

export interface WebsiteDesignResponse {
  html?: string;
  css?: string;
  jsx?: string;
  component?: string;
  preview?: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
}

export interface SocialPostRequest {
  platform: SocialPlatform;
  type: SocialPostType;
  topic: string;
  tone?: 'professional' | 'casual' | 'humorous' | 'inspiring' | 'urgent';
  keywords?: string[];
  targetAudience?: string;
  callToAction?: string;
  threadCount?: number;
  includeEmojis?: boolean;
}

export interface SocialPostResponse {
  content: string;
  alternatives: string[];
  hashtags: string[];
  characterCount: number;
  platform: SocialPlatform;
  provider: string;
  model: string;
  fallbackUsed: boolean;
}

export interface GeneralContentRequest {
  type: ContentType;
  topic: string;
  context?: string;
  tone?: 'formal' | 'informal' | 'technical' | 'friendly';
  length?: 'short' | 'medium' | 'long';
  audience?: string;
  keywords?: string[];
}

export interface GeneralContentResponse {
  content: string;
  summary?: string;
  wordCount: number;
  provider: string;
  model: string;
  fallbackUsed: boolean;
}

export interface StreamingContentChunk {
  content: string;
  done: boolean;
  provider: string;
  model: string;
  fallbackUsed?: boolean;
}

const CODE_SYSTEM_PROMPTS: Record<CodeGenType, string> = {
  component: `You are an expert software engineer specializing in creating clean, reusable UI components.
Generate well-structured, typed, and documented component code.
Follow best practices for the specified framework and language.
Include proper prop types/interfaces and handle edge cases.`,

  function: `You are an expert programmer creating utility functions and helpers.
Write clean, efficient, and well-documented functions.
Include proper type annotations and handle edge cases.
Optimize for readability and performance.`,

  api: `You are an expert backend developer creating API endpoints and services.
Generate RESTful or GraphQL endpoints following best practices.
Include proper error handling, validation, and authentication patterns.
Document the API with proper types and examples.`,

  test: `You are an expert QA engineer writing comprehensive tests.
Create thorough unit tests, integration tests, or e2e tests as appropriate.
Cover edge cases, error scenarios, and happy paths.
Use descriptive test names and follow testing best practices.`,

  refactor: `You are an expert code reviewer and refactoring specialist.
Improve the given code for readability, performance, and maintainability.
Preserve functionality while enhancing code quality.
Explain the changes made and why they improve the code.`,

  fix: `You are an expert debugger and problem solver.
Analyze the code and description to identify and fix the bug.
Provide a clear explanation of what was wrong and how you fixed it.
Ensure the fix doesn't introduce new issues.`,
};

const LANGUAGE_TEMPLATES: Record<ProgrammingLanguage, { extension: string; style: string }> = {
  typescript: { extension: 'ts', style: 'Use strict TypeScript with proper types and interfaces.' },
  javascript: { extension: 'js', style: 'Use modern ES6+ JavaScript with JSDoc comments for types.' },
  python: { extension: 'py', style: 'Use Python 3.10+ with type hints and docstrings.' },
  go: { extension: 'go', style: 'Use idiomatic Go with proper error handling and documentation.' },
  rust: { extension: 'rs', style: 'Use safe Rust with proper error handling and documentation.' },
};

const WEBSITE_SYSTEM_PROMPTS: Record<WebsiteType, string> = {
  'landing-page': `You are an expert web designer creating high-converting landing pages.
Focus on clear value propositions, compelling CTAs, and trust signals.
Design for engagement and conversion optimization.`,

  'portfolio': `You are an expert designer creating stunning portfolio websites.
Showcase work beautifully with clean layouts and smooth interactions.
Focus on visual hierarchy and professional presentation.`,

  'blog': `You are an expert designer creating readable and engaging blog layouts.
Prioritize typography, readability, and content organization.
Include proper article cards, categories, and navigation.`,

  'ecommerce': `You are an expert ecommerce designer creating shoppable experiences.
Focus on product presentation, cart functionality, and checkout flow.
Include trust signals, reviews, and clear pricing.`,

  'dashboard': `You are an expert UI designer creating intuitive admin dashboards.
Focus on data visualization, clear navigation, and actionable insights.
Use proper spacing, cards, and interactive components.`,
};

const SOCIAL_PLATFORM_LIMITS: Record<SocialPlatform, { maxLength: number; hashtagStyle: string }> = {
  twitter: { maxLength: 280, hashtagStyle: '2-3 relevant hashtags at the end' },
  instagram: { maxLength: 2200, hashtagStyle: '5-10 hashtags, can be in comments' },
  discord: { maxLength: 2000, hashtagStyle: 'No hashtags, use mentions if relevant' },
  linkedin: { maxLength: 3000, hashtagStyle: '3-5 professional hashtags at the end' },
  youtube: { maxLength: 5000, hashtagStyle: '3-5 hashtags in description' },
};

class ContentGenerator {
  private defaultConfig: Partial<AIConfig> = {
    provider: 'auto',
    temperature: 0.7,
    maxTokens: 4000,
  };

  async generateCode(request: CodeGenRequest): Promise<CodeGenResponse> {
    const startTime = Date.now();
    const systemPrompt = this.buildCodeSystemPrompt(request);
    const userPrompt = this.buildCodeUserPrompt(request);

    try {
      const response = await aiOrchestrator.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: 8000 },
      });

      const parsed = this.parseCodeResponse(response.content, request.language);
      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        response.provider as MetricProvider,
        true,
        latencyMs,
        { model: response.model, fallback: response.fallbackUsed, tokens: transformUsage(response.usage) }
      );

      return {
        code: parsed.code,
        language: request.language,
        explanation: parsed.explanation,
        imports: parsed.imports,
        tests: request.includeTests ? parsed.tests : undefined,
        provider: response.provider,
        model: response.model,
        fallbackUsed: response.fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  async *generateCodeStream(request: CodeGenRequest): AsyncGenerator<StreamingContentChunk, CodeGenResponse, unknown> {
    const startTime = Date.now();
    const systemPrompt = this.buildCodeSystemPrompt(request);
    const userPrompt = this.buildCodeUserPrompt(request);

    let fullContent = '';
    let provider = 'unknown';
    let model = 'unknown';
    let fallbackUsed = false;

    try {
      const stream = aiOrchestrator.streamChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: 8000 },
      });

      for await (const chunk of stream) {
        fullContent += chunk.content;
        provider = chunk.provider;
        model = chunk.model;
        fallbackUsed = chunk.fallbackUsed || false;

        yield {
          content: chunk.content,
          done: chunk.done,
          provider: chunk.provider,
          model: chunk.model,
          fallbackUsed: chunk.fallbackUsed,
        };
      }

      const parsed = this.parseCodeResponse(fullContent, request.language);
      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        provider as MetricProvider,
        true,
        latencyMs,
        { model, fallback: fallbackUsed }
      );

      return {
        code: parsed.code,
        language: request.language,
        explanation: parsed.explanation,
        imports: parsed.imports,
        tests: request.includeTests ? parsed.tests : undefined,
        provider,
        model,
        fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  async generateWebsiteDesign(request: WebsiteDesignRequest): Promise<WebsiteDesignResponse> {
    const startTime = Date.now();
    const systemPrompt = this.buildWebsiteSystemPrompt(request);
    const userPrompt = this.buildWebsiteUserPrompt(request);

    try {
      const response = await aiOrchestrator.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: 12000 },
      });

      const parsed = this.parseWebsiteResponse(response.content, request.framework || 'html');
      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        response.provider as MetricProvider,
        true,
        latencyMs,
        { model: response.model, fallback: response.fallbackUsed, tokens: transformUsage(response.usage) }
      );

      return {
        ...parsed,
        provider: response.provider,
        model: response.model,
        fallbackUsed: response.fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  async *generateWebsiteDesignStream(request: WebsiteDesignRequest): AsyncGenerator<StreamingContentChunk, WebsiteDesignResponse, unknown> {
    const startTime = Date.now();
    const systemPrompt = this.buildWebsiteSystemPrompt(request);
    const userPrompt = this.buildWebsiteUserPrompt(request);

    let fullContent = '';
    let provider = 'unknown';
    let model = 'unknown';
    let fallbackUsed = false;

    try {
      const stream = aiOrchestrator.streamChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: 12000 },
      });

      for await (const chunk of stream) {
        fullContent += chunk.content;
        provider = chunk.provider;
        model = chunk.model;
        fallbackUsed = chunk.fallbackUsed || false;

        yield {
          content: chunk.content,
          done: chunk.done,
          provider: chunk.provider,
          model: chunk.model,
          fallbackUsed: chunk.fallbackUsed,
        };
      }

      const parsed = this.parseWebsiteResponse(fullContent, request.framework || 'html');
      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        provider as MetricProvider,
        true,
        latencyMs,
        { model, fallback: fallbackUsed }
      );

      return {
        ...parsed,
        provider,
        model,
        fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  async generateSocialPost(request: SocialPostRequest): Promise<SocialPostResponse> {
    const startTime = Date.now();
    const systemPrompt = this.buildSocialSystemPrompt(request);
    const userPrompt = this.buildSocialUserPrompt(request);

    try {
      const response = await aiOrchestrator.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: 2000 },
      });

      const parsed = this.parseSocialResponse(response.content, request.platform);
      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        response.provider as MetricProvider,
        true,
        latencyMs,
        { model: response.model, fallback: response.fallbackUsed, tokens: transformUsage(response.usage) }
      );

      return {
        ...parsed,
        platform: request.platform,
        provider: response.provider,
        model: response.model,
        fallbackUsed: response.fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  async *generateSocialPostStream(request: SocialPostRequest): AsyncGenerator<StreamingContentChunk, SocialPostResponse, unknown> {
    const startTime = Date.now();
    const systemPrompt = this.buildSocialSystemPrompt(request);
    const userPrompt = this.buildSocialUserPrompt(request);

    let fullContent = '';
    let provider = 'unknown';
    let model = 'unknown';
    let fallbackUsed = false;

    try {
      const stream = aiOrchestrator.streamChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: 2000 },
      });

      for await (const chunk of stream) {
        fullContent += chunk.content;
        provider = chunk.provider;
        model = chunk.model;
        fallbackUsed = chunk.fallbackUsed || false;

        yield {
          content: chunk.content,
          done: chunk.done,
          provider: chunk.provider,
          model: chunk.model,
          fallbackUsed: chunk.fallbackUsed,
        };
      }

      const parsed = this.parseSocialResponse(fullContent, request.platform);
      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        provider as MetricProvider,
        true,
        latencyMs,
        { model, fallback: fallbackUsed }
      );

      return {
        ...parsed,
        platform: request.platform,
        provider,
        model,
        fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  async generateContent(request: GeneralContentRequest): Promise<GeneralContentResponse> {
    const startTime = Date.now();
    const systemPrompt = this.buildGeneralSystemPrompt(request);
    const userPrompt = this.buildGeneralUserPrompt(request);

    try {
      const response = await aiOrchestrator.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: this.getMaxTokensForLength(request.length) },
      });

      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        response.provider as MetricProvider,
        true,
        latencyMs,
        { model: response.model, fallback: response.fallbackUsed, tokens: transformUsage(response.usage) }
      );

      return {
        content: response.content,
        wordCount: response.content.split(/\s+/).length,
        provider: response.provider,
        model: response.model,
        fallbackUsed: response.fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  async *generateContentStream(request: GeneralContentRequest): AsyncGenerator<StreamingContentChunk, GeneralContentResponse, unknown> {
    const startTime = Date.now();
    const systemPrompt = this.buildGeneralSystemPrompt(request);
    const userPrompt = this.buildGeneralUserPrompt(request);

    let fullContent = '';
    let provider = 'unknown';
    let model = 'unknown';
    let fallbackUsed = false;

    try {
      const stream = aiOrchestrator.streamChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: { ...this.defaultConfig, maxTokens: this.getMaxTokensForLength(request.length) },
      });

      for await (const chunk of stream) {
        fullContent += chunk.content;
        provider = chunk.provider;
        model = chunk.model;
        fallbackUsed = chunk.fallbackUsed || false;

        yield {
          content: chunk.content,
          done: chunk.done,
          provider: chunk.provider,
          model: chunk.model,
          fallbackUsed: chunk.fallbackUsed,
        };
      }

      const latencyMs = Date.now() - startTime;

      recordContentUsage(
        provider as MetricProvider,
        true,
        latencyMs,
        { model, fallback: fallbackUsed }
      );

      return {
        content: fullContent,
        wordCount: fullContent.split(/\s+/).length,
        provider,
        model,
        fallbackUsed,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      recordContentUsage('ollama', false, latencyMs, { fallbackReason: error.message });
      throw error;
    }
  }

  private buildCodeSystemPrompt(request: CodeGenRequest): string {
    const basePrompt = CODE_SYSTEM_PROMPTS[request.type];
    const langTemplate = LANGUAGE_TEMPLATES[request.language];
    
    return `${basePrompt}

Language: ${request.language}
${langTemplate.style}
${request.framework ? `Framework: ${request.framework}` : ''}
${request.includeComments ? 'Include detailed comments explaining the code.' : 'Keep comments minimal, only for complex logic.'}

Output Format:
- Start with any required imports
- Provide the main code
- If explaining, use a separate section after the code
${request.includeTests ? '- Include unit tests in a separate section' : ''}`;
  }

  private buildCodeUserPrompt(request: CodeGenRequest): string {
    let prompt = `${request.description}\n`;
    
    if (request.context) {
      prompt += `\nAdditional context:\n${request.context}\n`;
    }
    
    if (request.existingCode) {
      prompt += `\nExisting code to ${request.type === 'fix' ? 'fix' : request.type === 'refactor' ? 'refactor' : 'reference'}:\n\`\`\`${request.language}\n${request.existingCode}\n\`\`\`\n`;
    }
    
    return prompt;
  }

  private buildWebsiteSystemPrompt(request: WebsiteDesignRequest): string {
    const basePrompt = WEBSITE_SYSTEM_PROMPTS[request.type];
    
    return `${basePrompt}

Style: ${request.style || 'modern'}
${request.colorScheme ? `Color scheme: ${request.colorScheme}` : 'Use a professional color palette'}
${request.includeResponsive ? 'Make the design fully responsive for mobile, tablet, and desktop.' : ''}
${request.includeDarkMode ? 'Include dark mode support with CSS variables or classes.' : ''}

Framework: ${request.framework || 'html'}
${request.framework === 'react' || request.framework === 'nextjs' ? 'Use functional components with hooks. Include TypeScript types.' : ''}
${request.framework === 'vue' ? 'Use Vue 3 Composition API with TypeScript.' : ''}

Output Format:
- Provide complete, production-ready code
- Use semantic HTML
- Include modern CSS (Flexbox/Grid)
- Add accessibility attributes (ARIA labels, proper heading hierarchy)`;
  }

  private buildWebsiteUserPrompt(request: WebsiteDesignRequest): string {
    const sectionText = request.section === 'full' || !request.section 
      ? 'Create a complete page' 
      : `Create the ${request.section} section`;
    
    return `${sectionText} for a ${request.type} website.

Description: ${request.description}

Requirements:
- Clean, professional design
- Proper spacing and typography
- Interactive elements where appropriate
- Placeholder content that makes sense`;
  }

  private buildSocialSystemPrompt(request: SocialPostRequest): string {
    const platformLimits = SOCIAL_PLATFORM_LIMITS[request.platform];
    
    return `You are an expert social media content creator specializing in ${request.platform}.
Create engaging, authentic content that resonates with audiences.

Platform: ${request.platform}
Character limit: ${platformLimits.maxLength}
Hashtag style: ${platformLimits.hashtagStyle}

Post type: ${request.type}
${request.type === 'thread' ? `Create ${request.threadCount || 3} connected posts that tell a story.` : ''}

Tone: ${request.tone || 'professional'}
${request.includeEmojis ? 'Use relevant emojis to add personality.' : 'Minimal emoji usage.'}

Output Format:
1. MAIN POST: The primary content
2. ALTERNATIVES: 2 alternative versions
3. HASHTAGS: Suggested hashtags (comma-separated)`;
  }

  private buildSocialUserPrompt(request: SocialPostRequest): string {
    let prompt = `Create a ${request.type} post about: ${request.topic}\n`;
    
    if (request.keywords?.length) {
      prompt += `Keywords to include: ${request.keywords.join(', ')}\n`;
    }
    
    if (request.targetAudience) {
      prompt += `Target audience: ${request.targetAudience}\n`;
    }
    
    if (request.callToAction) {
      prompt += `Call to action: ${request.callToAction}\n`;
    }
    
    return prompt;
  }

  private buildGeneralSystemPrompt(request: GeneralContentRequest): string {
    const contentTypeGuides: Record<ContentType, string> = {
      description: 'Write clear, compelling descriptions that highlight key features and benefits.',
      summary: 'Create concise summaries that capture the main points effectively.',
      email: 'Write professional emails with clear subject lines and calls to action.',
      documentation: 'Create thorough, well-organized technical documentation.',
      'blog-post': 'Write engaging blog content with proper structure, headings, and flow.',
      readme: 'Create comprehensive README files with installation, usage, and contribution guidelines.',
    };

    return `You are an expert content writer creating ${request.type} content.
${contentTypeGuides[request.type]}

Tone: ${request.tone || 'professional'}
Length: ${request.length || 'medium'}
${request.audience ? `Target audience: ${request.audience}` : ''}

Write naturally and avoid fluff. Every sentence should add value.`;
  }

  private buildGeneralUserPrompt(request: GeneralContentRequest): string {
    let prompt = `Create ${request.type} content about: ${request.topic}\n`;
    
    if (request.context) {
      prompt += `Context: ${request.context}\n`;
    }
    
    if (request.keywords?.length) {
      prompt += `Keywords to include: ${request.keywords.join(', ')}\n`;
    }
    
    return prompt;
  }

  private parseCodeResponse(content: string, language: ProgrammingLanguage): {
    code: string;
    explanation?: string;
    imports?: string[];
    tests?: string;
  } {
    const codeBlockRegex = new RegExp(`\`\`\`(?:${language})?\\s*([\\s\\S]*?)\`\`\``, 'g');
    const codeBlocks = Array.from(content.matchAll(codeBlockRegex)).map(m => m[1].trim());
    
    const code = codeBlocks[0] || content;
    const tests = codeBlocks.length > 1 ? codeBlocks[codeBlocks.length - 1] : undefined;
    
    const importRegex = language === 'python' 
      ? /^(?:from|import)\s+.+$/gm
      : /^import\s+.+$/gm;
    
    const imports = code.match(importRegex) || [];
    
    const explanationMatch = content.match(/(?:explanation|notes?):\s*([\s\S]+?)(?=```|$)/i);
    const explanation = explanationMatch?.[1]?.trim();
    
    return { code, explanation, imports, tests };
  }

  private parseWebsiteResponse(content: string, framework: string): {
    html?: string;
    css?: string;
    jsx?: string;
    component?: string;
  } {
    const htmlMatch = content.match(/```html\s*([\s\S]*?)```/);
    const cssMatch = content.match(/```css\s*([\s\S]*?)```/);
    const jsxMatch = content.match(/```(?:jsx|tsx)\s*([\s\S]*?)```/);
    const componentMatch = content.match(/```(?:react|typescript|javascript)\s*([\s\S]*?)```/);
    
    return {
      html: htmlMatch?.[1]?.trim(),
      css: cssMatch?.[1]?.trim(),
      jsx: jsxMatch?.[1]?.trim(),
      component: componentMatch?.[1]?.trim(),
    };
  }

  private parseSocialResponse(content: string, platform: SocialPlatform): {
    content: string;
    alternatives: string[];
    hashtags: string[];
    characterCount: number;
  } {
    const lines = content.split('\n').filter(l => l.trim());
    
    let mainContent = '';
    const alternatives: string[] = [];
    let hashtags: string[] = [];
    
    let currentSection = 'main';
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.includes('main post:') || lowerLine.includes('primary:')) {
        currentSection = 'main';
        continue;
      } else if (lowerLine.includes('alternative') || lowerLine.includes('option')) {
        currentSection = 'alt';
        continue;
      } else if (lowerLine.includes('hashtag')) {
        currentSection = 'hashtags';
        continue;
      }
      
      const cleanLine = line.replace(/^[\d\.\-\*]\s*/, '').trim();
      
      if (currentSection === 'main' && !mainContent) {
        mainContent = cleanLine;
      } else if (currentSection === 'alt' && cleanLine) {
        alternatives.push(cleanLine);
      } else if (currentSection === 'hashtags' && cleanLine) {
        const tags = cleanLine.split(/[,\s]+/).filter(t => t.startsWith('#') || t.length > 2);
        hashtags = tags.map(t => t.startsWith('#') ? t : `#${t}`);
      }
    }
    
    if (!mainContent) {
      mainContent = lines[0] || content;
    }
    
    return {
      content: mainContent,
      alternatives: alternatives.slice(0, 3),
      hashtags: hashtags.slice(0, 10),
      characterCount: mainContent.length,
    };
  }

  private getMaxTokensForLength(length?: 'short' | 'medium' | 'long'): number {
    switch (length) {
      case 'short': return 500;
      case 'long': return 4000;
      case 'medium':
      default: return 1500;
    }
  }
}

export const contentGenerator = new ContentGenerator();
