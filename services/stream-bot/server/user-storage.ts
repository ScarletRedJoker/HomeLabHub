import { storage, IStorage } from "./storage";
import type {
  PlatformConnection,
  InsertPlatformConnection,
  UpdatePlatformConnection,
  BotConfig,
  InsertBotConfig,
  UpdateBotConfig,
  MessageHistory,
  InsertMessageHistory,
  CustomCommand,
  ModerationRule,
  ModerationLog,
  LinkWhitelist,
  Giveaway,
  GiveawayEntry,
  GiveawayWinner,
  Shoutout,
  GameSettings,
  GameHistory,
  ActiveTriviaQuestion,
  GameStats,
  InsertModerationLog,
  InsertGiveaway,
  InsertGiveawayEntry,
  InsertGiveawayWinner,
  InsertShoutout,
  InsertGameSettings,
  InsertGameHistory,
  InsertActiveTriviaQuestion,
  InsertGameStats,
  UpdateGiveaway,
  UpdateShoutout,
  UpdateGameSettings,
  CurrencySettings,
  UserBalance,
  CurrencyTransaction,
  CurrencyReward,
  InsertCurrencySettings,
  InsertCurrencyReward,
  UpdateCurrencySettings,
  UpdateCurrencyReward,
  ShoutoutSettings,
  UpdateShoutoutSettings,
  Poll,
  PollVote,
  Prediction,
  PredictionBet,
  InsertPoll,
  InsertPollVote,
  InsertPrediction,
  InsertPredictionBet,
  UpdatePoll,
  UpdatePrediction,
  AlertSettings,
  AlertHistory,
  Milestone,
  InsertAlertSettings,
  InsertAlertHistory,
  InsertMilestone,
  UpdateAlertSettings,
  UpdateMilestone,
} from "@shared/schema";

export class UserStorage {
  constructor(private userId: string) {}

  getUserId(): string {
    return this.userId;
  }

  // Platform Connections
  async getPlatformConnections(): Promise<PlatformConnection[]> {
    return storage.getPlatformConnections(this.userId);
  }

  async getPlatformConnectionByPlatform(platform: string): Promise<PlatformConnection | undefined> {
    return storage.getPlatformConnectionByPlatform(this.userId, platform);
  }

  async createPlatformConnection(data: InsertPlatformConnection): Promise<PlatformConnection> {
    return storage.createPlatformConnection(this.userId, data);
  }

  async updatePlatformConnection(id: string, data: UpdatePlatformConnection): Promise<PlatformConnection> {
    return storage.updatePlatformConnection(this.userId, id, data);
  }

  async deletePlatformConnection(id: string): Promise<void> {
    return storage.deletePlatformConnection(this.userId, id);
  }

  // Bot Config
  async getBotConfig(): Promise<BotConfig | undefined> {
    return storage.getBotConfig(this.userId);
  }

  async createBotConfig(data: InsertBotConfig): Promise<BotConfig> {
    return storage.createBotConfig(this.userId, data);
  }

  async updateBotConfig(data: UpdateBotConfig): Promise<BotConfig> {
    return storage.updateBotConfig(this.userId, data);
  }

  // Message History
  async getMessages(): Promise<MessageHistory[]> {
    return storage.getMessages(this.userId);
  }

  async getRecentMessages(limit?: number): Promise<MessageHistory[]> {
    return storage.getRecentMessages(this.userId, limit);
  }

  async createMessage(data: InsertMessageHistory): Promise<MessageHistory> {
    return storage.createMessage(this.userId, data);
  }

  // Custom Commands
  async getCustomCommandByName(name: string): Promise<CustomCommand | undefined> {
    return storage.getCustomCommandByName(this.userId, name);
  }

  async incrementCommandUsage(id: string): Promise<void> {
    return storage.incrementCommandUsage(this.userId, id);
  }

  async getCustomCommands(): Promise<CustomCommand[]> {
    return storage.getCustomCommands(this.userId);
  }

  // Moderation Rules
  async getModerationRules(): Promise<ModerationRule[]> {
    return storage.getModerationRules(this.userId);
  }

  // Moderation Logs
  async createModerationLog(data: InsertModerationLog): Promise<ModerationLog> {
    return storage.createModerationLog(this.userId, data);
  }

  // Link Whitelist
  async getLinkWhitelist(): Promise<LinkWhitelist[]> {
    return storage.getLinkWhitelist(this.userId);
  }

  // Giveaways
  async getGiveaways(limit?: number): Promise<Giveaway[]> {
    return storage.getGiveaways(this.userId, limit);
  }

  async getGiveaway(id: string): Promise<Giveaway | undefined> {
    return storage.getGiveaway(this.userId, id);
  }

  async getActiveGiveaway(): Promise<Giveaway | undefined> {
    return storage.getActiveGiveaway(this.userId);
  }

  async createGiveaway(data: InsertGiveaway): Promise<Giveaway> {
    return storage.createGiveaway(this.userId, data);
  }

  async updateGiveaway(id: string, data: UpdateGiveaway): Promise<Giveaway> {
    return storage.updateGiveaway(this.userId, id, data);
  }

  async deleteGiveaway(id: string): Promise<void> {
    return storage.deleteGiveaway(this.userId, id);
  }

  // Giveaway Entries
  async getGiveawayEntries(giveawayId: string): Promise<GiveawayEntry[]> {
    return storage.getGiveawayEntries(giveawayId);
  }

  async getGiveawayEntryByUsername(
    giveawayId: string,
    username: string,
    platform: string
  ): Promise<GiveawayEntry | undefined> {
    return storage.getGiveawayEntryByUsername(giveawayId, username, platform);
  }

  async createGiveawayEntry(data: InsertGiveawayEntry): Promise<GiveawayEntry> {
    return storage.createGiveawayEntry(this.userId, data);
  }

  // Giveaway Winners
  async getGiveawayWinners(giveawayId: string): Promise<GiveawayWinner[]> {
    return storage.getGiveawayWinners(giveawayId);
  }

  async createGiveawayWinner(data: InsertGiveawayWinner): Promise<GiveawayWinner> {
    return storage.createGiveawayWinner(data);
  }

  // Shoutouts
  async getShoutouts(limit?: number): Promise<Shoutout[]> {
    return storage.getShoutouts(this.userId, limit);
  }

  async getShoutout(id: string): Promise<Shoutout | undefined> {
    return storage.getShoutout(this.userId, id);
  }

  async getShoutoutByTarget(targetUsername: string, targetPlatform: string): Promise<Shoutout | undefined> {
    return storage.getShoutoutByTarget(this.userId, targetUsername, targetPlatform);
  }

  async createShoutout(data: InsertShoutout): Promise<Shoutout> {
    return storage.createShoutout(this.userId, data);
  }

  async updateShoutout(id: string, data: UpdateShoutout): Promise<Shoutout> {
    return storage.updateShoutout(this.userId, id, data);
  }

  async deleteShoutout(id: string): Promise<void> {
    return storage.deleteShoutout(this.userId, id);
  }

  // Game Settings
  async getGameSettings(): Promise<GameSettings | undefined> {
    return storage.getGameSettings(this.userId);
  }

  async createGameSettings(data: InsertGameSettings): Promise<GameSettings> {
    return storage.createGameSettings(this.userId, data);
  }

  async updateGameSettings(data: UpdateGameSettings): Promise<GameSettings> {
    return storage.updateGameSettings(this.userId, data);
  }

  // Game History
  async getGameHistory(limit?: number): Promise<GameHistory[]> {
    return storage.getGameHistory(this.userId, limit);
  }

  async getGameHistoryByType(gameType: string, limit?: number): Promise<GameHistory[]> {
    return storage.getGameHistoryByType(this.userId, gameType, limit);
  }

  async createGameHistory(data: InsertGameHistory): Promise<GameHistory> {
    return storage.createGameHistory(data);
  }

  // Active Trivia Questions
  async getActiveTriviaQuestion(player: string, platform: string): Promise<ActiveTriviaQuestion | undefined> {
    return storage.getActiveTriviaQuestion(this.userId, player, platform);
  }

  async createActiveTriviaQuestion(data: InsertActiveTriviaQuestion): Promise<ActiveTriviaQuestion> {
    return storage.createActiveTriviaQuestion(data);
  }

  async deleteActiveTriviaQuestion(id: string): Promise<void> {
    return storage.deleteActiveTriviaQuestion(id);
  }

  // Game Stats
  async getGameStats(limit?: number): Promise<GameStats[]> {
    return storage.getGameStats(this.userId, limit);
  }

  async getGameStatsByGame(gameName: string, limit?: number): Promise<GameStats[]> {
    return storage.getGameStatsByGame(this.userId, gameName, limit);
  }

  async getGameStatsByPlayer(username: string, platform: string): Promise<GameStats[]> {
    return storage.getGameStatsByPlayer(this.userId, username, platform);
  }

  async getGameLeaderboard(gameName: string, limit?: number): Promise<GameStats[]> {
    return storage.getGameLeaderboard(this.userId, gameName, limit);
  }

  async upsertGameStats(data: InsertGameStats): Promise<GameStats> {
    return storage.upsertGameStats(data);
  }

  // Currency Settings
  async getCurrencySettings(): Promise<CurrencySettings | undefined> {
    return storage.getCurrencySettings(this.userId);
  }

  async createCurrencySettings(data: InsertCurrencySettings): Promise<CurrencySettings> {
    return storage.createCurrencySettings(this.userId, data);
  }

  async updateCurrencySettings(data: UpdateCurrencySettings): Promise<CurrencySettings> {
    return storage.updateCurrencySettings(this.userId, data);
  }

  // Currency Rewards
  async getCurrencyRewards(): Promise<CurrencyReward[]> {
    return storage.getCurrencyRewards(this.userId);
  }

  async getCurrencyReward(id: string): Promise<CurrencyReward | undefined> {
    return storage.getCurrencyReward(this.userId, id);
  }

  async createCurrencyReward(data: InsertCurrencyReward): Promise<CurrencyReward> {
    return storage.createCurrencyReward(this.userId, data);
  }

  async updateCurrencyReward(id: string, data: UpdateCurrencyReward): Promise<CurrencyReward> {
    return storage.updateCurrencyReward(this.userId, id, data);
  }

  async deleteCurrencyReward(id: string): Promise<void> {
    return storage.deleteCurrencyReward(this.userId, id);
  }

  // Shoutout Settings
  async getShoutoutSettings(): Promise<ShoutoutSettings | undefined> {
    return storage.getShoutoutSettings(this.userId);
  }

  async updateShoutoutSettings(data: UpdateShoutoutSettings): Promise<ShoutoutSettings> {
    return storage.updateShoutoutSettings(this.userId, data);
  }

  // Polls
  async getPolls(limit?: number): Promise<Poll[]> {
    return storage.getPolls(this.userId, limit);
  }

  async getPoll(id: string): Promise<Poll | undefined> {
    return storage.getPoll(this.userId, id);
  }

  async getActivePoll(platform?: string): Promise<Poll | null> {
    return storage.getActivePoll(this.userId, platform);
  }

  async getPollHistory(limit?: number): Promise<Poll[]> {
    return storage.getPollHistory(this.userId, limit);
  }

  async createPoll(data: InsertPoll): Promise<Poll> {
    return storage.createPoll(this.userId, data);
  }

  async updatePoll(id: string, data: UpdatePoll): Promise<Poll> {
    return storage.updatePoll(this.userId, id, data);
  }

  async incrementPollVotes(pollId: string): Promise<void> {
    return storage.incrementPollVotes(this.userId, pollId);
  }

  // Poll Votes
  async getPollVotes(pollId: string): Promise<PollVote[]> {
    return storage.getPollVotes(this.userId, pollId);
  }

  async getPollVoteByUser(pollId: string, username: string, platform: string): Promise<PollVote | undefined> {
    return storage.getPollVoteByUser(this.userId, pollId, username, platform);
  }

  async createPollVote(data: InsertPollVote): Promise<PollVote> {
    return storage.createPollVote(this.userId, data);
  }

  // Predictions
  async getPredictions(limit?: number): Promise<Prediction[]> {
    return storage.getPredictions(this.userId, limit);
  }

  async getPrediction(id: string): Promise<Prediction | undefined> {
    return storage.getPrediction(this.userId, id);
  }

  async getActivePrediction(platform?: string): Promise<Prediction | null> {
    return storage.getActivePrediction(this.userId, platform);
  }

  async getPredictionHistory(limit?: number): Promise<Prediction[]> {
    return storage.getPredictionHistory(this.userId, limit);
  }

  async createPrediction(data: InsertPrediction): Promise<Prediction> {
    return storage.createPrediction(this.userId, data);
  }

  async updatePrediction(id: string, data: UpdatePrediction): Promise<Prediction> {
    return storage.updatePrediction(this.userId, id, data);
  }

  async incrementPredictionStats(predictionId: string, points: number): Promise<void> {
    return storage.incrementPredictionStats(this.userId, predictionId, points);
  }

  // Prediction Bets
  async getPredictionBets(predictionId: string): Promise<PredictionBet[]> {
    return storage.getPredictionBets(this.userId, predictionId);
  }

  async getPredictionBetByUser(predictionId: string, username: string, platform: string): Promise<PredictionBet | undefined> {
    return storage.getPredictionBetByUser(this.userId, predictionId, username, platform);
  }

  async createPredictionBet(data: InsertPredictionBet): Promise<PredictionBet> {
    return storage.createPredictionBet(this.userId, data);
  }

  async updatePredictionBet(betId: string, data: { payout: number }): Promise<PredictionBet> {
    return storage.updatePredictionBet(this.userId, betId, data);
  }

  // Chatbot Settings
  async getChatbotSettings() {
    return storage.getChatbotSettings(this.userId);
  }

  async createChatbotSettings(data: any) {
    return storage.createChatbotSettings(this.userId, data);
  }

  async updateChatbotSettings(data: any) {
    return storage.updateChatbotSettings(this.userId, data);
  }

  // Chatbot Responses
  async getChatbotResponses(limit?: number) {
    return storage.getChatbotResponses(this.userId, limit);
  }

  async getChatbotResponse(id: string) {
    return storage.getChatbotResponse(this.userId, id);
  }

  async createChatbotResponse(data: any) {
    return storage.createChatbotResponse(this.userId, data);
  }

  async updateChatbotResponse(id: string, data: any) {
    return storage.updateChatbotResponse(this.userId, id, data);
  }

  // Chatbot Context
  async getChatbotContext(username: string, platform: string) {
    return storage.getChatbotContext(this.userId, username, platform);
  }

  async getAllChatbotContexts(limit?: number) {
    return storage.getAllChatbotContexts(this.userId, limit);
  }

  async createChatbotContext(data: any) {
    return storage.createChatbotContext(this.userId, data);
  }

  async updateChatbotContext(id: string, data: any) {
    return storage.updateChatbotContext(this.userId, id, data);
  }

  // Chatbot Personalities
  async getChatbotPersonalities() {
    return storage.getChatbotPersonalities(this.userId);
  }

  async getChatbotPersonality(id: string) {
    return storage.getChatbotPersonality(this.userId, id);
  }

  async getChatbotPersonalityByName(name: string) {
    return storage.getChatbotPersonalityByName(this.userId, name);
  }

  async createChatbotPersonality(data: any) {
    return storage.createChatbotPersonality(this.userId, data);
  }

  async updateChatbotPersonality(id: string, data: any) {
    return storage.updateChatbotPersonality(this.userId, id, data);
  }

  async deleteChatbotPersonality(id: string) {
    return storage.deleteChatbotPersonality(this.userId, id);
  }

  async getPresetPersonalities() {
    return storage.getPresetPersonalities();
  }

  // Alert Settings
  async getAlertSettings(): Promise<AlertSettings | undefined> {
    return storage.getAlertSettings(this.userId);
  }

  async createAlertSettings(data: InsertAlertSettings): Promise<AlertSettings> {
    return storage.createAlertSettings(this.userId, data);
  }

  async updateAlertSettings(data: UpdateAlertSettings): Promise<AlertSettings> {
    return storage.updateAlertSettings(this.userId, data);
  }

  // Alert History
  async getAlertHistory(alertType?: string, limit?: number): Promise<AlertHistory[]> {
    return storage.getAlertHistory(this.userId, alertType, limit);
  }

  async createAlertHistory(data: InsertAlertHistory): Promise<AlertHistory> {
    return storage.createAlertHistory(data);
  }

  // Milestones
  async getMilestones(milestoneType?: string): Promise<Milestone[]> {
    return storage.getMilestones(this.userId, milestoneType);
  }

  async getMilestone(milestoneType: string, threshold: number): Promise<Milestone | undefined> {
    return storage.getMilestone(this.userId, milestoneType, threshold);
  }

  async createMilestone(data: InsertMilestone): Promise<Milestone> {
    return storage.createMilestone(data);
  }

  async updateMilestone(id: string, data: UpdateMilestone): Promise<Milestone> {
    return storage.updateMilestone(this.userId, id, data);
  }
}

export function createUserStorage(userId: string): UserStorage {
  return new UserStorage(userId);
}
