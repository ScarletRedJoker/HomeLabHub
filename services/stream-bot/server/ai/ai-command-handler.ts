/**
 * AI Command Handler for Stream Bot
 * 
 * Handles chat commands that trigger AI actions:
 * - !imagine <prompt> - Generate an image with Stable Diffusion
 * - !ask <question> - Get AI text response from Ollama
 * - !workflow <name> - Execute a ComfyUI workflow
 * - !ai-status - Check AI service status
 * 
 * Includes rate limiting, moderation safeguards, and result delivery
 */

import { unifiedAIClient, type AIServiceStatus } from './unified-ai-client';
import { aiRateLimiter, type CommandType } from './ai-rate-limiter';

export interface AICommandResult {
  success: boolean;
  response?: string;
  imageUrl?: string;
  imageBase64?: string;
  error?: string;
  cooldownMessage?: string;
}

export interface AICommandContext {
  platform: 'twitch' | 'youtube' | 'kick';
  username: string;
  channelId: string;
  isModerator: boolean;
  isSubscriber: boolean;
}

const BANNED_WORDS = [
  'nsfw', 'nude', 'naked', 'porn', 'sex', 'xxx', 'hentai',
  'gore', 'violence', 'blood', 'death', 'kill', 'murder',
  'racist', 'nazi', 'hate', 'slur',
];

function containsBannedContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BANNED_WORDS.some(word => lowerText.includes(word));
}

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[<>{}[\]\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

export async function handleAICommand(
  message: string,
  context: AICommandContext
): Promise<AICommandResult | null> {
  const trimmedMessage = message.trim().toLowerCase();
  
  if (trimmedMessage.startsWith('!imagine ')) {
    return handleImagineCommand(message, context);
  }
  
  if (trimmedMessage.startsWith('!ask ')) {
    return handleAskCommand(message, context);
  }
  
  if (trimmedMessage.startsWith('!workflow ')) {
    return handleWorkflowCommand(message, context);
  }
  
  if (trimmedMessage === '!ai-status' || trimmedMessage === '!aistatus') {
    return handleAIStatusCommand(context);
  }
  
  return null;
}

async function handleImagineCommand(
  message: string,
  context: AICommandContext
): Promise<AICommandResult> {
  const prompt = message.substring('!imagine '.length).trim();
  
  if (!prompt) {
    return { success: false, response: '@' + context.username + ' Please provide a prompt! Usage: !imagine <description>' };
  }
  
  if (containsBannedContent(prompt)) {
    return { success: false, response: '@' + context.username + ' Sorry, that prompt contains restricted content.' };
  }
  
  const rateLimitResult = aiRateLimiter.consume('imagine', context.username, context.platform);
  if (!rateLimitResult.allowed) {
    return { success: false, cooldownMessage: '@' + context.username + ' ' + rateLimitResult.message };
  }
  
  const sanitizedPrompt = sanitizePrompt(prompt);
  
  const job = unifiedAIClient.createJob('image', context.platform, context.username, context.channelId, {
    prompt: sanitizedPrompt,
  });
  
  unifiedAIClient.updateJob(job.id, { status: 'running' });
  
  const result = await unifiedAIClient.generateImage({
    prompt: sanitizedPrompt,
    width: 512,
    height: 512,
    steps: 20,
  });
  
  if (!result.success) {
    unifiedAIClient.updateJob(job.id, { status: 'failed', error: result.error });
    return {
      success: false,
      response: '@' + context.username + ' Image generation failed. Please try again later.',
    };
  }
  
  unifiedAIClient.updateJob(job.id, { status: 'completed', result: { seed: result.seed } });
  
  const imageUrl = await uploadImageToHost(result.imageBase64!, job.id);
  
  return {
    success: true,
    imageBase64: result.imageBase64,
    imageUrl,
    response: imageUrl 
      ? '@' + context.username + ' Your image is ready! ' + imageUrl + ' (Seed: ' + result.seed + ')'
      : '@' + context.username + ' Image generated! (Seed: ' + result.seed + ', Time: ' + Math.round((result.generationTimeMs || 0) / 1000) + 's) - View on dashboard',
  };
}

async function uploadImageToHost(imageBase64: string, jobId: string): Promise<string | null> {
  const dashboardUrl = process.env.DASHBOARD_URL || process.env.REPL_SLUG 
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : null;
  
  if (!dashboardUrl) {
    return null;
  }
  
  try {
    const response = await fetch(`${dashboardUrl}/api/ai/images/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, jobId }),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.url || null;
    }
  } catch (error) {
    console.error('[AI Commands] Failed to upload image:', error);
  }
  
  return null;
}

async function handleAskCommand(
  message: string,
  context: AICommandContext
): Promise<AICommandResult> {
  const question = message.substring('!ask '.length).trim();
  
  if (!question) {
    return { success: false, response: '@' + context.username + ' Please provide a question! Usage: !ask <question>' };
  }
  
  if (containsBannedContent(question)) {
    return { success: false, response: '@' + context.username + ' Sorry, that question contains restricted content.' };
  }
  
  const rateLimitResult = aiRateLimiter.consume('ask', context.username, context.platform);
  if (!rateLimitResult.allowed) {
    return { success: false, cooldownMessage: '@' + context.username + ' ' + rateLimitResult.message };
  }
  
  const job = unifiedAIClient.createJob('text', context.platform, context.username, context.channelId, {
    prompt: question,
  });
  
  unifiedAIClient.updateJob(job.id, { status: 'running' });
  
  const result = await unifiedAIClient.generateText({
    prompt: question,
    maxTokens: 100,
    personality: 'helpful',
  });
  
  if (!result.success) {
    unifiedAIClient.updateJob(job.id, { status: 'failed', error: result.error });
    return {
      success: false,
      response: '@' + context.username + ' AI is currently unavailable. Please try again later.',
    };
  }
  
  unifiedAIClient.updateJob(job.id, { status: 'completed' });
  
  const responseText = result.text?.substring(0, 400) || 'No response generated';
  
  return {
    success: true,
    response: '@' + context.username + ' ' + responseText,
  };
}

async function handleWorkflowCommand(
  message: string,
  context: AICommandContext
): Promise<AICommandResult> {
  const workflowName = message.substring('!workflow '.length).trim();
  
  if (!workflowName) {
    return { success: false, response: '@' + context.username + ' Please provide a workflow name! Usage: !workflow <name>' };
  }
  
  if (!context.isModerator) {
    return { success: false, response: '@' + context.username + ' Workflow execution is restricted to moderators.' };
  }
  
  const rateLimitResult = aiRateLimiter.consume('workflow', context.username, context.platform);
  if (!rateLimitResult.allowed) {
    return { success: false, cooldownMessage: '@' + context.username + ' ' + rateLimitResult.message };
  }
  
  const job = unifiedAIClient.createJob('workflow', context.platform, context.username, context.channelId, {
    prompt: workflowName,
  });
  
  unifiedAIClient.updateJob(job.id, { status: 'running' });
  
  const result = await unifiedAIClient.executeWorkflow({
    workflowName,
  });
  
  if (!result.success) {
    unifiedAIClient.updateJob(job.id, { status: 'failed', error: result.error });
    return {
      success: false,
      response: '@' + context.username + ' Workflow execution failed: ' + (result.error || 'Unknown error'),
    };
  }
  
  unifiedAIClient.updateJob(job.id, { status: 'completed' });
  
  return {
    success: true,
    response: '@' + context.username + ' Workflow "' + workflowName + '" queued successfully!',
  };
}

async function handleAIStatusCommand(context: AICommandContext): Promise<AICommandResult> {
  const status = await unifiedAIClient.checkServiceHealth();
  
  const statusParts: string[] = [];
  
  if (status.ollama.available) {
    statusParts.push('Ollama: Online (' + (status.ollama.model || 'unknown') + ')');
  } else {
    statusParts.push('Ollama: Offline');
  }
  
  if (status.stableDiffusion.available) {
    statusParts.push('SD: Online');
  } else {
    statusParts.push('SD: Offline');
  }
  
  if (status.comfyui.available) {
    statusParts.push('ComfyUI: Online');
  } else {
    statusParts.push('ComfyUI: Offline');
  }
  
  return {
    success: true,
    response: '@' + context.username + ' AI Status: ' + statusParts.join(' | '),
  };
}

export async function getAIStatus(): Promise<AIServiceStatus> {
  return unifiedAIClient.checkServiceHealth();
}
