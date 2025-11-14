import OpenAI from "openai";
import { UserStorage } from "./user-storage";
import type { GameSettings, GameHistory, InsertGameHistory, InsertActiveTriviaQuestion } from "@shared/schema";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface GameResult {
  success: boolean;
  message: string;
  outcome?: "win" | "loss" | "neutral";
  pointsAwarded?: number;
  details?: any;
}

const SLOT_SYMBOLS = ["🍒", "🍋", "💎", "🔔", "⭐", "7️⃣"];

export class GamesService {
  constructor(private storage: UserStorage) {}

  async play8Ball(question: string): Promise<GameResult> {
    try {
      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a mystical Magic 8-Ball fortune teller. Respond to questions with creative, entertaining, and varied fortune-telling style answers. Keep responses under 150 characters. Be mysterious, slightly cryptic, and entertaining. Mix positive, negative, and neutral responses.

Examples:
- "The stars align in your favor... perhaps"
- "My crystal ball says: Definitely not, sorry friend"
- "The spirits whisper: Ask again when Mercury isn't in retrograde"
- "The ancient runes reveal: Without a doubt!"
- "The cosmic forces are unclear on this matter"
- "The universe laughs at your question... in a good way"

Generate a unique Magic 8-Ball response to this question.`
          },
          {
            role: "user",
            content: question
          }
        ],
        max_tokens: 100,
        temperature: 1.2,
      });

      const response = completion.choices[0]?.message?.content?.trim() || "The Magic 8-Ball is cloudy... try again later";

      return {
        success: true,
        message: `🎱 ${response}`,
        outcome: "neutral",
        pointsAwarded: 0,
        details: { question, response }
      };
    } catch (error: any) {
      console.error("[GamesService] Error generating 8ball response:", error);
      
      const fallbackResponses = [
        "The spirits are busy right now, try again later",
        "My powers are weak today... ask again",
        "The cosmos is experiencing technical difficulties",
        "Error in the astral plane, please retry"
      ];
      
      return {
        success: true,
        message: `🎱 ${fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]}`,
        outcome: "neutral",
        pointsAwarded: 0,
        details: { question, response: "error" }
      };
    }
  }

  async playTrivia(difficulty: "easy" | "medium" | "hard", player: string, userId: string, platform: string): Promise<GameResult> {
    try {
      const difficultyPrompts = {
        easy: "Generate a fun, easy trivia question that most people should know. Topics: pop culture, basic history, common knowledge.",
        medium: "Generate a moderately challenging trivia question. Topics: science, geography, entertainment, sports.",
        hard: "Generate a difficult trivia question that requires specialized knowledge. Topics: advanced science, obscure history, niche topics."
      };

      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a trivia game master. ${difficultyPrompts[difficulty]}

Format your response EXACTLY like this (on separate lines):
Q: [Your question here]
A: [The answer here]

Keep questions clear and answers concise (1-3 words). Make it fun and engaging!`
          },
          {
            role: "user",
            content: "Generate a trivia question"
          }
        ],
        max_tokens: 150,
        temperature: 0.9,
      });

      const response = completion.choices[0]?.message?.content?.trim() || "";
      
      const questionMatch = response.match(/Q:\s*(.+)/i);
      const answerMatch = response.match(/A:\s*(.+)/i);

      if (!questionMatch || !answerMatch) {
        throw new Error("Invalid trivia format");
      }

      const question = questionMatch[1].trim();
      const answer = answerMatch[1].trim();

      const expiresAt = new Date(Date.now() + 30000);

      await this.storage.createActiveTriviaQuestion({
        userId,
        player,
        platform,
        question,
        correctAnswer: answer.toLowerCase(),
        difficulty,
        expiresAt,
      });

      return {
        success: true,
        message: `🧠 Trivia Time! (${difficulty}) - ${question} | You have 30 seconds to answer!`,
        outcome: "neutral",
        pointsAwarded: 0,
        details: { question, difficulty }
      };
    } catch (error: any) {
      console.error("[GamesService] Error generating trivia:", error);
      return {
        success: false,
        message: "❌ Failed to generate trivia question. Try again!",
        outcome: "neutral",
        pointsAwarded: 0
      };
    }
  }

  async checkTriviaAnswer(player: string, userId: string, platform: string, answer: string): Promise<GameResult | null> {
    const activeQuestion = await this.storage.getActiveTriviaQuestion(userId, player, platform);
    
    if (!activeQuestion) {
      return null;
    }

    if (new Date() > new Date(activeQuestion.expiresAt)) {
      await this.storage.deleteActiveTriviaQuestion(activeQuestion.id);
      return {
        success: false,
        message: `⏰ Time's up, ${player}! The answer was: ${activeQuestion.correctAnswer}`,
        outcome: "loss",
        pointsAwarded: 0,
        details: { 
          question: activeQuestion.question,
          correctAnswer: activeQuestion.correctAnswer,
          userAnswer: answer,
          timedOut: true
        }
      };
    }

    const normalizedAnswer = answer.toLowerCase().trim();
    const correctAnswer = activeQuestion.correctAnswer.toLowerCase().trim();
    
    const isCorrect = normalizedAnswer === correctAnswer || 
                     normalizedAnswer.includes(correctAnswer) ||
                     correctAnswer.includes(normalizedAnswer);

    await this.storage.deleteActiveTriviaQuestion(activeQuestion.id);

    const settings = await this.storage.getGameSettings();
    const pointsAwarded = isCorrect ? (settings?.pointsPerWin || 10) : 0;

    if (isCorrect) {
      return {
        success: true,
        message: `✅ Correct, ${player}! You earned ${pointsAwarded} points! 🎉`,
        outcome: "win",
        pointsAwarded,
        details: {
          question: activeQuestion.question,
          correctAnswer: activeQuestion.correctAnswer,
          userAnswer: answer,
          correct: true
        }
      };
    } else {
      return {
        success: false,
        message: `❌ Wrong answer, ${player}! The correct answer was: ${activeQuestion.correctAnswer}`,
        outcome: "loss",
        pointsAwarded: 0,
        details: {
          question: activeQuestion.question,
          correctAnswer: activeQuestion.correctAnswer,
          userAnswer: answer,
          correct: false
        }
      };
    }
  }

  async playDuel(player1: string, player2: string): Promise<GameResult> {
    const winner = Math.random() < 0.5 ? player1 : player2;
    const loser = winner === player1 ? player2 : player1;

    const battleMessages = [
      `⚔️ ${winner} strikes with lightning speed and defeats ${loser}! ${loser} is timed out for 1 minute!`,
      `💥 ${winner} lands a critical hit! ${loser} has been vanquished and timed out for 1 minute!`,
      `🛡️ ${winner} blocks ${loser}'s attack and counters with a devastating blow! ${loser} gets 1 minute timeout!`,
      `✨ ${winner} uses their ultimate ability and obliterates ${loser}! ${loser} is silenced for 1 minute!`,
      `🎯 ${winner} dodges ${loser}'s attack and strikes back for the win! ${loser} gets 1 minute timeout!`,
      `⚡ ${winner} channels their inner power and overwhelms ${loser}! ${loser} is timed out for 1 minute!`,
      `🔥 ${winner} unleashes a fury of attacks! ${loser} couldn't keep up and gets 1 minute timeout!`,
      `🌟 In an epic battle, ${winner} emerges victorious over ${loser}! ${loser} is timed out for 1 minute!`
    ];

    const message = battleMessages[Math.floor(Math.random() * battleMessages.length)];
    const settings = await this.storage.getGameSettings();
    const pointsAwarded = settings?.pointsPerWin || 10;

    return {
      success: true,
      message,
      outcome: "win",
      pointsAwarded,
      details: { winner, loser, player1, player2, timeout: true, timeoutDuration: 60 }
    };
  }

  async playSlots(): Promise<GameResult> {
    const slots = [
      SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
      SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
      SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]
    ];

    const isWin = slots[0] === slots[1] && slots[1] === slots[2];
    const settings = await this.storage.getGameSettings();
    const pointsAwarded = isWin ? (settings?.pointsPerWin || 10) * 2 : 0;

    if (isWin) {
      return {
        success: true,
        message: `🎰 ${slots.join(" | ")} 🎰 JACKPOT! You won ${pointsAwarded} points! 💰`,
        outcome: "win",
        pointsAwarded,
        details: { slots, jackpot: true }
      };
    } else {
      return {
        success: true,
        message: `🎰 ${slots.join(" | ")} 🎰 Better luck next time!`,
        outcome: "loss",
        pointsAwarded: 0,
        details: { slots, jackpot: false }
      };
    }
  }

  async playRoulette(player: string): Promise<GameResult> {
    const isShot = Math.random() < (1 / 6);
    const settings = await this.storage.getGameSettings();
    const pointsAwarded = !isShot ? (settings?.pointsPerWin || 10) * 3 : 0;

    if (isShot) {
      return {
        success: true,
        message: `💀 *BANG!* ${player} got timed out for 5 minutes! The chamber wasn't empty!`,
        outcome: "loss",
        pointsAwarded: 0,
        details: { shot: true, timeout: true, timeoutDuration: 300 }
      };
    } else {
      return {
        success: true,
        message: `😌 *click* ${player} survives! The chamber was empty. You won ${pointsAwarded} points! 🎊`,
        outcome: "win",
        pointsAwarded,
        details: { shot: false, timeout: false }
      };
    }
  }

  async trackGamePlay(
    gameType: "8ball" | "trivia" | "duel" | "slots" | "roulette",
    player: string,
    outcome: "win" | "loss" | "neutral",
    platform: string,
    pointsAwarded: number = 0,
    opponent?: string,
    details?: any
  ): Promise<void> {
    try {
      await this.storage.createGameHistory({
        userId: this.storage.userId,
        gameType,
        player,
        opponent: opponent || null,
        outcome,
        pointsAwarded,
        details: details || null,
        platform,
      });

      // Update aggregated game stats
      await this.storage.upsertGameStats({
        userId: this.storage.userId,
        username: player,
        gameName: gameType,
        platform,
        wins: outcome === "win" ? 1 : 0,
        losses: outcome === "loss" ? 1 : 0,
        neutral: outcome === "neutral" ? 1 : 0,
        totalPlays: 1,
        totalPointsEarned: pointsAwarded,
      });
    } catch (error) {
      console.error("[GamesService] Error tracking game play:", error);
    }
  }

  async getGameStats(): Promise<{
    byGame: Record<string, { plays: number; wins: number; losses: number; neutral: number }>;
    total: { plays: number; wins: number; losses: number; neutral: number };
  }> {
    try {
      const history = await this.storage.getGameHistory();
      
      const byGame: Record<string, { plays: number; wins: number; losses: number; neutral: number }> = {
        "8ball": { plays: 0, wins: 0, losses: 0, neutral: 0 },
        "trivia": { plays: 0, wins: 0, losses: 0, neutral: 0 },
        "duel": { plays: 0, wins: 0, losses: 0, neutral: 0 },
        "slots": { plays: 0, wins: 0, losses: 0, neutral: 0 },
        "roulette": { plays: 0, wins: 0, losses: 0, neutral: 0 },
      };

      const total = { plays: 0, wins: 0, losses: 0, neutral: 0 };

      for (const game of history) {
        if (byGame[game.gameType]) {
          byGame[game.gameType].plays++;
          byGame[game.gameType][game.outcome]++;
          
          total.plays++;
          total[game.outcome]++;
        }
      }

      return { byGame, total };
    } catch (error) {
      console.error("[GamesService] Error getting game stats:", error);
      return {
        byGame: {
          "8ball": { plays: 0, wins: 0, losses: 0, neutral: 0 },
          "trivia": { plays: 0, wins: 0, losses: 0, neutral: 0 },
          "duel": { plays: 0, wins: 0, losses: 0, neutral: 0 },
          "slots": { plays: 0, wins: 0, losses: 0, neutral: 0 },
          "roulette": { plays: 0, wins: 0, losses: 0, neutral: 0 },
        },
        total: { plays: 0, wins: 0, losses: 0, neutral: 0 }
      };
    }
  }
}
