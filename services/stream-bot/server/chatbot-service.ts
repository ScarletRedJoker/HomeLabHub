import OpenAI from "openai";
import { UserStorage } from "./user-storage";
import type { ChatbotSettings, ChatbotResponse, ChatbotContext } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

// Personality presets with system prompts
const PERSONALITY_PRESETS: Record<string, string> = {
  friendly: `You are a friendly and warm chat assistant for a livestream. You're helpful, kind, and supportive. Use emojis occasionally to show warmth. Keep responses brief (under 200 chars) and conversational. Be encouraging and positive while staying on-topic.`,
  
  snarky: `You are a snarky, witty chat assistant with a playful attitude. You use clever comebacks, light sarcasm, and humor. Keep it fun and entertaining without being mean. Responses should be brief (under 200 chars) and punchy. Think of yourself as the stream's comedic sidekick.`,
  
  professional: `You are a professional, knowledgeable assistant for a livestream. Provide clear, concise, and helpful information. Maintain a polite and respectful tone. Keep responses under 200 characters and focus on being informative and accurate.`,
  
  enthusiastic: `You are an enthusiastic and energetic chat assistant! You're SUPER excited about everything and love to hype up the stream! Use lots of exclamation points and positive energy! Keep responses brief (under 200 chars) but full of excitement! LET'S GOOO!`,
  
  chill: `You are a chill, laid-back chat assistant. Keep things relaxed and casual. Use a calm, easygoing tone with occasional slang like "yeah", "cool", "nice". Keep responses brief (under 200 chars) and don't stress about anything. Just vibing with the chat.`,
  
  custom: `` // Will be replaced by user's custom prompt
};

interface ConversationMessage {
  message: string;
  timestamp: string;
  isBot: boolean;
}

export class ChatbotService {
  constructor(private storage: UserStorage) {}

  /**
   * Process an incoming message and generate an AI response
   */
  async processMessage(username: string, message: string, platform: string): Promise<string> {
    const startTime = Date.now();
    
    // Get chatbot settings
    const settings = await this.storage.getChatbotSettings();
    if (!settings || !settings.isEnabled) {
      throw new Error("Chatbot is not enabled");
    }

    // Build conversation context
    const context = await this.buildContext(username, platform);

    // Generate AI response
    const response = await this.generateResponse(message, context, settings);

    // Track response for learning
    const processingTime = Date.now() - startTime;
    await this.trackResponse(username, platform, message, response, settings.personality, {
      temperature: settings.temperature / 10,
      contextSize: context.length,
      processingTime
    });

    // Update conversation context
    await this.updateContext(username, platform, message, response);

    return response;
  }

  /**
   * Build conversation context from recent messages
   */
  async buildContext(username: string, platform: string): Promise<ConversationMessage[]> {
    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      return [];
    }

    // Get existing context
    const contextRecord = await this.storage.getChatbotContext(username, platform);
    
    if (contextRecord && contextRecord.recentMessages) {
      const messages = contextRecord.recentMessages as ConversationMessage[];
      // Return only the most recent messages based on contextWindow setting
      return messages.slice(-settings.contextWindow);
    }

    return [];
  }

  /**
   * Generate AI response using OpenAI with personality
   */
  async generateResponse(
    message: string,
    context: ConversationMessage[],
    settings: ChatbotSettings
  ): Promise<string> {
    // Get personality system prompt
    let systemPrompt = PERSONALITY_PRESETS[settings.personality];
    if (settings.personality === 'custom' && settings.customPersonalityPrompt) {
      systemPrompt = settings.customPersonalityPrompt;
    }

    // Build conversation history for context
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt }
    ];

    // Add recent conversation context
    for (const msg of context) {
      messages.push({
        role: msg.isBot ? "assistant" : "user",
        content: msg.message
      });
    }

    // Add current message
    messages.push({
      role: "user",
      content: message
    });

    try {
      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        max_completion_tokens: 150,
      });

      const aiResponse = response.choices[0]?.message?.content?.trim() || "";
      
      if (!aiResponse) {
        throw new Error("Empty response from AI");
      }

      return aiResponse;
    } catch (error: any) {
      console.error("[ChatbotService] Error generating response:", error);
      
      // Fallback response on error
      if (settings.personality === 'snarky') {
        return "My brain just blue-screened. Try again? 🤖";
      } else if (settings.personality === 'enthusiastic') {
        return "OH NO! Something went wrong! Let's try that again! 💥";
      } else if (settings.personality === 'chill') {
        return "Eh, something glitched. No worries, try again later.";
      } else {
        return "Sorry, I'm having trouble responding right now. Please try again!";
      }
    }
  }

  /**
   * Track response for learning and analytics
   */
  async trackResponse(
    username: string,
    platform: string,
    message: string,
    response: string,
    personality: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.storage.createChatbotResponse({
      username,
      platform,
      message,
      response,
      personality,
      metadata
    });
  }

  /**
   * Update conversation context with new message and response
   */
  async updateContext(
    username: string,
    platform: string,
    userMessage: string,
    botResponse: string
  ): Promise<void> {
    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      return;
    }

    // Get existing context or create new
    let contextRecord = await this.storage.getChatbotContext(username, platform);
    
    const newUserMessage: ConversationMessage = {
      message: userMessage,
      timestamp: new Date().toISOString(),
      isBot: false
    };

    const newBotMessage: ConversationMessage = {
      message: botResponse,
      timestamp: new Date().toISOString(),
      isBot: true
    };

    if (contextRecord) {
      // Update existing context
      const messages = (contextRecord.recentMessages as ConversationMessage[]) || [];
      messages.push(newUserMessage, newBotMessage);
      
      // Keep only the most recent messages based on contextWindow
      const trimmedMessages = messages.slice(-settings.contextWindow * 2); // *2 for user+bot pairs

      await this.storage.updateChatbotContext(contextRecord.id, {
        recentMessages: trimmedMessages as any,
        messageCount: contextRecord.messageCount + 2,
        lastSeen: new Date()
      });
    } else {
      // Create new context
      await this.storage.createChatbotContext({
        username,
        platform,
        recentMessages: [newUserMessage, newBotMessage] as any,
        messageCount: 2,
        lastSeen: new Date()
      });
    }
  }

  /**
   * Get response statistics for analytics
   */
  async getStats(): Promise<{
    totalResponses: number;
    helpfulResponses: number;
    unhelpfulResponses: number;
    avgEngagementScore: number;
    responsesByPersonality: Record<string, number>;
  }> {
    const responses = await this.storage.getChatbotResponses();
    
    const totalResponses = responses.length;
    const helpfulResponses = responses.filter(r => r.wasHelpful === true).length;
    const unhelpfulResponses = responses.filter(r => r.wasHelpful === false).length;
    
    const avgEngagementScore = responses.length > 0
      ? responses.reduce((sum, r) => sum + r.engagementScore, 0) / responses.length
      : 0;

    const responsesByPersonality: Record<string, number> = {};
    for (const response of responses) {
      responsesByPersonality[response.personality] = (responsesByPersonality[response.personality] || 0) + 1;
    }

    return {
      totalResponses,
      helpfulResponses,
      unhelpfulResponses,
      avgEngagementScore,
      responsesByPersonality
    };
  }

  /**
   * Mark a response as helpful or not helpful for learning
   */
  async markResponseFeedback(responseId: string, wasHelpful: boolean): Promise<void> {
    await this.storage.updateChatbotResponse(responseId, { wasHelpful });
  }

  /**
   * Check if user is rate limited
   */
  async isRateLimited(username: string, platform: string): Promise<boolean> {
    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      return true; // Default to rate limited if no settings
    }

    const context = await this.storage.getChatbotContext(username, platform);
    if (!context || !context.lastSeen) {
      return false; // No previous interaction, not rate limited
    }

    const lastSeenTime = new Date(context.lastSeen).getTime();
    const now = Date.now();
    const secondsSinceLastMessage = (now - lastSeenTime) / 1000;

    return secondsSinceLastMessage < settings.responseRate;
  }

  /**
   * Test chatbot with a message (for testing interface)
   */
  async testChat(message: string): Promise<{ response: string; metadata: any }> {
    const startTime = Date.now();
    
    const settings = await this.storage.getChatbotSettings();
    if (!settings) {
      throw new Error("Chatbot settings not found");
    }

    // Use empty context for testing
    const response = await this.generateResponse(message, [], settings);
    const processingTime = Date.now() - startTime;

    return {
      response,
      metadata: {
        personality: settings.personality,
        temperature: settings.temperature / 10,
        processingTime
      }
    };
  }
}
