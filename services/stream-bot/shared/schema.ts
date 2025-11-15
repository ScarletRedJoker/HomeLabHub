import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users - stores user accounts for multi-tenant access (OAuth-based)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // Nullable - OAuth users don't have passwords
  primaryPlatform: text("primary_platform"), // 'twitch', 'youtube', 'kick' - which OAuth they used first
  role: text("role").default("user").notNull(), // 'user', 'admin'
  isActive: boolean("is_active").default(true).notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingStep: integer("onboarding_step").default(0).notNull(), // 0-4 for tracking progress
  dismissedWelcome: boolean("dismissed_welcome").default(false).notNull(), // Track if user dismissed welcome card
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Platform connections - stores OAuth tokens and platform-specific config
export const platformConnections = pgTable("platform_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  platformUserId: text("platform_user_id"), // External platform user ID
  platformUsername: text("platform_username"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  channelId: text("channel_id"), // Channel/stream ID for the platform
  isConnected: boolean("is_connected").default(false).notNull(),
  lastConnectedAt: timestamp("last_connected_at"),
  connectionData: jsonb("connection_data"), // Platform-specific metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userPlatformIdx: uniqueIndex("platform_connections_user_id_platform_unique").on(table.userId, table.platform),
  platformUserIdx: uniqueIndex("platform_connections_platform_platform_user_id_unique").on(table.platform, table.platformUserId),
}));

// Bot configs - per-user bot configuration (replaces singleton botSettings)
export const botConfigs = pgTable("bot_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Interval settings
  intervalMode: text("interval_mode").default("manual").notNull(), // 'fixed', 'random', 'manual'
  fixedIntervalMinutes: integer("fixed_interval_minutes"), // For fixed mode
  randomMinMinutes: integer("random_min_minutes"), // For random mode
  randomMaxMinutes: integer("random_max_minutes"), // For random mode
  
  // AI settings
  aiModel: text("ai_model").default("gpt-5-mini").notNull(),
  aiPromptTemplate: text("ai_prompt_template"),
  aiTemperature: integer("ai_temperature").default(1), // Stored as integer, divided by 10 in app
  
  // Trigger settings
  enableChatTriggers: boolean("enable_chat_triggers").default(true).notNull(),
  chatKeywords: text("chat_keywords").array().default(sql`ARRAY['!snapple', '!fact']::text[]`).notNull(),
  
  // Active platforms
  activePlatforms: text("active_platforms").array().default(sql`ARRAY[]::text[]`).notNull(),
  
  // Bot status
  isActive: boolean("is_active").default(false).notNull(),
  lastFactPostedAt: timestamp("last_fact_posted_at"),
  
  // Shoutout settings
  autoShoutoutOnRaid: boolean("auto_shoutout_on_raid").default(false).notNull(),
  autoShoutoutOnHost: boolean("auto_shoutout_on_host").default(false).notNull(),
  shoutoutMessageTemplate: text("shoutout_message_template").default("Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}"),
  
  // Moderation settings
  bannedWords: text("banned_words").array().default(sql`ARRAY[]::text[]`).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bot instances - tracks running bot status and health
export const botInstances = pgTable("bot_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  status: text("status").default("stopped").notNull(), // 'running', 'stopped', 'error'
  lastHeartbeat: timestamp("last_heartbeat"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  stoppedAt: timestamp("stopped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Message history - logs all posted facts
export const messageHistory = pgTable("message_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  triggerType: text("trigger_type").notNull(), // 'scheduled', 'manual', 'chat_command'
  triggerUser: text("trigger_user"), // Username if triggered by chat command
  factContent: text("fact_content").notNull(),
  postedAt: timestamp("posted_at").defaultNow().notNull(),
  status: text("status").default("success").notNull(), // 'success', 'failed'
  errorMessage: text("error_message"),
});

// Custom Commands - user-defined chat commands with variables
export const customCommands = pgTable("custom_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Command name without ! prefix (e.g., "discord", "socials")
  response: text("response").notNull(), // Response template with variables like {user}, {count}, etc.
  cooldown: integer("cooldown").default(0).notNull(), // Cooldown in seconds (0 = no cooldown)
  permission: text("permission").default("everyone").notNull(), // 'everyone', 'subs', 'mods', 'broadcaster'
  isActive: boolean("is_active").default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userCommandIdx: uniqueIndex("custom_commands_user_id_name_unique").on(table.userId, table.name),
}));

// Moderation Rules - AI-powered auto-moderation settings per user
export const moderationRules = pgTable("moderation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ruleType: text("rule_type").notNull(), // 'toxic', 'spam', 'links', 'caps', 'symbols'
  isEnabled: boolean("is_enabled").default(true).notNull(),
  severity: text("severity").default("medium").notNull(), // 'low', 'medium', 'high'
  action: text("action").default("warn").notNull(), // 'warn', 'timeout', 'ban'
  customPattern: text("custom_pattern"), // Optional regex pattern for custom filtering
  timeoutDuration: integer("timeout_duration").default(60), // Timeout duration in seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userRuleTypeIdx: uniqueIndex("moderation_rules_user_id_rule_type_unique").on(table.userId, table.ruleType),
}));

// Moderation Logs - History of all moderation actions taken
export const moderationLogs = pgTable("moderation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  username: text("username").notNull(), // Username of the user who sent the message
  message: text("message").notNull(), // The message that triggered moderation
  ruleTriggered: text("rule_triggered").notNull(), // Which rule was triggered
  action: text("action").notNull(), // 'warn', 'timeout', 'ban', 'delete'
  severity: text("severity").notNull(), // 'low', 'medium', 'high'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Link Whitelist - Allowed domains that bypass link filtering
export const linkWhitelist = pgTable("link_whitelist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(), // Domain to whitelist (e.g., "youtube.com", "twitter.com")
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDomainIdx: uniqueIndex("link_whitelist_user_id_domain_unique").on(table.userId, table.domain),
}));

// Giveaways - Chat giveaways/raffles for viewer engagement
export const giveaways = pgTable("giveaways", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  keyword: text("keyword").notNull(), // Entry keyword (e.g., "!enter")
  isActive: boolean("is_active").default(true).notNull(),
  requiresSubscription: boolean("requires_subscription").default(false).notNull(),
  maxWinners: integer("max_winners").default(1).notNull(),
  entryCount: integer("entry_count").default(0).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Giveaway Entries - User entries for active giveaways
export const giveawayEntries = pgTable("giveaway_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  giveawayId: varchar("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  subscriberStatus: boolean("subscriber_status").default(false).notNull(),
  enteredAt: timestamp("entered_at").defaultNow().notNull(),
}, (table) => ({
  giveawayUserIdx: uniqueIndex("giveaway_entries_giveaway_id_username_platform_unique").on(
    table.giveawayId,
    table.username,
    table.platform
  ),
}));

// Giveaway Winners - Selected winners from completed giveaways
export const giveawayWinners = pgTable("giveaway_winners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  giveawayId: varchar("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(),
  selectedAt: timestamp("selected_at").defaultNow().notNull(),
});

// Giveaway Entry Attempts - Rate limiting tracking for giveaway entries
export const giveawayEntryAttempts = pgTable("giveaway_entry_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(),
  giveawayId: varchar("giveaway_id").references(() => giveaways.id, { onDelete: "cascade" }),
  attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
}, (table) => ({
  userAttemptIdx: uniqueIndex("giveaway_entry_attempts_username_platform_attempted_at_idx").on(
    table.username,
    table.platform,
    table.attemptedAt
  ),
}));

// Shoutouts - Track shoutout history and custom messages
export const shoutouts = pgTable("shoutouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUsername: text("target_username").notNull(),
  targetPlatform: text("target_platform").notNull(), // 'twitch', 'youtube', 'kick'
  customMessage: text("custom_message"),
  usageCount: integer("usage_count").default(1).notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userTargetIdx: uniqueIndex("shoutouts_user_id_target_username_platform_unique").on(
    table.userId,
    table.targetUsername,
    table.targetPlatform
  ),
}));

// Shoutout Settings - Per-user shoutout configuration
export const shoutoutSettings = pgTable("shoutout_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  enableAutoShoutouts: boolean("enable_auto_shoutouts").default(false).notNull(),
  shoutoutTemplate: text("shoutout_template").default("Check out @{username}! They were last streaming {game} with {viewers} viewers! {url}").notNull(),
  enableRaidShoutouts: boolean("enable_raid_shoutouts").default(false).notNull(),
  enableHostShoutouts: boolean("enable_host_shoutouts").default(false).notNull(),
  recentFollowerShoutouts: boolean("recent_follower_shoutouts").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shoutout History - Log of all shoutout executions
export const shoutoutHistory = pgTable("shoutout_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUsername: text("target_username").notNull(),
  platform: text("platform").notNull(), // Platform where shoutout was posted
  shoutoutType: text("shoutout_type").notNull(), // 'manual', 'raid', 'host', 'command'
  message: text("message").notNull(), // The actual shoutout message sent
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Stream Sessions - Track individual streaming sessions
export const streamSessions = pgTable("stream_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  peakViewers: integer("peak_viewers").default(0).notNull(),
  totalMessages: integer("total_messages").default(0).notNull(),
  uniqueChatters: integer("unique_chatters").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Viewer Snapshots - Track viewer count over time for each session
export const viewerSnapshots = pgTable("viewer_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => streamSessions.id, { onDelete: "cascade" }),
  viewerCount: integer("viewer_count").default(0).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Chat Activity - Track chat messages for heatmap generation
export const chatActivity = pgTable("chat_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => streamSessions.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  messageCount: integer("message_count").default(1).notNull(),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Game Settings - Per-user mini-games configuration
export const gameSettings = pgTable("game_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  enableGames: boolean("enable_games").default(true).notNull(),
  cooldownMinutes: integer("cooldown_minutes").default(5).notNull(),
  pointsPerWin: integer("points_per_win").default(10).notNull(),
  enable8Ball: boolean("enable_8ball").default(true).notNull(),
  enableTrivia: boolean("enable_trivia").default(true).notNull(),
  enableDuel: boolean("enable_duel").default(true).notNull(),
  enableSlots: boolean("enable_slots").default(true).notNull(),
  enableRoulette: boolean("enable_roulette").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Game History - Track all game plays and outcomes
export const gameHistory = pgTable("game_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  gameType: text("game_type").notNull(), // '8ball', 'trivia', 'duel', 'slots', 'roulette'
  player: text("player").notNull(), // Username of the player
  opponent: text("opponent"), // For duel games
  outcome: text("outcome").notNull(), // 'win', 'loss', 'neutral'
  pointsAwarded: integer("points_awarded").default(0).notNull(),
  details: jsonb("details"), // Game-specific data (question, answer, slot results, etc.)
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Active Trivia Questions - Track pending trivia questions
export const activeTriviaQuestions = pgTable("active_trivia_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  player: text("player").notNull(),
  platform: text("platform").notNull(),
  question: text("question").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  difficulty: text("difficulty").notNull(), // 'easy', 'medium', 'hard'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Game Stats - Aggregated statistics per user per game
export const gameStats = pgTable("game_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  gameName: text("game_name").notNull(), // '8ball', 'trivia', 'duel', 'slots', 'roulette'
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  wins: integer("wins").default(0).notNull(),
  losses: integer("losses").default(0).notNull(),
  neutral: integer("neutral").default(0).notNull(),
  totalPlays: integer("total_plays").default(0).notNull(),
  totalPointsEarned: integer("total_points_earned").default(0).notNull(),
  lastPlayed: timestamp("last_played"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userGameIdx: uniqueIndex("game_stats_user_id_username_game_name_platform_unique").on(
    table.userId,
    table.username,
    table.gameName,
    table.platform
  ),
}));

// Currency Settings - Per-user currency configuration
export const currencySettings = pgTable("currency_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  currencyName: text("currency_name").default("Points").notNull(),
  currencySymbol: text("currency_symbol").default("⭐").notNull(),
  earnPerMessage: integer("earn_per_message").default(1).notNull(),
  earnPerMinute: integer("earn_per_minute").default(10).notNull(),
  startingBalance: integer("starting_balance").default(100).notNull(),
  maxBalance: integer("max_balance").default(1000000).notNull(),
  enableGambling: boolean("enable_gambling").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Balances - Track viewer currency balances
export const userBalances = pgTable("user_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  balance: integer("balance").default(0).notNull(),
  totalEarned: integer("total_earned").default(0).notNull(),
  totalSpent: integer("total_spent").default(0).notNull(),
  lastEarned: timestamp("last_earned"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userBalanceIdx: uniqueIndex("user_balances_bot_user_id_username_platform_unique").on(
    table.botUserId,
    table.username,
    table.platform
  ),
  balanceCheck: sql`CONSTRAINT user_balances_balance_check CHECK (balance >= 0)`,
  totalEarnedCheck: sql`CONSTRAINT user_balances_total_earned_check CHECK (total_earned >= 0)`,
  totalSpentCheck: sql`CONSTRAINT user_balances_total_spent_check CHECK (total_spent >= 0)`,
}));

// Currency Transactions - History of all currency transactions
export const currencyTransactions = pgTable("currency_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  balanceId: varchar("balance_id").notNull().references(() => userBalances.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  type: text("type").notNull(), // 'earn_message', 'earn_watch', 'gamble_win', 'gamble_loss', 'reward_purchase', 'admin_adjust', 'transfer_in', 'transfer_out'
  amount: integer("amount").notNull(), // Can be negative for spending
  description: text("description").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Currency Rewards - Custom rewards that viewers can redeem
export const currencyRewards = pgTable("currency_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rewardName: text("reward_name").notNull(),
  cost: integer("cost").default(100).notNull(),
  command: text("command"), // Optional command triggered on redemption
  stock: integer("stock"), // null = unlimited stock
  maxRedeems: integer("max_redeems"), // null = unlimited per user
  rewardType: text("reward_type").notNull(), // 'timeout_immunity', 'song_request', 'highlight_message', 'custom_command'
  rewardData: jsonb("reward_data"), // Type-specific data (duration, command, etc.)
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userRewardIdx: uniqueIndex("currency_rewards_bot_user_id_reward_name_unique").on(
    table.botUserId,
    table.rewardName
  ),
}));

// Reward Redemptions - Track reward redemption history
export const rewardRedemptions = pgTable("reward_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rewardId: varchar("reward_id").notNull().references(() => currencyRewards.id, { onDelete: "cascade" }),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  fulfilled: boolean("fulfilled").default(false).notNull(),
  fulfilledAt: timestamp("fulfilled_at"),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
});

// Song Queue - Tracks requested songs in queue
export const songQueue = pgTable("song_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull(), // Username who requested
  songTitle: text("song_title").notNull(),
  artist: text("artist").notNull(),
  url: text("url").notNull(), // Spotify or YouTube URL
  platform: text("platform").notNull(), // 'spotify', 'youtube'
  status: text("status").default("pending").notNull(), // 'pending', 'playing', 'played', 'skipped', 'removed'
  albumImageUrl: text("album_image_url"), // For display purposes
  duration: integer("duration"), // Duration in milliseconds
  position: integer("position").notNull(), // Queue position
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  playedAt: timestamp("played_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Song Settings - Per-user song request configuration
export const songSettings = pgTable("song_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  enableSongRequests: boolean("enable_song_requests").default(true).notNull(),
  maxQueueSize: integer("max_queue_size").default(20).notNull(),
  maxSongsPerUser: integer("max_songs_per_user").default(3).notNull(),
  allowDuplicates: boolean("allow_duplicates").default(false).notNull(),
  profanityFilter: boolean("profanity_filter").default(true).notNull(),
  bannedSongs: text("banned_songs").array().default(sql`ARRAY[]::text[]`).notNull(), // Array of song IDs or URLs
  volumeLimit: integer("volume_limit").default(100).notNull(), // 0-100
  allowSpotify: boolean("allow_spotify").default(true).notNull(),
  allowYoutube: boolean("allow_youtube").default(true).notNull(),
  moderatorOnly: boolean("moderator_only").default(false).notNull(), // Only mods can request
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Polls - Chat polls for viewer engagement
export const polls = pgTable("polls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  options: text("options").array().notNull(), // Array of poll options
  duration: integer("duration").notNull(), // Duration in seconds
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  status: text("status").default("pending").notNull(), // 'pending', 'active', 'ended', 'cancelled'
  twitchPollId: text("twitch_poll_id"), // Native Twitch poll ID if using Twitch API
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  totalVotes: integer("total_votes").default(0).notNull(),
  winner: text("winner"), // Winning option text
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Poll Votes - Individual votes on polls
export const pollVotes = pgTable("poll_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pollId: varchar("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  option: text("option").notNull(), // The option they voted for
  votedAt: timestamp("voted_at").defaultNow().notNull(),
}, (table) => ({
  pollUserIdx: uniqueIndex("poll_votes_poll_id_username_platform_unique").on(
    table.pollId,
    table.username,
    table.platform
  ),
}));

// Predictions - Channel point predictions for viewer engagement
export const predictions = pgTable("predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  outcomes: text("outcomes").array().notNull(), // Array of possible outcomes (2-10 options)
  duration: integer("duration").notNull(), // Duration in seconds
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  status: text("status").default("pending").notNull(), // 'pending', 'active', 'locked', 'resolved', 'cancelled'
  twitchPredictionId: text("twitch_prediction_id"), // Native Twitch prediction ID if using Twitch API
  startedAt: timestamp("started_at"),
  lockedAt: timestamp("locked_at"), // When betting closes
  endedAt: timestamp("ended_at"),
  totalPoints: integer("total_points").default(0).notNull(),
  totalBets: integer("total_bets").default(0).notNull(),
  winningOutcome: text("winning_outcome"), // Winning outcome text
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Prediction Bets - Individual bets on predictions
export const predictionBets = pgTable("prediction_bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  predictionId: varchar("prediction_id").notNull().references(() => predictions.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  outcome: text("outcome").notNull(), // The outcome they bet on
  points: integer("points").notNull(), // Points wagered
  payout: integer("payout").default(0).notNull(), // Points won (0 if lost)
  placedAt: timestamp("placed_at").defaultNow().notNull(),
}, (table) => ({
  predictionUserIdx: uniqueIndex("prediction_bets_prediction_id_username_platform_unique").on(
    table.predictionId,
    table.username,
    table.platform
  ),
}));

// Alert Settings - Per-user alert configuration for follower/sub/raid/milestone events
export const alertSettings = pgTable("alert_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Enable/disable toggles for each alert type
  enableFollowerAlerts: boolean("enable_follower_alerts").default(true).notNull(),
  enableSubAlerts: boolean("enable_sub_alerts").default(true).notNull(),
  enableRaidAlerts: boolean("enable_raid_alerts").default(true).notNull(),
  enableMilestoneAlerts: boolean("enable_milestone_alerts").default(true).notNull(),
  
  // Customizable message templates
  followerTemplate: text("follower_template").default("Thanks for the follow, {user}! Welcome to the community!").notNull(),
  subTemplate: text("sub_template").default("Thanks for subscribing, {user}! {tier} sub for {months} months!").notNull(),
  raidTemplate: text("raid_template").default("Thanks for the raid, {raider}! {viewers} viewers joining the party!").notNull(),
  
  // Milestone thresholds (array of integers like [50, 100, 500, 1000])
  milestoneThresholds: integer("milestone_thresholds").array().default(sql`ARRAY[50, 100, 500, 1000, 5000, 10000]::integer[]`).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Alert History - Log of all posted alerts
export const alertHistory = pgTable("alert_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(), // 'follower', 'subscriber', 'raid', 'milestone'
  username: text("username"), // Username that triggered the alert (for follower/sub/raid)
  message: text("message").notNull(), // The actual message posted
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  metadata: jsonb("metadata"), // Additional data: {tier, months, viewerCount, milestoneType, threshold, count}
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Milestones - Track achieved milestones for followers/subs
export const milestones = pgTable("milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  milestoneType: text("milestone_type").notNull(), // 'followers', 'subscribers'
  threshold: integer("threshold").notNull(), // The milestone number (50, 100, 500, etc.)
  achieved: boolean("achieved").default(false).notNull(),
  achievedAt: timestamp("achieved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userMilestoneIdx: uniqueIndex("milestones_user_id_type_threshold_unique").on(
    table.userId,
    table.milestoneType,
    table.threshold
  ),
}));

// Chatbot Settings - AI chatbot personality and configuration
export const chatbotSettings = pgTable("chatbot_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  personality: text("personality").default("friendly").notNull(), // 'friendly', 'snarky', 'professional', 'gamer', 'custom'
  customPersonalityPrompt: text("custom_personality_prompt"), // Used when personality is 'custom'
  temperature: integer("temperature").default(10).notNull(), // Stored as integer (0-20), divided by 10 in app (0.0-2.0)
  responseRate: integer("response_rate").default(30).notNull(), // Max 1 response per user per X seconds
  contextWindow: integer("context_window").default(10).notNull(), // Number of recent messages to include in context
  learningEnabled: boolean("learning_enabled").default(true).notNull(), // Track and learn from user feedback
  mentionTrigger: text("mention_trigger").default("@bot").notNull(), // What to watch for in chat
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Chatbot Responses - Log of all chatbot interactions for learning
export const chatbotResponses = pgTable("chatbot_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(), // User who triggered the bot
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  message: text("message").notNull(), // Original message that triggered bot
  response: text("response").notNull(), // Bot's response
  personality: text("personality").notNull(), // Personality used for this response
  wasHelpful: boolean("was_helpful"), // null = no feedback yet, true/false = user feedback
  engagementScore: integer("engagement_score").default(0).notNull(), // 0-100, based on reactions/replies
  metadata: jsonb("metadata"), // Additional data: temperature, contextSize, processingTime
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chatbot Context - Track conversation context per user
export const chatbotContext = pgTable("chatbot_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(), // Chat user's username
  platform: text("platform").notNull(), // 'twitch', 'youtube', 'kick'
  recentMessages: jsonb("recent_messages").default(sql`'[]'::jsonb`).notNull(), // Array of {message, timestamp, isBot}
  conversationSummary: text("conversation_summary"), // AI-generated summary of conversation
  messageCount: integer("message_count").default(0).notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userContextIdx: uniqueIndex("chatbot_context_bot_user_id_username_platform_unique").on(
    table.botUserId,
    table.username,
    table.platform
  ),
}));

// Chatbot Personalities - Custom AI personalities users can create
export const chatbotPersonalities = pgTable("chatbot_personalities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // User-friendly name (e.g., "Gaming Buddy", "Helpful Assistant")
  systemPrompt: text("system_prompt").notNull(), // The full system prompt for this personality
  temperature: integer("temperature").default(10).notNull(), // Stored as integer (0-20), divided by 10 in app (0.0-2.0)
  traits: jsonb("traits").default(sql`'[]'::jsonb`).notNull(), // Array of personality traits/keywords
  isPreset: boolean("is_preset").default(false).notNull(), // True for built-in personalities, false for custom
  isActive: boolean("is_active").default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(), // Track how often this personality is used
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userNameIdx: uniqueIndex("chatbot_personalities_user_id_name_unique").on(table.userId, table.name),
}));

// Analytics Snapshots - Daily snapshots of streamer metrics
export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  followers: integer("followers").default(0).notNull(),
  subscribers: integer("subscribers").default(0).notNull(),
  avgViewers: integer("avg_viewers").default(0).notNull(),
  totalStreams: integer("total_streams").default(0).notNull(),
  totalHours: integer("total_hours").default(0).notNull(),
  revenue: integer("revenue").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: uniqueIndex("analytics_snapshots_user_id_date_unique").on(table.userId, table.date),
}));

// Sentiment Analysis - AI-powered sentiment analysis of chat messages
export const sentimentAnalysis = pgTable("sentiment_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  positiveMessages: integer("positive_messages").default(0).notNull(),
  negativeMessages: integer("negative_messages").default(0).notNull(),
  neutralMessages: integer("neutral_messages").default(0).notNull(),
  sentimentScore: integer("sentiment_score").default(0).notNull(), // -100 to 100
  topTopics: jsonb("top_topics").default(sql`'[]'::jsonb`).notNull(), // Array of {topic: string, count: number}
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDateIdx: uniqueIndex("sentiment_analysis_user_id_date_unique").on(table.userId, table.date),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Invalid email address"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformConnectionSchema = createInsertSchema(platformConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBotConfigSchema = createInsertSchema(botConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBotInstanceSchema = createInsertSchema(botInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageHistorySchema = createInsertSchema(messageHistory).omit({
  id: true,
  postedAt: true,
});

export const insertCustomCommandSchema = createInsertSchema(customCommands, {
  name: z.string().min(1, "Command name is required").max(50, "Command name too long"),
  response: z.string().min(1, "Response is required").max(500, "Response too long"),
  cooldown: z.coerce.number().min(0).max(86400),
  permission: z.enum(["everyone", "subs", "mods", "broadcaster"]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModerationRuleSchema = createInsertSchema(moderationRules, {
  ruleType: z.enum(["toxic", "spam", "links", "caps", "symbols"]),
  severity: z.enum(["low", "medium", "high"]),
  action: z.enum(["warn", "timeout", "ban"]),
  timeoutDuration: z.coerce.number().min(1).max(86400),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({
  id: true,
  timestamp: true,
});

export const insertLinkWhitelistSchema = createInsertSchema(linkWhitelist).omit({
  id: true,
  createdAt: true,
});

export const insertGiveawaySchema = createInsertSchema(giveaways, {
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  keyword: z.string().min(1, "Keyword is required").regex(/^!?\w+$/, "Invalid keyword format"),
  maxWinners: z.coerce.number().min(1).max(100),
}).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});

export const insertGiveawayEntrySchema = createInsertSchema(giveawayEntries).omit({
  id: true,
  enteredAt: true,
});

export const insertGiveawayWinnerSchema = createInsertSchema(giveawayWinners).omit({
  id: true,
  selectedAt: true,
});

export const insertGiveawayEntryAttemptSchema = createInsertSchema(giveawayEntryAttempts).omit({
  id: true,
  attemptedAt: true,
});

export const insertShoutoutSchema = createInsertSchema(shoutouts, {
  targetUsername: z.string().min(1, "Target username is required").max(100, "Username too long"),
  targetPlatform: z.enum(["twitch", "youtube", "kick"]),
  customMessage: z.string().max(500, "Custom message too long").optional(),
}).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

export const insertShoutoutSettingsSchema = createInsertSchema(shoutoutSettings, {
  shoutoutTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShoutoutHistorySchema = createInsertSchema(shoutoutHistory, {
  targetUsername: z.string().min(1, "Target username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  shoutoutType: z.enum(["manual", "raid", "host", "command"]),
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
}).omit({
  id: true,
  timestamp: true,
});

export const insertStreamSessionSchema = createInsertSchema(streamSessions, {
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertViewerSnapshotSchema = createInsertSchema(viewerSnapshots).omit({
  id: true,
  timestamp: true,
});

export const insertChatActivitySchema = createInsertSchema(chatActivity, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  messageCount: z.coerce.number().min(1),
}).omit({
  id: true,
  timestamp: true,
});

export const insertGameSettingsSchema = createInsertSchema(gameSettings, {
  cooldownMinutes: z.coerce.number().min(0).max(60),
  pointsPerWin: z.coerce.number().min(0).max(1000),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGameHistorySchema = createInsertSchema(gameHistory, {
  gameType: z.enum(["8ball", "trivia", "duel", "slots", "roulette"]),
  player: z.string().min(1, "Player is required").max(100, "Player name too long"),
  opponent: z.string().max(100, "Opponent name too long").optional(),
  outcome: z.enum(["win", "loss", "neutral"]),
  pointsAwarded: z.coerce.number().min(0),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  timestamp: true,
});

export const insertActiveTriviaQuestionSchema = createInsertSchema(activeTriviaQuestions, {
  player: z.string().min(1, "Player is required").max(100, "Player name too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  question: z.string().min(1, "Question is required"),
  correctAnswer: z.string().min(1, "Answer is required"),
  difficulty: z.enum(["easy", "medium", "hard"]),
}).omit({
  id: true,
  createdAt: true,
});

export const insertGameStatsSchema = createInsertSchema(gameStats, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  gameName: z.enum(["8ball", "trivia", "duel", "slots", "roulette"]),
  platform: z.enum(["twitch", "youtube", "kick"]),
  wins: z.coerce.number().min(0),
  losses: z.coerce.number().min(0),
  neutral: z.coerce.number().min(0),
  totalPlays: z.coerce.number().min(0),
  totalPointsEarned: z.coerce.number().min(0),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCurrencySettingsSchema = createInsertSchema(currencySettings, {
  currencyName: z.string().min(1, "Currency name is required").max(50, "Currency name too long"),
  currencySymbol: z.string().min(1, "Currency symbol is required").max(10, "Currency symbol too long"),
  earnPerMessage: z.coerce.number().min(0).max(1000),
  earnPerMinute: z.coerce.number().min(0).max(1000),
  startingBalance: z.coerce.number().min(0).max(1000000),
  maxBalance: z.coerce.number().min(0).max(100000000),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserBalanceSchema = createInsertSchema(userBalances, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  balance: z.coerce.number().min(0),
  totalEarned: z.coerce.number().min(0),
  totalSpent: z.coerce.number().min(0),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCurrencyTransactionSchema = createInsertSchema(currencyTransactions, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  type: z.enum(["earn_message", "earn_watch", "gamble_win", "gamble_loss", "reward_purchase", "admin_adjust", "transfer_in", "transfer_out"]),
  amount: z.coerce.number(),
  description: z.string().min(1, "Description is required").max(500, "Description too long"),
}).omit({
  id: true,
  timestamp: true,
});

export const insertCurrencyRewardSchema = createInsertSchema(currencyRewards, {
  rewardName: z.string().min(1, "Reward name is required").max(100, "Reward name too long"),
  cost: z.coerce.number().min(1).max(1000000),
  command: z.string().max(500, "Command too long").optional(),
  stock: z.coerce.number().min(0).optional(),
  maxRedeems: z.coerce.number().min(1).optional(),
  rewardType: z.enum(["timeout_immunity", "song_request", "highlight_message", "custom_command"]),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRewardRedemptionSchema = createInsertSchema(rewardRedemptions, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  redeemedAt: true,
});

export const insertSongQueueSchema = createInsertSchema(songQueue, {
  requestedBy: z.string().min(1, "Username is required").max(100, "Username too long"),
  songTitle: z.string().min(1, "Song title is required").max(200, "Song title too long"),
  artist: z.string().min(1, "Artist is required").max(200, "Artist too long"),
  url: z.string().url("Invalid URL"),
  platform: z.enum(["spotify", "youtube"]),
  status: z.enum(["pending", "playing", "played", "skipped", "removed"]),
  position: z.coerce.number().min(0),
  duration: z.coerce.number().min(0).optional(),
}).omit({
  id: true,
  createdAt: true,
  requestedAt: true,
});

export const insertSongSettingsSchema = createInsertSchema(songSettings, {
  maxQueueSize: z.coerce.number().min(1).max(100),
  maxSongsPerUser: z.coerce.number().min(1).max(10),
  volumeLimit: z.coerce.number().min(0).max(100),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPollSchema = createInsertSchema(polls, {
  question: z.string().min(1, "Question is required").max(200, "Question too long"),
  options: z.array(z.string().min(1).max(100)).min(2, "At least 2 options required").max(10, "Maximum 10 options"),
  duration: z.coerce.number().min(30, "Minimum 30 seconds").max(3600, "Maximum 1 hour"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  status: z.enum(["pending", "active", "ended", "cancelled"]).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPollVoteSchema = createInsertSchema(pollVotes, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  option: z.string().min(1, "Option is required"),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  votedAt: true,
});

export const insertPredictionSchema = createInsertSchema(predictions, {
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  outcomes: z.array(z.string().min(1).max(100)).min(2, "At least 2 outcomes required").max(10, "Maximum 10 outcomes"),
  duration: z.coerce.number().min(30, "Minimum 30 seconds").max(3600, "Maximum 1 hour"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  status: z.enum(["pending", "active", "locked", "resolved", "cancelled"]).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPredictionBetSchema = createInsertSchema(predictionBets, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  outcome: z.string().min(1, "Outcome is required"),
  points: z.coerce.number().min(1, "Minimum 1 point").max(1000000),
  platform: z.enum(["twitch", "youtube", "kick"]),
}).omit({
  id: true,
  placedAt: true,
});

export const insertAlertSettingsSchema = createInsertSchema(alertSettings, {
  followerTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
  subTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
  raidTemplate: z.string().min(1, "Template is required").max(500, "Template too long"),
  milestoneThresholds: z.array(z.number().min(1).max(1000000)).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAlertHistorySchema = createInsertSchema(alertHistory, {
  alertType: z.enum(["follower", "subscriber", "raid", "milestone"]),
  message: z.string().min(1, "Message is required"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  username: z.string().max(100, "Username too long").optional(),
}).omit({
  id: true,
  timestamp: true,
});

export const insertMilestoneSchema = createInsertSchema(milestones, {
  milestoneType: z.enum(["followers", "subscribers"]),
  threshold: z.coerce.number().min(1).max(1000000),
}).omit({
  id: true,
  createdAt: true,
});

export const insertChatbotSettingsSchema = createInsertSchema(chatbotSettings, {
  personality: z.enum(["friendly", "snarky", "professional", "enthusiastic", "chill", "custom"]),
  customPersonalityPrompt: z.string().max(1000, "Personality prompt too long").optional(),
  temperature: z.coerce.number().min(0).max(20), // 0-20 representing 0.0-2.0
  responseRate: z.coerce.number().min(10).max(300), // 10-300 seconds
  contextWindow: z.coerce.number().min(1).max(50), // 1-50 messages
  mentionTrigger: z.string().min(1, "Mention trigger is required").max(50, "Mention trigger too long"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatbotResponseSchema = createInsertSchema(chatbotResponses, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  message: z.string().min(1, "Message is required").max(500, "Message too long"),
  response: z.string().min(1, "Response is required").max(500, "Response too long"),
  personality: z.enum(["friendly", "snarky", "professional", "enthusiastic", "chill", "custom"]),
  wasHelpful: z.boolean().optional(),
  engagementScore: z.coerce.number().min(0).max(100).optional(),
}).omit({
  id: true,
  timestamp: true,
  createdAt: true,
});

export const insertChatbotContextSchema = createInsertSchema(chatbotContext, {
  username: z.string().min(1, "Username is required").max(100, "Username too long"),
  platform: z.enum(["twitch", "youtube", "kick"]),
  messageCount: z.coerce.number().min(0).optional(),
  conversationSummary: z.string().max(1000, "Summary too long").optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatbotPersonalitySchema = createInsertSchema(chatbotPersonalities, {
  name: z.string().min(1, "Personality name is required").max(100, "Name too long"),
  systemPrompt: z.string().min(10, "System prompt is required").max(2000, "Prompt too long"),
  temperature: z.coerce.number().min(0).max(20), // 0-20 representing 0.0-2.0
  traits: z.array(z.string()).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnalyticsSnapshotSchema = createInsertSchema(analyticsSnapshots, {
  followers: z.coerce.number().min(0),
  subscribers: z.coerce.number().min(0),
  avgViewers: z.coerce.number().min(0),
  totalStreams: z.coerce.number().min(0),
  totalHours: z.coerce.number().min(0),
  revenue: z.coerce.number().min(0),
}).omit({
  id: true,
  createdAt: true,
});

export const insertSentimentAnalysisSchema = createInsertSchema(sentimentAnalysis, {
  positiveMessages: z.coerce.number().min(0),
  negativeMessages: z.coerce.number().min(0),
  neutralMessages: z.coerce.number().min(0),
  sentimentScore: z.coerce.number().min(-100).max(100),
  topTopics: z.array(z.object({
    topic: z.string(),
    count: z.number(),
  })).optional(),
}).omit({
  id: true,
  createdAt: true,
});

// Update schemas for partial updates
export const updateUserSchema = insertUserSchema.partial();
export const updateBotConfigSchema = insertBotConfigSchema.partial();
export const updatePlatformConnectionSchema = insertPlatformConnectionSchema.partial();
export const updateBotInstanceSchema = insertBotInstanceSchema.partial();
export const updateCustomCommandSchema = insertCustomCommandSchema.partial();
export const updateModerationRuleSchema = insertModerationRuleSchema.partial();
export const updateGiveawaySchema = insertGiveawaySchema.partial();
export const updateShoutoutSchema = insertShoutoutSchema.partial();
export const updateShoutoutSettingsSchema = insertShoutoutSettingsSchema.partial();
export const updateStreamSessionSchema = insertStreamSessionSchema.partial();
export const updateGameSettingsSchema = insertGameSettingsSchema.partial();
export const updateGameStatsSchema = insertGameStatsSchema.partial();
export const updateCurrencySettingsSchema = insertCurrencySettingsSchema.partial();
export const updateUserBalanceSchema = insertUserBalanceSchema.partial();
export const updateCurrencyRewardSchema = insertCurrencyRewardSchema.partial();
export const updateRewardRedemptionSchema = insertRewardRedemptionSchema.partial();
export const updateSongQueueSchema = insertSongQueueSchema.partial();
export const updateSongSettingsSchema = insertSongSettingsSchema.partial();
export const updatePollSchema = insertPollSchema.partial();
export const updatePollVoteSchema = insertPollVoteSchema.partial();
export const updatePredictionSchema = insertPredictionSchema.partial();
export const updatePredictionBetSchema = insertPredictionBetSchema.partial();
export const updateAlertSettingsSchema = insertAlertSettingsSchema.partial();
export const updateMilestoneSchema = insertMilestoneSchema.partial();
export const updateChatbotSettingsSchema = insertChatbotSettingsSchema.partial();
export const updateChatbotResponseSchema = insertChatbotResponseSchema.partial();
export const updateChatbotContextSchema = insertChatbotContextSchema.partial();
export const updateChatbotPersonalitySchema = insertChatbotPersonalitySchema.partial();

// Signup schema - for user registration
export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// Select types
export type User = typeof users.$inferSelect;
export type PlatformConnection = typeof platformConnections.$inferSelect;
export type BotConfig = typeof botConfigs.$inferSelect;
export type BotInstance = typeof botInstances.$inferSelect;
export type MessageHistory = typeof messageHistory.$inferSelect;
export type CustomCommand = typeof customCommands.$inferSelect;
export type ModerationRule = typeof moderationRules.$inferSelect;
export type ModerationLog = typeof moderationLogs.$inferSelect;
export type LinkWhitelist = typeof linkWhitelist.$inferSelect;
export type Giveaway = typeof giveaways.$inferSelect;
export type GiveawayEntry = typeof giveawayEntries.$inferSelect;
export type GiveawayWinner = typeof giveawayWinners.$inferSelect;
export type GiveawayEntryAttempt = typeof giveawayEntryAttempts.$inferSelect;
export type Shoutout = typeof shoutouts.$inferSelect;
export type ShoutoutSettings = typeof shoutoutSettings.$inferSelect;
export type ShoutoutHistory = typeof shoutoutHistory.$inferSelect;
export type StreamSession = typeof streamSessions.$inferSelect;
export type ViewerSnapshot = typeof viewerSnapshots.$inferSelect;
export type ChatActivity = typeof chatActivity.$inferSelect;
export type GameSettings = typeof gameSettings.$inferSelect;
export type GameHistory = typeof gameHistory.$inferSelect;
export type ActiveTriviaQuestion = typeof activeTriviaQuestions.$inferSelect;
export type GameStats = typeof gameStats.$inferSelect;
export type CurrencySettings = typeof currencySettings.$inferSelect;
export type UserBalance = typeof userBalances.$inferSelect;
export type CurrencyTransaction = typeof currencyTransactions.$inferSelect;
export type CurrencyReward = typeof currencyRewards.$inferSelect;
export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type SongQueue = typeof songQueue.$inferSelect;
export type SongSettings = typeof songSettings.$inferSelect;
export type Poll = typeof polls.$inferSelect;
export type PollVote = typeof pollVotes.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type PredictionBet = typeof predictionBets.$inferSelect;
export type AlertSettings = typeof alertSettings.$inferSelect;
export type AlertHistory = typeof alertHistory.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type ChatbotSettings = typeof chatbotSettings.$inferSelect;
export type ChatbotResponse = typeof chatbotResponses.$inferSelect;
export type ChatbotContext = typeof chatbotContext.$inferSelect;
export type ChatbotPersonality = typeof chatbotPersonalities.$inferSelect;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type SentimentAnalysis = typeof sentimentAnalysis.$inferSelect;

// Insert types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertPlatformConnection = z.infer<typeof insertPlatformConnectionSchema>;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type InsertBotInstance = z.infer<typeof insertBotInstanceSchema>;
export type InsertMessageHistory = z.infer<typeof insertMessageHistorySchema>;
export type InsertCustomCommand = z.infer<typeof insertCustomCommandSchema>;
export type InsertModerationRule = z.infer<typeof insertModerationRuleSchema>;
export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;
export type InsertLinkWhitelist = z.infer<typeof insertLinkWhitelistSchema>;
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type InsertGiveawayEntry = z.infer<typeof insertGiveawayEntrySchema>;
export type InsertGiveawayWinner = z.infer<typeof insertGiveawayWinnerSchema>;
export type InsertGiveawayEntryAttempt = z.infer<typeof insertGiveawayEntryAttemptSchema>;
export type InsertShoutout = z.infer<typeof insertShoutoutSchema>;
export type InsertShoutoutSettings = z.infer<typeof insertShoutoutSettingsSchema>;
export type InsertShoutoutHistory = z.infer<typeof insertShoutoutHistorySchema>;
export type InsertStreamSession = z.infer<typeof insertStreamSessionSchema>;
export type InsertViewerSnapshot = z.infer<typeof insertViewerSnapshotSchema>;
export type InsertChatActivity = z.infer<typeof insertChatActivitySchema>;
export type InsertGameSettings = z.infer<typeof insertGameSettingsSchema>;
export type InsertGameHistory = z.infer<typeof insertGameHistorySchema>;
export type InsertActiveTriviaQuestion = z.infer<typeof insertActiveTriviaQuestionSchema>;
export type InsertGameStats = z.infer<typeof insertGameStatsSchema>;
export type InsertCurrencySettings = z.infer<typeof insertCurrencySettingsSchema>;
export type InsertUserBalance = z.infer<typeof insertUserBalanceSchema>;
export type InsertCurrencyTransaction = z.infer<typeof insertCurrencyTransactionSchema>;
export type InsertCurrencyReward = z.infer<typeof insertCurrencyRewardSchema>;
export type InsertRewardRedemption = z.infer<typeof insertRewardRedemptionSchema>;
export type InsertSongQueue = z.infer<typeof insertSongQueueSchema>;
export type InsertSongSettings = z.infer<typeof insertSongSettingsSchema>;
export type InsertPoll = z.infer<typeof insertPollSchema>;
export type InsertPollVote = z.infer<typeof insertPollVoteSchema>;
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type InsertPredictionBet = z.infer<typeof insertPredictionBetSchema>;
export type InsertAlertSettings = z.infer<typeof insertAlertSettingsSchema>;
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type InsertChatbotSettings = z.infer<typeof insertChatbotSettingsSchema>;
export type InsertChatbotResponse = z.infer<typeof insertChatbotResponseSchema>;
export type InsertChatbotContext = z.infer<typeof insertChatbotContextSchema>;
export type InsertChatbotPersonality = z.infer<typeof insertChatbotPersonalitySchema>;
export type InsertAnalyticsSnapshot = z.infer<typeof insertAnalyticsSnapshotSchema>;
export type InsertSentimentAnalysis = z.infer<typeof insertSentimentAnalysisSchema>;

// Update types
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdateBotConfig = z.infer<typeof updateBotConfigSchema>;
export type UpdatePlatformConnection = z.infer<typeof updatePlatformConnectionSchema>;
export type UpdateBotInstance = z.infer<typeof updateBotInstanceSchema>;
export type UpdateCustomCommand = z.infer<typeof updateCustomCommandSchema>;
export type UpdateModerationRule = z.infer<typeof updateModerationRuleSchema>;
export type UpdateGiveaway = z.infer<typeof updateGiveawaySchema>;
export type UpdateShoutout = z.infer<typeof updateShoutoutSchema>;
export type UpdateShoutoutSettings = z.infer<typeof updateShoutoutSettingsSchema>;
export type UpdateStreamSession = z.infer<typeof updateStreamSessionSchema>;
export type UpdateGameSettings = z.infer<typeof updateGameSettingsSchema>;
export type UpdateGameStats = z.infer<typeof updateGameStatsSchema>;
export type UpdateCurrencySettings = z.infer<typeof updateCurrencySettingsSchema>;
export type UpdateUserBalance = z.infer<typeof updateUserBalanceSchema>;
export type UpdateCurrencyReward = z.infer<typeof updateCurrencyRewardSchema>;
export type UpdateRewardRedemption = z.infer<typeof updateRewardRedemptionSchema>;
export type UpdateSongQueue = z.infer<typeof updateSongQueueSchema>;
export type UpdateSongSettings = z.infer<typeof updateSongSettingsSchema>;
export type UpdatePoll = z.infer<typeof updatePollSchema>;
export type UpdatePollVote = z.infer<typeof updatePollVoteSchema>;
export type UpdatePrediction = z.infer<typeof updatePredictionSchema>;
export type UpdatePredictionBet = z.infer<typeof updatePredictionBetSchema>;
export type UpdateAlertSettings = z.infer<typeof updateAlertSettingsSchema>;
export type UpdateMilestone = z.infer<typeof updateMilestoneSchema>;

// Auth types
export type Signup = z.infer<typeof signupSchema>;
export type Login = z.infer<typeof loginSchema>;

// Backward compatibility table exports (deprecated - use botConfigs instead)
export const botSettings = botConfigs;

// Backward compatibility types (deprecated - use BotConfig instead)
export type BotSettings = BotConfig;
export type InsertBotSettings = InsertBotConfig;
export type UpdateBotSettings = UpdateBotConfig;
