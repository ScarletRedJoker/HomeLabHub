import { generateContent } from '../ai-content-service';

export interface TitleSuggestion {
  title: string;
  score: number;
  reason: string;
}

export interface TitleGeneratorOptions {
  game: string;
  vibe?: 'chill' | 'hype' | 'competitive' | 'funny' | 'educational';
  platform?: 'twitch' | 'youtube' | 'kick';
  includeEmoji?: boolean;
  maxLength?: number;
  count?: number;
}

const VIBE_DESCRIPTORS: Record<string, string> = {
  chill: 'relaxed, cozy, laid-back atmosphere',
  hype: 'exciting, energetic, high-intensity',
  competitive: 'serious, focused, grinding for wins',
  funny: 'humorous, entertaining, meme-friendly',
  educational: 'informative, helpful, teaching-focused'
};

export async function generateTitles(options: TitleGeneratorOptions): Promise<TitleSuggestion[]> {
  const { 
    game, 
    vibe = 'hype', 
    platform = 'twitch',
    includeEmoji = true,
    maxLength = 60,
    count = 3 
  } = options;

  const prompt = `Generate ${count} engaging ${platform} stream titles for playing ${game}.

Requirements:
- Maximum ${maxLength} characters each
- ${includeEmoji ? 'Include 1-2 relevant emojis' : 'No emojis'}
- Vibe: ${VIBE_DESCRIPTORS[vibe] || vibe}
- Must be clickable and attention-grabbing
- No clickbait or misleading promises
- Avoid overused phrases like "INSANE" or "YOU WON'T BELIEVE"

Return ONLY valid JSON array:
[
  { "title": "Title here", "score": 8, "reason": "Why this works" },
  { "title": "Another title", "score": 7, "reason": "Why this works" }
]`;

  try {
    const result = await generateContent({
      type: 'title',
      gameOrCategory: game,
      tone: vibe === 'hype' ? 'hype' : vibe === 'chill' ? 'chill' : 'casual',
      platform,
      context: prompt,
      maxLength
    });

    if (!result.success || !result.content) {
      return getDefaultTitles(game, vibe);
    }

    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return getDefaultTitles(game, vibe);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title?: string;
      score?: number;
      reason?: string;
    }>;

    return parsed
      .filter(t => t.title && t.title.length <= maxLength + 10)
      .map(t => ({
        title: t.title!.substring(0, maxLength),
        score: typeof t.score === 'number' ? Math.min(10, Math.max(0, t.score)) : 5,
        reason: t.reason || 'AI generated suggestion'
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  } catch (error) {
    console.error('[TitleGenerator] Error:', error);
    return getDefaultTitles(game, vibe);
  }
}

function getDefaultTitles(game: string, vibe: string): TitleSuggestion[] {
  const templates: Record<string, string[]> = {
    hype: [
      `🔥 ${game} - Let's GO!`,
      `${game} Time! 🎮`,
      `Grinding ${game} 💪`
    ],
    chill: [
      `☕ Chill ${game} vibes`,
      `Relaxing ${game} session 🌙`,
      `Cozy ${game} stream ✨`
    ],
    competitive: [
      `${game} Ranked Grind 🏆`,
      `Climbing in ${game} 📈`,
      `${game} - Road to Top 💎`
    ],
    funny: [
      `${game} but I'm bad 😂`,
      `Trying ${game} again... 🤡`,
      `${game} chaos incoming 🎪`
    ],
    educational: [
      `Learning ${game} together 📚`,
      `${game} Tips & Tricks 💡`,
      `${game} Guide Stream 🎓`
    ]
  };

  const vibeTemplates = templates[vibe] || templates.hype;
  return vibeTemplates.map((title, i) => ({
    title,
    score: 5 - i,
    reason: 'Default template'
  }));
}

export async function improveTitleWithFeedback(
  originalTitle: string,
  feedback: string
): Promise<TitleSuggestion[]> {
  const prompt = `Improve this stream title based on feedback:

Original: "${originalTitle}"
Feedback: "${feedback}"

Generate 3 improved versions. Return JSON array:
[{ "title": "...", "score": 0-10, "reason": "..." }]`;

  try {
    const result = await generateContent({
      type: 'title',
      context: prompt,
      existingContent: originalTitle
    });

    if (!result.success) {
      return [{ title: originalTitle, score: 5, reason: 'Could not improve' }];
    }

    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [{ title: originalTitle, score: 5, reason: 'Parse error' }];
    }

    const parsed = JSON.parse(jsonMatch[0]) as TitleSuggestion[];
    return parsed.slice(0, 3);
  } catch {
    return [{ title: originalTitle, score: 5, reason: 'Error occurred' }];
  }
}

export const titleGenerator = {
  generate: generateTitles,
  improve: improveTitleWithFeedback
};

export default titleGenerator;
