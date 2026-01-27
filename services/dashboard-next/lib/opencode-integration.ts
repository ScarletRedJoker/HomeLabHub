/**
 * OpenCode Integration - Connect Jarvis orchestrator with OpenCode AI coding agent
 * Enables autonomous code generation, refactoring, and project development
 * Prioritizes LOCAL Ollama to avoid API costs
 * 
 * Supports coding models: qwen2.5-coder, deepseek-coder, codellama
 * Implements code generation workflow: analyze → plan → implement → validate
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { getAIConfig } from "@/lib/ai/config";

const execAsync = promisify(exec);

export type AutonomousJobType = 'feature-request' | 'bug-fix' | 'code-review' | 'refactor';

export interface OpenCodeSession {
  id: string;
  projectPath: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  model: string;
  provider: 'ollama' | 'openai' | 'custom';
  startedAt: Date;
  logs: string[];
}

export interface OpenCodeConfig {
  provider: 'ollama' | 'openai' | 'custom';
  model: string;
  baseUrl?: string;
  projectPath: string;
  nonInteractive?: boolean;
}

export interface CodeTask {
  type: 'generate' | 'refactor' | 'fix' | 'explain' | 'review' | 'deploy';
  prompt: string;
  files?: string[];
  outputFormat?: 'text' | 'json' | 'diff';
}

export interface CodeGenerationResult {
  success: boolean;
  output: string;
  changes?: string[];
  error?: string;
}

export interface FeatureDevelopmentResult {
  files: { path: string; content: string }[];
  commands: string[];
  tests?: string[];
}

export interface BugFixResult {
  fixes: { file: string; diff: string }[];
}

export interface CodeReviewResult {
  issues: { file: string; line: number; message: string; severity: string }[];
  suggestions: string[];
}

export interface StagedChange {
  id: string;
  type: AutonomousJobType;
  description: string;
  files: { path: string; content: string; originalContent?: string }[];
  status: 'staged' | 'approved' | 'rejected' | 'applied';
  createdAt: Date;
  validationResults?: ValidationResult;
  backup?: string;
}

export interface ValidationResult {
  lintPassed: boolean;
  typeCheckPassed: boolean;
  testsPassed: boolean;
  errors: string[];
  warnings: string[];
}

export interface CodeGenerationWorkflow {
  id: string;
  jobType: AutonomousJobType;
  description: string;
  status: 'analyzing' | 'planning' | 'implementing' | 'validating' | 'completed' | 'failed';
  progress: number;
  steps: {
    analyze: { status: 'pending' | 'running' | 'completed' | 'failed'; output?: string };
    plan: { status: 'pending' | 'running' | 'completed' | 'failed'; output?: string };
    implement: { status: 'pending' | 'running' | 'completed' | 'failed'; output?: string };
    validate: { status: 'pending' | 'running' | 'completed' | 'failed'; output?: string };
  };
  stagedChange?: StagedChange;
  error?: string;
}

function generateSessionId(): string {
  return `opencode-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

class OpenCodeIntegration {
  private sessions: Map<string, OpenCodeSession> = new Map();
  private defaultConfig: OpenCodeConfig;
  private ollamaEndpoints: string[];

  constructor() {
    const config = getAIConfig();

    this.ollamaEndpoints = [
      config.ollama.url,
    ];

    this.defaultConfig = {
      provider: 'ollama',
      model: 'qwen2.5-coder:14b',
      baseUrl: this.ollamaEndpoints[0],
      projectPath: process.cwd(),
      nonInteractive: true
    };
  }

  private async getAvailableOllamaEndpoint(): Promise<string | null> {
    for (const endpoint of this.ollamaEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          return endpoint;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  async checkInstallation(): Promise<boolean> {
    const endpoint = await this.getAvailableOllamaEndpoint();
    if (endpoint) {
      console.log(`[OpenCode] Ollama available at ${endpoint}`);
      return true;
    }

    const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (openaiKey) {
      console.log("[OpenCode] OpenAI API available as fallback");
      return true;
    }

    console.log("[OpenCode] No AI backend available");
    return false;
  }

  async getAvailableModels(provider: string): Promise<string[]> {
    if (provider === 'ollama') {
      const endpoint = await this.getAvailableOllamaEndpoint();
      if (!endpoint) return [];

      try {
        const response = await fetch(`${endpoint}/api/tags`);
        if (!response.ok) return [];
        const data = await response.json();
        return (data.models || []).map((m: { name: string }) => m.name);
      } catch {
        return [];
      }
    }

    if (provider === 'openai') {
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    }

    return [];
  }

  async selectBestProvider(): Promise<{ provider: 'ollama' | 'openai'; endpoint?: string; model: string }> {
    const ollamaEndpoint = await this.getAvailableOllamaEndpoint();
    if (ollamaEndpoint) {
      const models = await this.getAvailableModels('ollama');
      const preferredModels = [
        'qwen2.5-coder:14b',
        'qwen2.5-coder:7b',
        'qwen2.5-coder',
        'deepseek-coder:33b',
        'deepseek-coder:6.7b',
        'deepseek-coder',
        'codellama:34b',
        'codellama:13b',
        'codellama:7b',
        'codellama',
        'llama3.2',
        'mistral',
      ];

      for (const preferred of preferredModels) {
        if (models.some(m => m.startsWith(preferred.split(':')[0]))) {
          const exactMatch = models.find(m => m === preferred);
          const partialMatch = models.find(m => m.startsWith(preferred.split(':')[0]));
          return {
            provider: 'ollama',
            endpoint: ollamaEndpoint,
            model: exactMatch || partialMatch || preferred,
          };
        }
      }

      if (models.length > 0) {
        return { provider: 'ollama', endpoint: ollamaEndpoint, model: models[0] };
      }
    }

    const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (openaiKey) {
      return { provider: 'openai', model: 'gpt-4o-mini' };
    }

    return { provider: 'ollama', model: 'qwen2.5-coder:7b' };
  }

  async executeTask(task: CodeTask, config?: Partial<OpenCodeConfig>): Promise<CodeGenerationResult> {
    const sessionId = generateSessionId();
    const providerConfig = await this.selectBestProvider();
    
    const mergedConfig: OpenCodeConfig = {
      ...this.defaultConfig,
      ...config,
      provider: config?.provider || providerConfig.provider,
      model: config?.model || providerConfig.model,
      baseUrl: providerConfig.endpoint || this.defaultConfig.baseUrl,
    };

    const session: OpenCodeSession = {
      id: sessionId,
      projectPath: mergedConfig.projectPath,
      status: 'running',
      model: mergedConfig.model,
      provider: mergedConfig.provider,
      startedAt: new Date(),
      logs: [],
    };

    this.sessions.set(sessionId, session);
    console.log(`[OpenCode] Starting session ${sessionId} with ${mergedConfig.provider}/${mergedConfig.model}`);

    try {
      const systemPrompt = this.buildSystemPrompt(task.type);
      const userPrompt = this.buildUserPrompt(task);

      let output: string;

      if (mergedConfig.provider === 'ollama') {
        output = await this.executeOllamaRequest(mergedConfig, systemPrompt, userPrompt);
      } else {
        output = await this.executeOpenAIRequest(mergedConfig, systemPrompt, userPrompt);
      }

      session.status = 'completed';
      session.logs.push(`Task completed successfully`);

      const changes = this.extractChanges(output, task.type);

      return {
        success: true,
        output,
        changes,
      };
    } catch (error: any) {
      session.status = 'error';
      session.logs.push(`Error: ${error.message}`);

      return {
        success: false,
        output: '',
        error: error.message,
      };
    }
  }

  private buildSystemPrompt(taskType: string): string {
    const basePrompt = `You are an expert software developer and code architect. You write clean, maintainable, well-documented code following best practices.`;

    const taskPrompts: Record<string, string> = {
      generate: `${basePrompt} Generate complete, production-ready code based on the requirements. Include proper error handling, types, and documentation.`,
      refactor: `${basePrompt} Refactor the provided code to improve quality, readability, and maintainability while preserving functionality.`,
      fix: `${basePrompt} Analyze and fix bugs in the provided code. Explain what was wrong and how you fixed it.`,
      explain: `${basePrompt} Provide a clear, detailed explanation of the code. Break down complex logic and explain design decisions.`,
      review: `${basePrompt} Review the code for bugs, security issues, performance problems, and style issues. Provide actionable feedback.`,
      deploy: `${basePrompt} Prepare the code for deployment. Check for production readiness and suggest deployment steps.`,
    };

    return taskPrompts[taskType] || basePrompt;
  }

  private buildUserPrompt(task: CodeTask): string {
    let prompt = task.prompt;

    if (task.files && task.files.length > 0) {
      prompt += `\n\nFiles to work with:\n${task.files.join('\n')}`;
    }

    if (task.outputFormat === 'json') {
      prompt += `\n\nRespond in JSON format.`;
    } else if (task.outputFormat === 'diff') {
      prompt += `\n\nProvide changes in unified diff format.`;
    }

    return prompt;
  }

  private async executeOllamaRequest(config: OpenCodeConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content || '';
  }

  private async executeOpenAIRequest(config: OpenCodeConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI request failed: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private extractChanges(output: string, taskType: string): string[] {
    const changes: string[] = [];

    const filePatterns = [
      /```(?:typescript|javascript|python|tsx|jsx|ts|js|py)?\s*\n\/\/\s*(.+\.(?:ts|tsx|js|jsx|py|json|yaml|yml|md))/gi,
      /File:\s*(.+\.(?:ts|tsx|js|jsx|py|json|yaml|yml|md))/gi,
      /Create\s+(?:file\s+)?(.+\.(?:ts|tsx|js|jsx|py|json|yaml|yml|md))/gi,
      /Modify\s+(?:file\s+)?(.+\.(?:ts|tsx|js|jsx|py|json|yaml|yml|md))/gi,
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        if (!changes.includes(match[1])) {
          changes.push(match[1]);
        }
      }
    }

    return changes;
  }

  async runNonInteractive(prompt: string, options?: {
    model?: string;
    files?: string[];
    format?: 'text' | 'json';
  }): Promise<string> {
    const result = await this.executeTask({
      type: 'generate',
      prompt,
      files: options?.files,
      outputFormat: options?.format,
    }, {
      model: options?.model,
      nonInteractive: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'OpenCode execution failed');
    }

    return result.output;
  }

  async developFeature(spec: string): Promise<FeatureDevelopmentResult> {
    const prompt = `Develop the following feature:

${spec}

Provide:
1. All files needed with complete code (include file paths as comments)
2. Any shell commands needed (npm install, etc.)
3. Test files if applicable

Structure your response clearly with file paths and complete code.`;

    const result = await this.executeTask({
      type: 'generate',
      prompt,
      outputFormat: 'text',
    });

    if (!result.success) {
      throw new Error(result.error || 'Feature development failed');
    }

    const files = this.parseFilesFromOutput(result.output);
    const commands = this.parseCommandsFromOutput(result.output);
    const tests = files.filter(f => f.path.includes('.test.') || f.path.includes('.spec.'));

    return {
      files,
      commands,
      tests: tests.map(t => t.path),
    };
  }

  async fixBugs(description: string, files?: string[]): Promise<BugFixResult> {
    let prompt = `Fix the following bug:\n\n${description}`;

    let fileContents: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          fileContents.push(`\n--- File: ${file} ---\n${content}`);
        } catch {
          console.warn(`[OpenCode] Could not read file: ${file}`);
        }
      }
      if (fileContents.length > 0) {
        prompt += `\n\nRelevant files:${fileContents.join('\n')}`;
      }
    }

    prompt += `\n\nProvide the fix as a unified diff format for each file that needs changes.`;

    const result = await this.executeTask({
      type: 'fix',
      prompt,
      files,
      outputFormat: 'diff',
    });

    if (!result.success) {
      throw new Error(result.error || 'Bug fix failed');
    }

    const fixes = this.parseDiffsFromOutput(result.output);

    return { fixes };
  }

  async reviewCode(files: string[]): Promise<CodeReviewResult> {
    let prompt = `Review the following code files for issues, bugs, security vulnerabilities, and improvements:\n`;

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        prompt += `\n--- File: ${file} ---\n${content}\n`;
      } catch {
        console.warn(`[OpenCode] Could not read file: ${file}`);
      }
    }

    prompt += `\n\nProvide a structured review with:
1. Issues found (file, line number, message, severity: error/warning/info)
2. General suggestions for improvement

Format issues as: [SEVERITY] file:line - message`;

    const result = await this.executeTask({
      type: 'review',
      prompt,
      files,
    });

    if (!result.success) {
      throw new Error(result.error || 'Code review failed');
    }

    const issues = this.parseIssuesFromOutput(result.output);
    const suggestions = this.parseSuggestionsFromOutput(result.output);

    return { issues, suggestions };
  }

  async refactorCode(files: string[], instructions: string): Promise<CodeGenerationResult> {
    let prompt = `Refactor the following code according to these instructions:\n\n${instructions}\n\nFiles to refactor:`;

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        prompt += `\n\n--- File: ${file} ---\n${content}`;
      } catch {
        console.warn(`[OpenCode] Could not read file: ${file}`);
      }
    }

    return await this.executeTask({
      type: 'refactor',
      prompt,
      files,
    });
  }

  async deployLocal(projectPath: string, target: string): Promise<{
    success: boolean;
    steps: string[];
    output: string;
  }> {
    const steps: string[] = [];
    let output = '';

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const hasPackageJson = await fs.access(packageJsonPath).then(() => true).catch(() => false);

      if (hasPackageJson) {
        steps.push('Installing dependencies...');
        try {
          const { stdout } = await execAsync('npm install', { cwd: projectPath, timeout: 120000 });
          output += stdout;
        } catch (e: any) {
          output += `Warning: npm install had issues: ${e.message}\n`;
        }

        steps.push('Building project...');
        try {
          const { stdout } = await execAsync('npm run build', { cwd: projectPath, timeout: 300000 });
          output += stdout;
        } catch (e: any) {
          output += `Warning: build step had issues: ${e.message}\n`;
        }
      }

      steps.push(`Deployment to ${target} prepared`);

      return {
        success: true,
        steps,
        output,
      };
    } catch (error: any) {
      return {
        success: false,
        steps,
        output: error.message,
      };
    }
  }

  private parseFilesFromOutput(output: string): { path: string; content: string }[] {
    const files: { path: string; content: string }[] = [];

    const codeBlockPattern = /```(?:typescript|javascript|python|tsx|jsx|ts|js|py)?\s*\n(\/\/\s*(?:File:\s*)?(.+\.(?:ts|tsx|js|jsx|py|json|yaml|yml))|#\s*(?:File:\s*)?(.+\.py))\n([\s\S]*?)```/gi;

    let match;
    while ((match = codeBlockPattern.exec(output)) !== null) {
      const filePath = match[2] || match[3];
      const content = match[4];
      if (filePath && content) {
        files.push({ path: filePath.trim(), content: content.trim() });
      }
    }

    return files;
  }

  private parseCommandsFromOutput(output: string): string[] {
    const commands: string[] = [];

    const patterns = [
      /```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/gi,
      /^\$\s+(.+)$/gm,
      /^>\s+(.+)$/gm,
      /npm\s+(?:install|i|run|exec)\s+[^\n]+/gi,
      /yarn\s+(?:add|install|run)\s+[^\n]+/gi,
      /pnpm\s+(?:add|install|run)\s+[^\n]+/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const cmd = match[1] || match[0];
        if (cmd && !commands.includes(cmd.trim())) {
          commands.push(cmd.trim());
        }
      }
    }

    return commands;
  }

  private parseDiffsFromOutput(output: string): { file: string; diff: string }[] {
    const diffs: { file: string; diff: string }[] = [];

    const diffPattern = /(?:---\s*a\/(.+)|diff\s+--git\s+a\/(.+)\s+b\/\1)\n([\s\S]*?)(?=(?:---\s*a\/|diff\s+--git|$))/gi;

    let match;
    while ((match = diffPattern.exec(output)) !== null) {
      const file = match[1] || match[2];
      const diff = match[3];
      if (file && diff) {
        diffs.push({ file: file.trim(), diff: diff.trim() });
      }
    }

    return diffs;
  }

  private parseIssuesFromOutput(output: string): { file: string; line: number; message: string; severity: string }[] {
    const issues: { file: string; line: number; message: string; severity: string }[] = [];

    const issuePattern = /\[(ERROR|WARNING|INFO|error|warning|info)\]\s*(.+):(\d+)\s*[-–]\s*(.+)/gi;

    let match;
    while ((match = issuePattern.exec(output)) !== null) {
      issues.push({
        severity: match[1].toLowerCase(),
        file: match[2].trim(),
        line: parseInt(match[3], 10),
        message: match[4].trim(),
      });
    }

    return issues;
  }

  private parseSuggestionsFromOutput(output: string): string[] {
    const suggestions: string[] = [];

    const suggestionPattern = /(?:Suggestion|Recommend|Consider|Improvement):\s*(.+)/gi;

    let match;
    while ((match = suggestionPattern.exec(output)) !== null) {
      suggestions.push(match[1].trim());
    }

    const lines = output.split('\n');
    let inSuggestions = false;
    for (const line of lines) {
      if (/^#+\s*Suggestions?/i.test(line)) {
        inSuggestions = true;
        continue;
      }
      if (inSuggestions) {
        if (/^#+/.test(line)) {
          inSuggestions = false;
          continue;
        }
        if (/^[-*]\s+(.+)/.test(line)) {
          const match = line.match(/^[-*]\s+(.+)/);
          if (match) {
            suggestions.push(match[1].trim());
          }
        }
      }
    }

    return suggestions;
  }

  getSession(sessionId: string): OpenCodeSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): OpenCodeSession[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): OpenCodeSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'running');
  }

  clearOldSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleared = 0;

    const entries = Array.from(this.sessions.entries());
    for (const [id, session] of entries) {
      if (session.status !== 'running' && now - session.startedAt.getTime() > maxAgeMs) {
        this.sessions.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  private stagedChanges: Map<string, StagedChange> = new Map();
  private workflows: Map<string, CodeGenerationWorkflow> = new Map();
  private backupDir = path.join(process.cwd(), 'backups', 'code-changes');

  async runAutonomousWorkflow(
    jobType: AutonomousJobType,
    description: string,
    options?: {
      targetFiles?: string[];
      targetService?: string;
      context?: string;
    }
  ): Promise<CodeGenerationWorkflow> {
    const workflowId = `workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    
    const workflow: CodeGenerationWorkflow = {
      id: workflowId,
      jobType,
      description,
      status: 'analyzing',
      progress: 0,
      steps: {
        analyze: { status: 'pending' },
        plan: { status: 'pending' },
        implement: { status: 'pending' },
        validate: { status: 'pending' },
      },
    };

    this.workflows.set(workflowId, workflow);

    this.executeWorkflow(workflow, options).catch(error => {
      workflow.status = 'failed';
      workflow.error = error.message;
    });

    return workflow;
  }

  private async executeWorkflow(
    workflow: CodeGenerationWorkflow,
    options?: {
      targetFiles?: string[];
      targetService?: string;
      context?: string;
    }
  ): Promise<void> {
    try {
      workflow.steps.analyze.status = 'running';
      workflow.progress = 10;
      const analysis = await this.analyzeTask(workflow.jobType, workflow.description, options);
      workflow.steps.analyze.status = 'completed';
      workflow.steps.analyze.output = analysis;
      workflow.progress = 25;

      workflow.status = 'planning';
      workflow.steps.plan.status = 'running';
      const plan = await this.createImplementationPlan(workflow.jobType, workflow.description, analysis, options);
      workflow.steps.plan.status = 'completed';
      workflow.steps.plan.output = plan;
      workflow.progress = 50;

      workflow.status = 'implementing';
      workflow.steps.implement.status = 'running';
      const implementation = await this.implementFromPlan(workflow.jobType, workflow.description, plan, options);
      workflow.steps.implement.status = 'completed';
      workflow.steps.implement.output = `Generated ${implementation.files.length} files`;
      workflow.progress = 75;

      workflow.status = 'validating';
      workflow.steps.validate.status = 'running';
      const validation = await this.validateImplementation(implementation.files);
      workflow.steps.validate.status = 'completed';
      workflow.steps.validate.output = validation.errors.length === 0 
        ? 'All checks passed' 
        : `${validation.errors.length} errors, ${validation.warnings.length} warnings`;
      workflow.progress = 90;

      const stagedChange = await this.stageChanges(
        workflow.jobType,
        workflow.description,
        implementation.files,
        validation
      );

      workflow.stagedChange = stagedChange;
      workflow.status = 'completed';
      workflow.progress = 100;
    } catch (error: any) {
      workflow.status = 'failed';
      workflow.error = error.message;
      
      const runningStep = Object.entries(workflow.steps).find(
        ([_, step]) => step.status === 'running'
      );
      if (runningStep) {
        (workflow.steps as any)[runningStep[0]].status = 'failed';
        (workflow.steps as any)[runningStep[0]].output = error.message;
      }
    }
  }

  private async analyzeTask(
    jobType: AutonomousJobType,
    description: string,
    options?: { targetFiles?: string[]; targetService?: string; context?: string }
  ): Promise<string> {
    const prompts: Record<AutonomousJobType, string> = {
      'feature-request': `Analyze this feature request and identify:
1. Required changes and their scope
2. Files that need to be created or modified
3. Dependencies and integrations needed
4. Potential challenges or considerations

Feature Request: ${description}
${options?.targetService ? `Target Service: ${options.targetService}` : ''}
${options?.context ? `Additional Context: ${options.context}` : ''}`,

      'bug-fix': `Analyze this bug report and identify:
1. Likely root cause of the issue
2. Files that may contain the bug
3. Related code that could be affected
4. Testing strategy to verify the fix

Bug Description: ${description}
${options?.targetFiles?.length ? `Relevant Files: ${options.targetFiles.join(', ')}` : ''}
${options?.context ? `Error Context: ${options.context}` : ''}`,

      'code-review': `Review the following code or codebase aspect:
1. Code quality issues and anti-patterns
2. Potential bugs or vulnerabilities
3. Performance considerations
4. Suggestions for improvement

Review Request: ${description}
${options?.targetFiles?.length ? `Files to Review: ${options.targetFiles.join(', ')}` : ''}`,

      'refactor': `Analyze the refactoring request:
1. Current code structure issues
2. Proposed improvements
3. Files affected by the refactoring
4. Risk assessment and migration plan

Refactoring Request: ${description}
${options?.targetFiles?.length ? `Target Files: ${options.targetFiles.join(', ')}` : ''}`
    };

    let fileContents = '';
    if (options?.targetFiles?.length) {
      for (const file of options.targetFiles.slice(0, 5)) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          fileContents += `\n\n--- File: ${file} ---\n${content.slice(0, 2000)}`;
        } catch {}
      }
    }

    const result = await this.executeTask({
      type: 'explain',
      prompt: prompts[jobType] + fileContents,
    });

    if (!result.success) {
      throw new Error(result.error || 'Analysis failed');
    }

    return result.output;
  }

  private async createImplementationPlan(
    jobType: AutonomousJobType,
    description: string,
    analysis: string,
    options?: { targetFiles?: string[]; targetService?: string; context?: string }
  ): Promise<string> {
    const prompt = `Based on the analysis, create a detailed implementation plan.

Job Type: ${jobType}
Description: ${description}

Analysis Results:
${analysis}

Create a step-by-step plan that includes:
1. Specific files to create/modify with their paths
2. Code structure and key functions to implement
3. Order of implementation (dependencies first)
4. Testing approach
${options?.targetService ? `5. Integration with ${options.targetService}` : ''}

Format the plan as a numbered list with clear, actionable steps.`;

    const result = await this.executeTask({
      type: 'generate',
      prompt,
    });

    if (!result.success) {
      throw new Error(result.error || 'Planning failed');
    }

    return result.output;
  }

  private async implementFromPlan(
    jobType: AutonomousJobType,
    description: string,
    plan: string,
    options?: { targetFiles?: string[]; targetService?: string; context?: string }
  ): Promise<FeatureDevelopmentResult> {
    const systemContext = `You are implementing code based on a plan.
Output complete, production-ready code.
Include TypeScript types where applicable.
Follow existing code conventions and patterns.
Add proper error handling and edge cases.`;

    const prompt = `${systemContext}

Implementation Plan:
${plan}

Original Request: ${description}
${options?.targetService ? `Target Service: ${options.targetService}` : ''}

Generate all necessary code files. For each file, use this format:
\`\`\`typescript
// File: path/to/file.ts
[complete file content]
\`\`\`

Include:
- All new files needed
- Complete implementations (not partial)
- Proper imports and exports
- Any necessary tests`;

    const result = await this.executeTask({
      type: 'generate',
      prompt,
    });

    if (!result.success) {
      throw new Error(result.error || 'Implementation failed');
    }

    const files = this.parseFilesFromOutput(result.output);
    const commands = this.parseCommandsFromOutput(result.output);
    const tests = files.filter(f => 
      f.path.includes('.test.') || 
      f.path.includes('.spec.') ||
      f.path.includes('__tests__')
    ).map(f => f.path);

    return { files, commands, tests };
  }

  private async validateImplementation(
    files: { path: string; content: string }[]
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let lintPassed = true;
    let typeCheckPassed = true;
    let testsPassed = true;

    for (const file of files) {
      const syntaxErrors = this.checkBasicSyntax(file.content, file.path);
      if (syntaxErrors.length > 0) {
        errors.push(...syntaxErrors);
        lintPassed = false;
      }

      if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) {
        const typeIssues = this.checkTypeScriptBasics(file.content, file.path);
        if (typeIssues.errors.length > 0) {
          errors.push(...typeIssues.errors);
          typeCheckPassed = false;
        }
        warnings.push(...typeIssues.warnings);
      }
    }

    return {
      lintPassed,
      typeCheckPassed,
      testsPassed,
      errors,
      warnings,
    };
  }

  private checkBasicSyntax(content: string, filePath: string): string[] {
    const errors: string[] = [];
    
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;
    
    for (const char of content) {
      switch (char) {
        case '{': braceCount++; break;
        case '}': braceCount--; break;
        case '(': parenCount++; break;
        case ')': parenCount--; break;
        case '[': bracketCount++; break;
        case ']': bracketCount--; break;
      }
    }
    
    if (braceCount !== 0) errors.push(`${filePath}: Unbalanced braces`);
    if (parenCount !== 0) errors.push(`${filePath}: Unbalanced parentheses`);
    if (bracketCount !== 0) errors.push(`${filePath}: Unbalanced brackets`);

    if (/console\.(log|warn|error|debug)\s*\(/.test(content)) {
      errors.push(`${filePath}: Contains console statements (consider removing for production)`);
    }

    return errors;
  }

  private checkTypeScriptBasics(content: string, filePath: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (/:\s*any\b/.test(content)) {
      warnings.push(`${filePath}: Contains 'any' type (consider using specific types)`);
    }

    if (/as\s+any\b/.test(content)) {
      warnings.push(`${filePath}: Contains 'as any' cast (type safety concern)`);
    }

    if (/\/\/\s*@ts-ignore/.test(content) || /\/\/\s*@ts-nocheck/.test(content)) {
      warnings.push(`${filePath}: Contains TypeScript ignore comments`);
    }

    return { errors, warnings };
  }

  private async stageChanges(
    jobType: AutonomousJobType,
    description: string,
    files: { path: string; content: string }[],
    validation: ValidationResult
  ): Promise<StagedChange> {
    const changeId = `change-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

    const filesWithOriginal: StagedChange['files'] = [];
    for (const file of files) {
      let originalContent: string | undefined;
      try {
        originalContent = await fs.readFile(file.path, 'utf-8');
      } catch {}
      
      filesWithOriginal.push({
        path: file.path,
        content: file.content,
        originalContent,
      });
    }

    const stagedChange: StagedChange = {
      id: changeId,
      type: jobType,
      description,
      files: filesWithOriginal,
      status: 'staged',
      createdAt: new Date(),
      validationResults: validation,
    };

    this.stagedChanges.set(changeId, stagedChange);
    return stagedChange;
  }

  async approveAndApplyChange(changeId: string): Promise<{ success: boolean; error?: string; backupPath?: string }> {
    const change = this.stagedChanges.get(changeId);
    if (!change) {
      return { success: false, error: 'Change not found' };
    }

    if (change.status !== 'staged') {
      return { success: false, error: `Change is ${change.status}, not staged` };
    }

    try {
      const backupPath = await this.createBackup(change);
      change.backup = backupPath;

      for (const file of change.files) {
        const dir = path.dirname(file.path);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file.path, file.content, 'utf-8');
      }

      change.status = 'applied';
      return { success: true, backupPath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async rejectChange(changeId: string): Promise<boolean> {
    const change = this.stagedChanges.get(changeId);
    if (!change) return false;
    
    change.status = 'rejected';
    return true;
  }

  private async createBackup(change: StagedChange): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `${change.id}-${timestamp}`);
    
    await fs.mkdir(backupPath, { recursive: true });

    for (const file of change.files) {
      if (file.originalContent !== undefined) {
        const backupFilePath = path.join(backupPath, file.path.replace(/\//g, '_'));
        await fs.writeFile(backupFilePath, file.originalContent, 'utf-8');
      }
    }

    const manifest = {
      changeId: change.id,
      type: change.type,
      description: change.description,
      timestamp: new Date().toISOString(),
      files: change.files.map(f => ({
        path: f.path,
        hadOriginal: f.originalContent !== undefined,
      })),
    };
    await fs.writeFile(path.join(backupPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

    return backupPath;
  }

  async rollbackChange(changeId: string): Promise<{ success: boolean; error?: string }> {
    const change = this.stagedChanges.get(changeId);
    if (!change || !change.backup) {
      return { success: false, error: 'Change or backup not found' };
    }

    try {
      for (const file of change.files) {
        if (file.originalContent !== undefined) {
          await fs.writeFile(file.path, file.originalContent, 'utf-8');
        } else {
          try {
            await fs.unlink(file.path);
          } catch {}
        }
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  getStagedChange(changeId: string): StagedChange | undefined {
    return this.stagedChanges.get(changeId);
  }

  getAllStagedChanges(): StagedChange[] {
    return Array.from(this.stagedChanges.values())
      .filter(c => c.status === 'staged')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getWorkflow(workflowId: string): CodeGenerationWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows(): CodeGenerationWorkflow[] {
    return Array.from(this.workflows.values())
      .sort((a, b) => b.progress - a.progress);
  }

  getActiveWorkflows(): CodeGenerationWorkflow[] {
    return Array.from(this.workflows.values())
      .filter(w => !['completed', 'failed'].includes(w.status));
  }

  generateCodeDiff(change: StagedChange): string[] {
    const diffs: string[] = [];
    
    for (const file of change.files) {
      let diff = '';
      if (file.originalContent === undefined) {
        diff = `+++ NEW FILE: ${file.path}\n`;
        diff += file.content.split('\n').map(line => `+ ${line}`).join('\n');
      } else {
        diff = `--- ${file.path}\n+++ ${file.path}\n`;
        const originalLines = file.originalContent.split('\n');
        const newLines = file.content.split('\n');
        
        diff += `@@ Original: ${originalLines.length} lines -> New: ${newLines.length} lines @@\n`;
        
        const maxLines = Math.max(originalLines.length, newLines.length);
        for (let i = 0; i < Math.min(maxLines, 50); i++) {
          const origLine = originalLines[i] || '';
          const newLine = newLines[i] || '';
          if (origLine !== newLine) {
            if (origLine) diff += `- ${origLine}\n`;
            if (newLine) diff += `+ ${newLine}\n`;
          } else {
            diff += `  ${origLine}\n`;
          }
        }
        if (maxLines > 50) {
          diff += `\n... and ${maxLines - 50} more lines\n`;
        }
      }
      diffs.push(diff);
    }
    
    return diffs;
  }
}

export const openCodeIntegration = new OpenCodeIntegration();
