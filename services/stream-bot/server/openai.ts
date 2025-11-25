// Reference: javascript_openai_ai_integrations blueprint
import OpenAI from "openai";
import pRetry, { AbortError } from "p-retry";
import { getOpenAIConfig, isReplit } from "../src/config/environment";

// Use environment-aware configuration
let openai: OpenAI | null = null;
let isOpenAIEnabled = false;

try {
  const config = getOpenAIConfig();
  openai = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  });
  isOpenAIEnabled = true;
  const envType = isReplit() ? "Replit" : "Production";
  console.log(`[OpenAI] AI Service initialized with ${envType} credentials`);
  console.log(`[OpenAI]   Base URL: ${config.baseURL}`);
  console.log(`[OpenAI]   Model: ${config.model}`);
} catch (error) {
  console.warn(`[OpenAI] AI features disabled: ${error instanceof Error ? error.message : String(error)}`);
}

export { isOpenAIEnabled };

// Helper function to check if error is rate limit or quota violation
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// Topic categories for variety - rotates each call to avoid repetition
const FACT_TOPICS = [
  "space and astronomy (planets, stars, black holes, galaxies, astronauts)",
  "ocean life and marine biology (deep sea creatures, coral reefs, whales, sharks)",
  "ancient history and civilizations (Egypt, Rome, Mayans, Vikings, medieval times)",
  "the human body and biology (organs, cells, brain, evolution, genetics)",
  "food science and culinary facts (ingredients, cooking, nutrition, unusual foods)",
  "world geography and natural wonders (mountains, deserts, islands, weather)",
  "inventions and technology breakthroughs (who invented what, tech history)",
  "music and art history (famous artists, instruments, paintings, sculptures)",
  "mathematics and numbers (weird math facts, famous mathematicians, patterns)",
  "weird laws and unusual traditions around the world",
  "insects and small creatures (ants, bees, spiders, butterflies)",
  "plants and trees (flowers, forests, carnivorous plants, weird botany)",
  "birds and flight (exotic birds, migration, feathers, nests)",
  "weather and natural disasters (tornadoes, lightning, volcanoes, earthquakes)",
  "sports and Olympic history (records, unusual sports, athletes)",
  "movies and entertainment industry (Hollywood, animation, special effects)",
  "psychology and the human mind (dreams, emotions, perception, memory)",
  "architecture and famous buildings (skyscrapers, bridges, ancient structures)",
  "language and linguistics (word origins, alphabets, rare languages)",
  "dinosaurs and prehistoric life (fossils, extinction, giant creatures)",
];

// Track last used topic index to rotate
let lastTopicIndex = -1;

function getRotatingTopic(): string {
  lastTopicIndex = (lastTopicIndex + 1) % FACT_TOPICS.length;
  return FACT_TOPICS[lastTopicIndex];
}

function buildFactPrompt(recentFacts?: string[]): string {
  const topic = getRotatingTopic();
  
  let avoidSection = "";
  if (recentFacts && recentFacts.length > 0) {
    avoidSection = `\nAvoid these recent facts:\n${recentFacts.slice(0, 3).map(f => `- ${f.substring(0, 50)}`).join('\n')}\n`;
  }
  
  return `Write a single Snapple cap fact about: ${topic}

STRICT RULES:
- MUST be under 90 characters total
- Short, punchy, one sentence
- No intro phrases like "Did you know" or "Fun fact:"
- Just state the fact directly
${avoidSection}
Examples of good short facts:
- "A group of flamingos is called a flamboyance."
- "Honey never spoils."
- "Octopuses have three hearts."

Your fact (under 90 chars):`;
}

const DEFAULT_PROMPT = buildFactPrompt();

export async function generateSnappleFact(customPrompt?: string, model?: string, recentFacts?: string[]): Promise<string> {
  if (!isOpenAIEnabled || !openai) {
    throw new Error("AI features are not available. Please configure AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL.");
  }

  // Use custom prompt if provided, otherwise build a rotating topic prompt
  const prompt = customPrompt || buildFactPrompt(recentFacts);

  // Use configured model from environment
  const config = getOpenAIConfig();
  const primaryModel = model || config.model;

  console.log("[OpenAI] Generating fact with model:", primaryModel);
  console.log("[OpenAI] Using prompt:", prompt.substring(0, 100) + "...");

  // Use configured model as primary, fallback to gpt-4o for production compatibility
  const modelsToTry = [primaryModel, "gpt-4o"].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const currentModel of modelsToTry) {
    try {
      console.log("[OpenAI] Calling OpenAI API with model:", currentModel);
      const response = await openai.chat.completions.create({
        model: currentModel,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 60,
        temperature: 0.9,
      });
      
      console.log("[OpenAI] Response received, choices:", response.choices?.length || 0);
      console.log("[OpenAI] Response content length:", response.choices[0]?.message?.content?.length || 0);
      
      const fact = response.choices[0]?.message?.content?.trim() || "";
      
      if (!fact) {
        console.log("[OpenAI] Empty fact from", currentModel, "- trying next model");
        continue; // Try next model
      }
      
      // Remove quotes if the AI wrapped the fact in them
      let cleanedFact = fact.replace(/^["']|["']$/g, "").trim();
      
      // HARD ENFORCEMENT: Truncate to 90 characters if too long
      // Try to truncate at a sentence boundary if possible
      if (cleanedFact.length > 90) {
        console.log(`[OpenAI] Fact too long (${cleanedFact.length} chars), truncating to 90`);
        
        // Try to find a natural break point (period, exclamation, or question mark) within 90 chars
        const truncated = cleanedFact.substring(0, 90);
        const lastSentenceEnd = Math.max(
          truncated.lastIndexOf('.'),
          truncated.lastIndexOf('!'),
          truncated.lastIndexOf('?')
        );
        
        if (lastSentenceEnd > 50) {
          // Found a good sentence boundary
          cleanedFact = truncated.substring(0, lastSentenceEnd + 1);
        } else {
          // No good boundary, truncate at word boundary and add ellipsis
          const lastSpace = truncated.substring(0, 87).lastIndexOf(' ');
          cleanedFact = lastSpace > 50 ? truncated.substring(0, lastSpace) + '...' : truncated.substring(0, 87) + '...';
        }
      }
      
      console.log(`[OpenAI] Final fact (${cleanedFact.length} chars): ${cleanedFact}`);
      
      return cleanedFact;
    } catch (error: any) {
      console.error("[OpenAI] Error with model", currentModel, ":", error.message || error);
      // Continue to next model instead of throwing
    }
  }

  // If all models failed, throw an error
  throw new Error("Failed to generate fact with any available model");
}
