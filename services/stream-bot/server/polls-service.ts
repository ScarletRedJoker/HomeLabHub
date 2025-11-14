import axios from "axios";
import { UserStorage } from "./user-storage";
import { currencyService } from "./currency-service";
import { getEnv } from "./env";
import type {
  Poll,
  PollVote,
  Prediction,
  PredictionBet,
  InsertPoll,
  InsertPollVote,
  InsertPrediction,
  InsertPredictionBet,
} from "@shared/schema";

interface PollResults {
  poll: Poll;
  votes: { option: string; count: number; percentage: number }[];
  totalVotes: number;
  winner?: string;
}

interface PredictionResults {
  prediction: Prediction;
  bets: { outcome: string; totalPoints: number; totalBets: number; percentage: number }[];
  totalPoints: number;
  totalBets: number;
  winningOutcome?: string;
}

export class PollsService {
  constructor(private storage: UserStorage) {}

  async createPoll(
    userId: string,
    question: string,
    options: string[],
    duration: number,
    platform: string
  ): Promise<Poll> {
    const pollData: InsertPoll = {
      userId,
      question,
      options,
      duration,
      platform,
      status: "pending",
    };

    const poll = await this.storage.createPoll(pollData);
    console.log(`[PollsService] Created poll ${poll.id} for user ${userId}`);
    return poll;
  }

  async startPoll(pollId: string): Promise<{ poll: Poll; message: string }> {
    const poll = await this.storage.getPoll(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    if (poll.status !== "pending") {
      throw new Error("Poll already started or ended");
    }

    let twitchPollId: string | undefined;

    // Use Twitch native polls for Twitch platform
    if (poll.platform === "twitch") {
      try {
        const twitchConnection = await this.storage.getPlatformConnectionByPlatform("twitch");
        if (twitchConnection?.accessToken && twitchConnection.platformUserId) {
          twitchPollId = await this.createTwitchPoll(
            twitchConnection.accessToken,
            twitchConnection.platformUserId,
            poll.question,
            poll.options,
            poll.duration
          );
          console.log(`[PollsService] Created Twitch native poll ${twitchPollId}`);
        }
      } catch (error) {
        console.error("[PollsService] Failed to create Twitch native poll:", error);
        // Fall back to custom polling system
      }
    }

    const updatedPoll = await this.storage.updatePoll(pollId, {
      status: "active",
      startedAt: new Date(),
      twitchPollId,
    });

    // Schedule poll end
    setTimeout(() => {
      this.endPoll(pollId).catch((error) => {
        console.error(`[PollsService] Failed to auto-end poll ${pollId}:`, error);
      });
    }, poll.duration * 1000);

    const message = `📊 Poll started: ${poll.question}\nOptions: ${poll.options.map((opt, i) => `${i + 1}. ${opt}`).join(" | ")}\nVote with !vote <number> | Duration: ${poll.duration}s`;

    return { poll: updatedPoll, message };
  }

  async vote(pollId: string, username: string, option: string, platform: string): Promise<{ success: boolean; message: string }> {
    const poll = await this.storage.getPoll(pollId);
    if (!poll) {
      return { success: false, message: "Poll not found" };
    }

    if (poll.status !== "active") {
      return { success: false, message: "Poll is not active" };
    }

    if (!poll.options.includes(option)) {
      return { success: false, message: "Invalid poll option" };
    }

    // Check if user already voted
    const existingVote = await this.storage.getPollVoteByUser(pollId, username, platform);
    if (existingVote) {
      return { success: false, message: "You have already voted on this poll" };
    }

    const voteData: InsertPollVote = {
      pollId,
      username,
      option,
      platform,
    };

    await this.storage.createPollVote(voteData);
    await this.storage.incrementPollVotes(pollId);

    console.log(`[PollsService] ${username} voted for "${option}" on poll ${pollId}`);
    return { success: true, message: `Your vote for "${option}" has been recorded!` };
  }

  async endPoll(pollId: string): Promise<{ poll: Poll; results: PollResults; message: string }> {
    const poll = await this.storage.getPoll(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    if (poll.status !== "active") {
      throw new Error("Poll is not active");
    }

    // Get vote counts for each option
    const votes = await this.storage.getPollVotes(pollId);
    const voteCounts = poll.options.map((option) => ({
      option,
      count: votes.filter((v) => v.option === option).length,
    }));

    const totalVotes = voteCounts.reduce((sum, v) => sum + v.count, 0);
    const maxVotes = Math.max(...voteCounts.map((v) => v.count));
    const winners = voteCounts.filter((v) => v.count === maxVotes && maxVotes > 0);
    const winner = winners.length === 1 ? winners[0].option : undefined;

    // End Twitch native poll if it exists
    if (poll.platform === "twitch" && poll.twitchPollId) {
      try {
        const twitchConnection = await this.storage.getPlatformConnectionByPlatform("twitch");
        if (twitchConnection?.accessToken && twitchConnection.platformUserId) {
          await this.endTwitchPoll(
            twitchConnection.accessToken,
            twitchConnection.platformUserId,
            poll.twitchPollId
          );
        }
      } catch (error) {
        console.error("[PollsService] Failed to end Twitch native poll:", error);
      }
    }

    const updatedPoll = await this.storage.updatePoll(pollId, {
      status: "ended",
      endedAt: new Date(),
      totalVotes,
      winner,
    });

    const results: PollResults = {
      poll: updatedPoll,
      votes: voteCounts.map((v) => ({
        ...v,
        percentage: totalVotes > 0 ? Math.round((v.count / totalVotes) * 100) : 0,
      })),
      totalVotes,
      winner,
    };

    const resultMessage = `📊 Poll ended: ${poll.question}\nResults:\n${voteCounts.map((v) => `${v.option}: ${v.count} votes (${Math.round((v.count / totalVotes) * 100) || 0}%)`).join("\n")}${winner ? `\n🏆 Winner: ${winner}` : "\n🤝 It's a tie!"}`;

    return { poll: updatedPoll, results, message: resultMessage };
  }

  async getPollResults(pollId: string): Promise<PollResults> {
    const poll = await this.storage.getPoll(pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    const votes = await this.storage.getPollVotes(pollId);
    const voteCounts = poll.options.map((option) => ({
      option,
      count: votes.filter((v) => v.option === option).length,
    }));

    const totalVotes = poll.totalVotes || voteCounts.reduce((sum, v) => sum + v.count, 0);

    return {
      poll,
      votes: voteCounts.map((v) => ({
        ...v,
        percentage: totalVotes > 0 ? Math.round((v.count / totalVotes) * 100) : 0,
      })),
      totalVotes,
      winner: poll.winner,
    };
  }

  async getActivePoll(userId: string, platform?: string): Promise<Poll | null> {
    return await this.storage.getActivePoll(userId, platform);
  }

  async getPollHistory(userId: string, limit: number = 20): Promise<Poll[]> {
    return await this.storage.getPollHistory(userId, limit);
  }

  async createPrediction(
    userId: string,
    title: string,
    outcomes: string[],
    duration: number,
    platform: string
  ): Promise<Prediction> {
    const predictionData: InsertPrediction = {
      userId,
      title,
      outcomes,
      duration,
      platform,
      status: "pending",
    };

    const prediction = await this.storage.createPrediction(predictionData);
    console.log(`[PollsService] Created prediction ${prediction.id} for user ${userId}`);
    return prediction;
  }

  async startPrediction(predictionId: string): Promise<{ prediction: Prediction; message: string }> {
    const prediction = await this.storage.getPrediction(predictionId);
    if (!prediction) {
      throw new Error("Prediction not found");
    }

    if (prediction.status !== "pending") {
      throw new Error("Prediction already started or ended");
    }

    let twitchPredictionId: string | undefined;

    // Use Twitch native predictions for Twitch platform
    if (prediction.platform === "twitch") {
      try {
        const twitchConnection = await this.storage.getPlatformConnectionByPlatform("twitch");
        if (twitchConnection?.accessToken && twitchConnection.platformUserId) {
          twitchPredictionId = await this.createTwitchPrediction(
            twitchConnection.accessToken,
            twitchConnection.platformUserId,
            prediction.title,
            prediction.outcomes
          );
          console.log(`[PollsService] Created Twitch native prediction ${twitchPredictionId}`);
        }
      } catch (error) {
        console.error("[PollsService] Failed to create Twitch native prediction:", error);
        // Fall back to custom prediction system
      }
    }

    const updatedPrediction = await this.storage.updatePrediction(predictionId, {
      status: "active",
      startedAt: new Date(),
      twitchPredictionId,
    });

    // Schedule prediction lock (betting closes before end)
    const lockTime = Math.max(prediction.duration - 60, prediction.duration / 2); // Lock 60s before end or at halfway
    setTimeout(() => {
      this.lockPrediction(predictionId).catch((error) => {
        console.error(`[PollsService] Failed to lock prediction ${predictionId}:`, error);
      });
    }, lockTime * 1000);

    const message = `🔮 Prediction started: ${prediction.title}\nOutcomes: ${prediction.outcomes.map((opt, i) => `${i + 1}. ${opt}`).join(" | ")}\nPlace bets with !bet <outcome> <points> | Betting closes in ${lockTime}s`;

    return { prediction: updatedPrediction, message };
  }

  async lockPrediction(predictionId: string): Promise<Prediction> {
    const prediction = await this.storage.getPrediction(predictionId);
    if (!prediction) {
      throw new Error("Prediction not found");
    }

    if (prediction.status !== "active") {
      throw new Error("Prediction is not active");
    }

    // Lock Twitch native prediction if it exists
    if (prediction.platform === "twitch" && prediction.twitchPredictionId) {
      try {
        const twitchConnection = await this.storage.getPlatformConnectionByPlatform("twitch");
        if (twitchConnection?.accessToken && twitchConnection.platformUserId) {
          await this.lockTwitchPrediction(
            twitchConnection.accessToken,
            twitchConnection.platformUserId,
            prediction.twitchPredictionId
          );
        }
      } catch (error) {
        console.error("[PollsService] Failed to lock Twitch native prediction:", error);
      }
    }

    return await this.storage.updatePrediction(predictionId, {
      status: "locked",
      lockedAt: new Date(),
    });
  }

  async placeBet(
    predictionId: string,
    username: string,
    outcome: string,
    points: number,
    platform: string
  ): Promise<{ success: boolean; message: string }> {
    const prediction = await this.storage.getPrediction(predictionId);
    if (!prediction) {
      return { success: false, message: "Prediction not found" };
    }

    if (prediction.status !== "active") {
      return { success: false, message: "Betting is closed for this prediction" };
    }

    if (!prediction.outcomes.includes(outcome)) {
      return { success: false, message: "Invalid prediction outcome" };
    }

    if (points < 1) {
      return { success: false, message: "Minimum bet is 1 point" };
    }

    // Check if user already bet
    const existingBet = await this.storage.getPredictionBetByUser(predictionId, username, platform);
    if (existingBet) {
      return { success: false, message: "You have already placed a bet on this prediction" };
    }

    // Check if user has enough points
    const balance = await currencyService.getBalance(prediction.userId, username, platform);
    if (balance < points) {
      return { success: false, message: `Insufficient points. You have ${balance} points.` };
    }

    // Deduct points from user
    await currencyService.addPoints(
      prediction.userId,
      username,
      platform,
      -points,
      `Bet on prediction: ${prediction.title}`
    );

    const betData: InsertPredictionBet = {
      predictionId,
      username,
      outcome,
      points,
      platform,
    };

    await this.storage.createPredictionBet(betData);
    await this.storage.incrementPredictionStats(predictionId, points);

    console.log(`[PollsService] ${username} bet ${points} points on "${outcome}" for prediction ${predictionId}`);
    return { success: true, message: `You bet ${points} points on "${outcome}"!` };
  }

  async resolvePrediction(
    predictionId: string,
    winningOutcome: string
  ): Promise<{ prediction: Prediction; results: PredictionResults; message: string }> {
    const prediction = await this.storage.getPrediction(predictionId);
    if (!prediction) {
      throw new Error("Prediction not found");
    }

    if (prediction.status !== "locked" && prediction.status !== "active") {
      throw new Error("Prediction cannot be resolved");
    }

    if (!prediction.outcomes.includes(winningOutcome)) {
      throw new Error("Invalid winning outcome");
    }

    // Get all bets
    const allBets = await this.storage.getPredictionBets(predictionId);
    const winningBets = allBets.filter((bet) => bet.outcome === winningOutcome);
    const totalWinningPoints = winningBets.reduce((sum, bet) => sum + bet.points, 0);
    const totalPoints = allBets.reduce((sum, bet) => sum + bet.points, 0);

    // Calculate and distribute payouts
    if (winningBets.length > 0 && totalWinningPoints > 0) {
      for (const bet of winningBets) {
        const winPercentage = bet.points / totalWinningPoints;
        const payout = Math.floor(totalPoints * winPercentage);

        // Update bet payout
        await this.storage.updatePredictionBet(bet.id, { payout });

        // Award points to winner
        await currencyService.addPoints(
          prediction.userId,
          bet.username,
          bet.platform,
          payout,
          `Won prediction: ${prediction.title}`
        );

        console.log(`[PollsService] ${bet.username} won ${payout} points from prediction ${predictionId}`);
      }
    }

    // Resolve Twitch native prediction if it exists
    if (prediction.platform === "twitch" && prediction.twitchPredictionId) {
      try {
        const twitchConnection = await this.storage.getPlatformConnectionByPlatform("twitch");
        if (twitchConnection?.accessToken && twitchConnection.platformUserId) {
          // Find the outcome ID for the winning outcome
          const outcomeIndex = prediction.outcomes.indexOf(winningOutcome);
          await this.resolveTwitchPrediction(
            twitchConnection.accessToken,
            twitchConnection.platformUserId,
            prediction.twitchPredictionId,
            outcomeIndex.toString() // Twitch uses outcome IDs
          );
        }
      } catch (error) {
        console.error("[PollsService] Failed to resolve Twitch native prediction:", error);
      }
    }

    const updatedPrediction = await this.storage.updatePrediction(predictionId, {
      status: "resolved",
      endedAt: new Date(),
      winningOutcome,
    });

    const betCounts = prediction.outcomes.map((outcome) => {
      const outcomeBets = allBets.filter((b) => b.outcome === outcome);
      return {
        outcome,
        totalPoints: outcomeBets.reduce((sum, b) => sum + b.points, 0),
        totalBets: outcomeBets.length,
      };
    });

    const results: PredictionResults = {
      prediction: updatedPrediction,
      bets: betCounts.map((b) => ({
        ...b,
        percentage: totalPoints > 0 ? Math.round((b.totalPoints / totalPoints) * 100) : 0,
      })),
      totalPoints,
      totalBets: allBets.length,
      winningOutcome,
    };

    const resultMessage = `🔮 Prediction resolved: ${prediction.title}\n🏆 Winner: ${winningOutcome}\nTotal bets: ${allBets.length} (${totalPoints} points)\nWinning bets: ${winningBets.length} (${totalWinningPoints} points)`;

    return { prediction: updatedPrediction, results, message: resultMessage };
  }

  async cancelPrediction(predictionId: string): Promise<Prediction> {
    const prediction = await this.storage.getPrediction(predictionId);
    if (!prediction) {
      throw new Error("Prediction not found");
    }

    if (prediction.status === "resolved" || prediction.status === "cancelled") {
      throw new Error("Prediction already ended");
    }

    // Refund all bets
    const allBets = await this.storage.getPredictionBets(predictionId);
    for (const bet of allBets) {
      await currencyService.addPoints(
        prediction.userId,
        bet.username,
        bet.platform,
        bet.points,
        `Refund from cancelled prediction: ${prediction.title}`
      );
    }

    // Cancel Twitch native prediction if it exists
    if (prediction.platform === "twitch" && prediction.twitchPredictionId) {
      try {
        const twitchConnection = await this.storage.getPlatformConnectionByPlatform("twitch");
        if (twitchConnection?.accessToken && twitchConnection.platformUserId) {
          await this.cancelTwitchPrediction(
            twitchConnection.accessToken,
            twitchConnection.platformUserId,
            prediction.twitchPredictionId
          );
        }
      } catch (error) {
        console.error("[PollsService] Failed to cancel Twitch native prediction:", error);
      }
    }

    return await this.storage.updatePrediction(predictionId, {
      status: "cancelled",
      endedAt: new Date(),
    });
  }

  async getPredictionResults(predictionId: string): Promise<PredictionResults> {
    const prediction = await this.storage.getPrediction(predictionId);
    if (!prediction) {
      throw new Error("Prediction not found");
    }

    const allBets = await this.storage.getPredictionBets(predictionId);
    const totalPoints = allBets.reduce((sum, bet) => sum + bet.points, 0);

    const betCounts = prediction.outcomes.map((outcome) => {
      const outcomeBets = allBets.filter((b) => b.outcome === outcome);
      return {
        outcome,
        totalPoints: outcomeBets.reduce((sum, b) => sum + b.points, 0),
        totalBets: outcomeBets.length,
      };
    });

    return {
      prediction,
      bets: betCounts.map((b) => ({
        ...b,
        percentage: totalPoints > 0 ? Math.round((b.totalPoints / totalPoints) * 100) : 0,
      })),
      totalPoints,
      totalBets: allBets.length,
      winningOutcome: prediction.winningOutcome || undefined,
    };
  }

  async getActivePrediction(userId: string, platform?: string): Promise<Prediction | null> {
    return await this.storage.getActivePrediction(userId, platform);
  }

  async getPredictionHistory(userId: string, limit: number = 20): Promise<Prediction[]> {
    return await this.storage.getPredictionHistory(userId, limit);
  }

  // Twitch API methods
  private async createTwitchPoll(
    accessToken: string,
    broadcasterId: string,
    title: string,
    choices: string[],
    duration: number
  ): Promise<string> {
    const clientId = getEnv("TWITCH_CLIENT_ID");
    if (!clientId) {
      throw new Error("TWITCH_CLIENT_ID not configured");
    }

    const response = await axios.post(
      "https://api.twitch.tv/helix/polls",
      {
        broadcaster_id: broadcasterId,
        title,
        choices: choices.map((title) => ({ title })),
        duration,
      },
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.data[0].id;
  }

  private async endTwitchPoll(
    accessToken: string,
    broadcasterId: string,
    pollId: string
  ): Promise<void> {
    const clientId = getEnv("TWITCH_CLIENT_ID");
    if (!clientId) {
      throw new Error("TWITCH_CLIENT_ID not configured");
    }

    await axios.patch(
      "https://api.twitch.tv/helix/polls",
      {
        broadcaster_id: broadcasterId,
        id: pollId,
        status: "TERMINATED",
      },
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  }

  private async createTwitchPrediction(
    accessToken: string,
    broadcasterId: string,
    title: string,
    outcomes: string[]
  ): Promise<string> {
    const clientId = getEnv("TWITCH_CLIENT_ID");
    if (!clientId) {
      throw new Error("TWITCH_CLIENT_ID not configured");
    }

    const response = await axios.post(
      "https://api.twitch.tv/helix/predictions",
      {
        broadcaster_id: broadcasterId,
        title,
        outcomes: outcomes.map((title) => ({ title })),
        prediction_window: 300, // 5 minutes betting window
      },
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.data[0].id;
  }

  private async lockTwitchPrediction(
    accessToken: string,
    broadcasterId: string,
    predictionId: string
  ): Promise<void> {
    const clientId = getEnv("TWITCH_CLIENT_ID");
    if (!clientId) {
      throw new Error("TWITCH_CLIENT_ID not configured");
    }

    await axios.patch(
      "https://api.twitch.tv/helix/predictions",
      {
        broadcaster_id: broadcasterId,
        id: predictionId,
        status: "LOCKED",
      },
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  }

  private async resolveTwitchPrediction(
    accessToken: string,
    broadcasterId: string,
    predictionId: string,
    winningOutcomeId: string
  ): Promise<void> {
    const clientId = getEnv("TWITCH_CLIENT_ID");
    if (!clientId) {
      throw new Error("TWITCH_CLIENT_ID not configured");
    }

    await axios.patch(
      "https://api.twitch.tv/helix/predictions",
      {
        broadcaster_id: broadcasterId,
        id: predictionId,
        status: "RESOLVED",
        winning_outcome_id: winningOutcomeId,
      },
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  }

  private async cancelTwitchPrediction(
    accessToken: string,
    broadcasterId: string,
    predictionId: string
  ): Promise<void> {
    const clientId = getEnv("TWITCH_CLIENT_ID");
    if (!clientId) {
      throw new Error("TWITCH_CLIENT_ID not configured");
    }

    await axios.patch(
      "https://api.twitch.tv/helix/predictions",
      {
        broadcaster_id: broadcasterId,
        id: predictionId,
        status: "CANCELED",
      },
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  }
}
