import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Server schema - represents Discord servers
export const servers = pgTable("servers", {
  id: text("id").primaryKey(), // Discord server ID
  name: text("name").notNull(),
  icon: text("icon"),
  ownerId: text("owner_id"),
  adminRoleId: text("admin_role_id"),
  supportRoleId: text("support_role_id"),
  isActive: boolean("is_active").default(true),
});

// Bot settings schema - stores bot configurations per server
export const botSettings = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  botName: text("bot_name").default("Ticket Bot"),
  botNickname: text("bot_nickname"), // Custom nickname for the bot in this server (null = use default)
  botPrefix: text("bot_prefix").default("!"),
  welcomeMessage: text("welcome_message").default("Thank you for creating a ticket. Our support team will assist you shortly."),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  adminRoleId: text("admin_role_id"),
  supportRoleId: text("support_role_id"),
  autoCloseEnabled: boolean("auto_close_enabled").default(false),
  autoCloseHours: text("auto_close_hours").default("48"),
  defaultPriority: text("default_priority").default("normal"), // Default priority for new tickets
  debugMode: boolean("debug_mode").default(false),
  logChannelId: text("log_channel_id"),
  ticketChannelId: text("ticket_channel_id"),
  dashboardUrl: text("dashboard_url"),
  // Admin channel settings for ticket management
  adminChannelId: text("admin_channel_id"), // Private admin channel for ticket copies
  publicLogChannelId: text("public_log_channel_id"), // Public channel for ticket logs
  adminNotificationsEnabled: boolean("admin_notifications_enabled").default(true),
  sendCopyToAdminChannel: boolean("send_copy_to_admin_channel").default(false),
  // Thread integration settings
  threadIntegrationEnabled: boolean("thread_integration_enabled").default(false),
  threadChannelId: text("thread_channel_id"), // Specific channel to monitor for threads (null = all channels)
  threadAutoCreate: boolean("thread_auto_create").default(true), // Auto-create tickets from new threads
  threadBidirectionalSync: boolean("thread_bidirectional_sync").default(true), // Sync messages both ways
  // Starboard settings
  starboardChannelId: text("starboard_channel_id"), // Channel to post starred messages
  starboardThreshold: integer("starboard_threshold").default(3), // Minimum reactions to trigger starboard
  starboardEmoji: text("starboard_emoji").default("⭐"), // Emoji to track for starboard
  starboardEnabled: boolean("starboard_enabled").default(false),
  // Welcome/Goodbye settings
  welcomeChannelId: text("welcome_channel_id"), // Channel to send welcome messages
  welcomeMessageTemplate: text("welcome_message_template").default("Welcome to {server}, {user}! You are member #{memberCount}."),
  goodbyeMessageTemplate: text("goodbye_message_template").default("Goodbye {user}, we'll miss you!"),
  welcomeEnabled: boolean("welcome_enabled").default(false),
  goodbyeEnabled: boolean("goodbye_enabled").default(false),
  autoRoleIds: text("auto_role_ids"), // JSON array of role IDs to auto-assign on join
  // Leveling/XP settings
  xpEnabled: boolean("xp_enabled").default(false),
  levelUpChannelId: text("level_up_channel_id"), // Channel for level-up announcements (null = same channel)
  levelUpMessage: text("level_up_message").default("🎉 Congratulations {user}! You've reached level {level}!"),
  levelRoles: text("level_roles"), // JSON object mapping level numbers to role IDs
  xpCooldownSeconds: integer("xp_cooldown_seconds").default(60), // Cooldown between XP awards
  xpMinAmount: integer("xp_min_amount").default(15), // Minimum XP per message
  xpMaxAmount: integer("xp_max_amount").default(25), // Maximum XP per message
  // Logging settings
  loggingChannelId: text("logging_channel_id"), // Channel for logging events
  logMessageEdits: boolean("log_message_edits").default(true),
  logMessageDeletes: boolean("log_message_deletes").default(true),
  logMemberJoins: boolean("log_member_joins").default(true),
  logMemberLeaves: boolean("log_member_leaves").default(true),
  logModActions: boolean("log_mod_actions").default(true),
  // AutoMod settings
  autoModEnabled: boolean("auto_mod_enabled").default(false),
  bannedWords: text("banned_words"), // JSON array of banned words
  linkWhitelist: text("link_whitelist"), // JSON array of whitelisted domains
  linkFilterEnabled: boolean("link_filter_enabled").default(false),
  spamThreshold: integer("spam_threshold").default(5), // Number of messages
  spamTimeWindow: integer("spam_time_window").default(5), // In seconds
  autoModAction: text("auto_mod_action").default("warn"), // warn, mute, kick
  appliedModerationPresets: text("applied_moderation_presets"), // JSON array of applied preset IDs
  // Suggestion box settings
  suggestionChannelId: text("suggestion_channel_id"), // Channel for suggestions
  // Birthday tracker settings
  birthdayChannelId: text("birthday_channel_id"), // Channel for birthday announcements
  birthdayRoleId: text("birthday_role_id"), // Role to assign on user's birthday
  birthdayMessage: text("birthday_message").default("🎂 Happy Birthday {user}! Hope you have an amazing day! 🎉"),
  birthdayEnabled: boolean("birthday_enabled").default(false),
  // Invite tracker settings
  inviteLogChannelId: text("invite_log_channel_id"), // Channel for invite logs
  inviteTrackingEnabled: boolean("invite_tracking_enabled").default(false),
  // Boost tracker settings
  boostChannelId: text("boost_channel_id"), // Channel for boost thank messages
  boostThankMessage: text("boost_thank_message").default("🚀 Thank you {user} for boosting the server! You're amazing! 💜"),
  boostRoleId: text("boost_role_id"), // Extra recognition role for boosters
  boostTrackingEnabled: boolean("boost_tracking_enabled").default(false),
  // Plex request settings
  plexRequestChannelId: text("plex_request_channel_id"), // Channel for Plex request notifications
  plexAdminRoleId: text("plex_admin_role_id"), // Role required to approve/deny requests
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Discord user schema - represents Discord users
export const discordUsers = pgTable("discord_users", {
  id: text("id").primaryKey(), // Discord user ID
  username: text("username").notNull(),
  discriminator: text("discriminator").notNull(),
  avatar: text("avatar"),
  isAdmin: boolean("is_admin").default(false),
  serverId: text("server_id"), // Associated Discord server
  onboardingCompleted: boolean("onboarding_completed").default(false),
  firstLoginAt: timestamp("first_login_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  adminGuilds: text("admin_guilds"), // JSON string of guilds user is admin in
  connectedServers: text("connected_servers"), // JSON string of servers where bot is connected
  presenceVisible: boolean("presence_visible").default(true), // Whether profile/nowplaying is visible to others
  mediaPreferences: text("media_preferences"), // JSON: connected media services (Plex, Jellyfin, Spotify prefs)
});

// Ticket categories
export const ticketCategories = pgTable("ticket_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").default("🎫"), // Emoji for the category
  color: text("color").notNull().default("#5865F2"), // Default Discord blue
  serverId: text("server_id"), // Associated server ID
});

// Tickets
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id"), // For tracking related Discord channel
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"), // open, closed
  priority: text("priority").default("normal"), // low, normal, high, urgent
  categoryId: integer("category_id"),
  creatorId: text("creator_id").notNull(), // Discord user ID
  assigneeId: text("assignee_id"), // Discord user ID of assigned staff
  serverId: text("server_id"), // Associated server ID
  mediationActions: text("mediation_actions"), // Actions taken by moderators/admins
  userActions: text("user_actions"), // Actions taken by or expected from the user
  firstResponseAt: timestamp("first_response_at"), // When staff first responded
  closedAt: timestamp("closed_at"), // When ticket was closed
  satisfactionRating: integer("satisfaction_rating"), // 1-5 star rating
  satisfactionFeedback: text("satisfaction_feedback"), // Optional feedback text
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Ticket messages
export const ticketMessages = pgTable("ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  senderId: text("sender_id").notNull(), // Discord user ID
  content: text("content").notNull(),
  senderUsername: text("sender_username"), // Store the username directly for better display
  createdAt: timestamp("created_at").defaultNow(),
});

// Ticket resolutions - tracks how tickets were resolved
export const ticketResolutions = pgTable("ticket_resolutions", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  resolutionType: text("resolution_type").notNull(), // resolved, punished, warned, noted
  resolutionNotes: text("resolution_notes"),
  actionTaken: text("action_taken"), // Details of action taken (e.g., "Banned for 7 days", "Verbal warning issued")
  resolvedBy: text("resolved_by").notNull(), // Discord user ID of resolver
  resolvedByUsername: text("resolved_by_username"), // Store username for display
  resolvedAt: timestamp("resolved_at").defaultNow(),
  serverId: text("server_id"), // Associated server ID
});

// Ticket audit log - tracks all actions taken on tickets
export const ticketAuditLog = pgTable("ticket_audit_log", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  action: text("action").notNull(), // created, updated, assigned, resolved, reopened, deleted
  performedBy: text("performed_by").notNull(), // Discord user ID
  performedByUsername: text("performed_by_username"), // Store username for display
  details: text("details"), // JSON string with action details
  createdAt: timestamp("created_at").defaultNow(),
  serverId: text("server_id"), // Associated server ID
});

// Ticket panel settings - stores panel-wide customization per server
export const ticketPanelSettings = pgTable("ticket_panel_settings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(), // Discord server ID
  
  // Panel embed properties
  title: text("title").notNull().default("🎫 Support Ticket System"),
  description: text("description").notNull().default("**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket. Our team will respond as quickly as possible.\n\n*Please provide as much detail as possible when creating your ticket to help us assist you better.*"),
  embedColor: text("embed_color").notNull().default("#5865F2"), // Discord blue
  footerText: text("footer_text").notNull().default("Click a button below to get started • Support Team"),
  
  // Optional embed properties
  showTimestamp: boolean("show_timestamp").default(true),
  thumbnailUrl: text("thumbnail_url"), // Optional thumbnail image
  authorName: text("author_name"), // Optional author name
  authorIconUrl: text("author_icon_url"), // Optional author icon
  
  // Layout settings
  buttonsPerRow: integer("buttons_per_row").default(2),
  showCategoriesInDescription: boolean("show_categories_in_description").default(true),
  maxCategories: integer("max_categories").default(25), // Discord limit
  
  // Panel behavior settings
  isEnabled: boolean("is_enabled").default(true),
  requireReason: boolean("require_reason").default(true),
  cooldownMinutes: integer("cooldown_minutes").default(0), // Prevent spam
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Ticket panel categories - stores individual category settings for panels
export const ticketPanelCategories = pgTable("ticket_panel_categories", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(), // Discord server ID
  ticketCategoryId: integer("ticket_category_id").notNull().references(() => ticketCategories.id),
  
  // Category identification
  name: text("name").notNull(), // e.g., "General Support"
  description: text("description"), // Optional detailed description
  
  // Visual properties
  emoji: text("emoji").notNull().default("🎫"), // Category emoji
  buttonStyle: text("button_style").notNull().default("Primary"), // Primary, Secondary, Success, Danger
  
  // Behavior properties
  isEnabled: boolean("is_enabled").default(true),
  sortOrder: integer("sort_order").default(0), // For ordering categories
  
  // Custom properties
  customId: text("custom_id").notNull(), // For Discord button interaction (e.g., "createTicket_1")
  requiresRole: text("requires_role"), // Optional role ID required to use this category
  
  // Category-specific settings
  welcomeMessage: text("welcome_message"), // Override default welcome message for this category
  assignToRole: text("assign_to_role"), // Auto-assign tickets to specific role
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Panel Templates - allows creating multiple saved embed templates per server
export const panelTemplates = pgTable("panel_templates", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(), // Discord server ID
  
  // Template metadata
  name: text("name").notNull(), // Template name for easy identification
  description: text("description"), // Description of what this template is for
  type: text("type").notNull().default("custom"), // "custom", "ticket", "announcement", "rules", "info"
  
  // Embed properties
  embedTitle: text("embed_title"),
  embedDescription: text("embed_description"),
  embedColor: text("embed_color").default("#5865F2"),
  embedUrl: text("embed_url"), // URL to link the embed title to
  
  // Author fields
  authorName: text("author_name"),
  authorIconUrl: text("author_icon_url"),
  authorUrl: text("author_url"),
  
  // Images
  thumbnailUrl: text("thumbnail_url"),
  imageUrl: text("image_url"), // Main image
  
  // Footer
  footerText: text("footer_text"),
  footerIconUrl: text("footer_icon_url"),
  
  // Timestamp
  showTimestamp: boolean("show_timestamp").default(false),
  
  // Template settings
  isEnabled: boolean("is_enabled").default(true),
  isTicketPanel: boolean("is_ticket_panel").default(false), // If true, uses ticket categories for buttons
  
  // Usage tracking
  lastUsed: timestamp("last_used"),
  useCount: integer("use_count").default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Panel Template Fields - for adding multiple fields to embeds
export const panelTemplateFields = pgTable("panel_template_fields", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => panelTemplates.id, { onDelete: "cascade" }),
  
  // Field properties
  name: text("name").notNull(), // Field title
  value: text("value").notNull(), // Field content
  inline: boolean("inline").default(false), // Whether the field is inline
  
  // Display settings
  sortOrder: integer("sort_order").default(0),
  isEnabled: boolean("is_enabled").default(true),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Panel Template Buttons - for adding custom buttons to non-ticket panels
export const panelTemplateButtons = pgTable("panel_template_buttons", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => panelTemplates.id, { onDelete: "cascade" }),
  
  // Button properties
  customId: text("custom_id").notNull(), // Unique ID for the button interaction
  label: text("label").notNull(), // Button text
  emoji: text("emoji"), // Optional emoji
  buttonStyle: text("button_style").notNull().default("Primary"), // Primary, Secondary, Success, Danger, Link
  
  // Link button specific
  url: text("url"), // URL for link buttons
  
  // Action settings
  actionType: text("action_type").notNull().default("custom"), // "custom", "role_toggle", "url", "ticket_create"
  actionData: text("action_data"), // JSON string for action-specific data
  
  // Display settings
  row: integer("row").default(1), // Which ActionRow (1-5)
  position: integer("position").default(0), // Position within the row
  isEnabled: boolean("is_enabled").default(true),
  
  // Requirements
  requiresRole: text("requires_role"), // Optional role ID required to use this button
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Server Role Permissions - which Discord roles can manage tickets
export const serverRolePermissions = pgTable("server_role_permissions", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  roleId: text("role_id").notNull(), // Discord role ID
  roleName: text("role_name").notNull(), // Role name for display
  
  // Permissions
  canViewTickets: boolean("can_view_tickets").default(true),
  canManageTickets: boolean("can_manage_tickets").default(true),
  canDeleteTickets: boolean("can_delete_tickets").default(false),
  canManageSettings: boolean("can_manage_settings").default(false),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Thread Mappings - maps Discord threads to tickets for bidirectional sync
export const threadMappings = pgTable("thread_mappings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(), // Discord server ID
  threadId: text("thread_id").notNull().unique(), // Discord thread ID
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }), // Reference to ticket
  channelId: text("channel_id").notNull(), // Parent channel ID for the thread
  status: text("status").notNull().default("active"), // active, archived, locked, deleted
  syncEnabled: boolean("sync_enabled").default(true), // Controls bidirectional sync
  lastSyncedAt: timestamp("last_synced_at"), // Tracks last sync time
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Developers - tracks who has developer access to the bot
export const developers = pgTable("developers", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(), // Discord user ID
  username: text("username").notNull(),
  addedBy: text("added_by"), // Discord ID of who added them
  addedAt: timestamp("added_at").defaultNow(),
  isActive: boolean("is_active").default(true),
});

// Developer audit log - tracks all developer actions
export const developerAuditLog = pgTable("developer_audit_log", {
  id: serial("id").primaryKey(),
  developerId: text("developer_id").notNull(), // Discord ID
  action: text("action").notNull(), // sql_query, docker_restart, bot_announcement, etc.
  metadata: text("metadata"), // JSON with action details
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Interaction Locks - prevents duplicate ticket creation from Discord interaction retries
export const interactionLocks = pgTable("interaction_locks", {
  interactionId: text("interaction_id").primaryKey(), // Discord interaction ID
  userId: text("user_id").notNull(), // Discord user ID
  actionType: text("action_type").notNull(), // Type of action (e.g., create_ticket)
  createdAt: timestamp("created_at").defaultNow(), // When interaction was first processed
});

// Interaction Locks validation schemas
export const insertInteractionLockSchema = createInsertSchema(interactionLocks).omit({ createdAt: true });
export type InsertInteractionLock = z.infer<typeof insertInteractionLockSchema>;
export type InteractionLock = typeof interactionLocks.$inferSelect;

// Schema validation for inserting Discord users
export const insertDiscordUserSchema = createInsertSchema(discordUsers);
export type InsertDiscordUser = z.infer<typeof insertDiscordUserSchema>;
export type DiscordUser = typeof discordUsers.$inferSelect;

// Schema validation for inserting servers
export const insertServerSchema = createInsertSchema(servers);
export type InsertServer = z.infer<typeof insertServerSchema>; 
export type Server = typeof servers.$inferSelect;

// Schema validation for inserting bot settings
export const insertBotSettingsSchema = createInsertSchema(botSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;
export type BotSettings = typeof botSettings.$inferSelect;

// Schema validation for inserting ticket categories
export const insertTicketCategorySchema = createInsertSchema(ticketCategories).omit({ id: true });
export type InsertTicketCategory = z.infer<typeof insertTicketCategorySchema>;
export type TicketCategory = typeof ticketCategories.$inferSelect;

// Schema validation for inserting tickets
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof tickets.$inferSelect;

// Restricted schema for ticket updates that excludes sensitive fields
export const ticketUpdateSchema = createInsertSchema(tickets).pick({
  title: true,
  description: true,
  status: true,
  priority: true,
  categoryId: true,
  assigneeId: true,
  // Explicitly exclude: creatorId, serverId, id, createdAt, updatedAt, discordId
}).partial();
export type TicketUpdate = z.infer<typeof ticketUpdateSchema>;

// Schema validation for inserting ticket messages
export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({ id: true, createdAt: true });
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;

// Schema validation for inserting ticket resolutions
export const insertTicketResolutionSchema = createInsertSchema(ticketResolutions).omit({ id: true, resolvedAt: true });
export type InsertTicketResolution = z.infer<typeof insertTicketResolutionSchema>;
export type TicketResolution = typeof ticketResolutions.$inferSelect;

// Schema validation for inserting ticket audit log
export const insertTicketAuditLogSchema = createInsertSchema(ticketAuditLog).omit({ id: true, createdAt: true });
export type InsertTicketAuditLog = z.infer<typeof insertTicketAuditLogSchema>;
export type TicketAuditLog = typeof ticketAuditLog.$inferSelect;

// Schema validation for inserting users
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Schema validation for inserting ticket panel settings
export const insertTicketPanelSettingsSchema = createInsertSchema(ticketPanelSettings).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertTicketPanelSettings = z.infer<typeof insertTicketPanelSettingsSchema>;
export type TicketPanelSettings = typeof ticketPanelSettings.$inferSelect;

// Schema validation for updating ticket panel settings (excluding server ID)
export const updateTicketPanelSettingsSchema = createInsertSchema(ticketPanelSettings).omit({ 
  id: true, 
  serverId: true, 
  createdAt: true, 
  updatedAt: true 
}).partial();
export type UpdateTicketPanelSettings = z.infer<typeof updateTicketPanelSettingsSchema>;

// Schema validation for inserting ticket panel categories
export const insertTicketPanelCategorySchema = createInsertSchema(ticketPanelCategories).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
}).extend({
  customId: z.string().optional()
});
export type InsertTicketPanelCategory = z.infer<typeof insertTicketPanelCategorySchema>;
export type TicketPanelCategory = typeof ticketPanelCategories.$inferSelect;

// Schema validation for updating ticket panel categories (excluding server ID and custom ID)
export const updateTicketPanelCategorySchema = createInsertSchema(ticketPanelCategories).omit({ 
  id: true, 
  serverId: true, 
  customId: true, 
  createdAt: true, 
  updatedAt: true 
}).partial();
export type UpdateTicketPanelCategory = z.infer<typeof updateTicketPanelCategorySchema>;

// Additional validation schemas for specific use cases
export const buttonStyleSchema = z.enum(["Primary", "Secondary", "Success", "Danger", "Link"]);
export type ButtonStyle = z.infer<typeof buttonStyleSchema>;

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g., #5865F2)");
export type HexColor = z.infer<typeof hexColorSchema>;

// Panel Templates validation schemas
export const insertPanelTemplateSchema = createInsertSchema(panelTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
  useCount: true
});
export type InsertPanelTemplate = z.infer<typeof insertPanelTemplateSchema>;
export type PanelTemplate = typeof panelTemplates.$inferSelect;

export const updatePanelTemplateSchema = createInsertSchema(panelTemplates).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
  useCount: true
}).partial();
export type UpdatePanelTemplate = z.infer<typeof updatePanelTemplateSchema>;

// Panel Template Fields validation schemas
export const insertPanelTemplateFieldSchema = createInsertSchema(panelTemplateFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertPanelTemplateField = z.infer<typeof insertPanelTemplateFieldSchema>;
export type PanelTemplateField = typeof panelTemplateFields.$inferSelect;

export const updatePanelTemplateFieldSchema = createInsertSchema(panelTemplateFields).omit({
  id: true,
  templateId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdatePanelTemplateField = z.infer<typeof updatePanelTemplateFieldSchema>;

// Panel Template Buttons validation schemas
export const insertPanelTemplateButtonSchema = createInsertSchema(panelTemplateButtons).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertPanelTemplateButton = z.infer<typeof insertPanelTemplateButtonSchema>;
export type PanelTemplateButton = typeof panelTemplateButtons.$inferSelect;

export const updatePanelTemplateButtonSchema = createInsertSchema(panelTemplateButtons).omit({
  id: true,
  templateId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdatePanelTemplateButton = z.infer<typeof updatePanelTemplateButtonSchema>;

// Server Role Permissions validation schemas
export const insertServerRolePermissionSchema = createInsertSchema(serverRolePermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertServerRolePermission = z.infer<typeof insertServerRolePermissionSchema>;
export type ServerRolePermission = typeof serverRolePermissions.$inferSelect;

export const updateServerRolePermissionSchema = createInsertSchema(serverRolePermissions).omit({
  id: true,
  serverId: true,
  roleId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateServerRolePermission = z.infer<typeof updateServerRolePermissionSchema>;

// Thread Mappings validation schemas
export const insertThreadMappingSchema = createInsertSchema(threadMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertThreadMapping = z.infer<typeof insertThreadMappingSchema>;
export type ThreadMapping = typeof threadMappings.$inferSelect;

// Stream Notification Settings - tracks which channels to send streaming notifications
// YAGPDB-style features: role filtering, game regex, streaming role assignment, cooldowns
export const streamNotificationSettings = pgTable("stream_notification_settings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(), // Discord server ID
  notificationChannelId: text("notification_channel_id"), // Channel to post stream notifications
  isEnabled: boolean("is_enabled").default(true), // Whether stream notifications are enabled
  mentionRole: text("mention_role"), // Optional role to @ mention in notifications
  customMessage: text("custom_message"), // Optional custom message template with variables: {user}, {game}, {url}, {title}, {platform}
  autoDetectEnabled: boolean("auto_detect_enabled").default(false), // Auto-detect users with connected streaming accounts
  autoSyncIntervalMinutes: integer("auto_sync_interval_minutes").default(60), // How often to rescan server members (in minutes)
  lastAutoSyncAt: timestamp("last_auto_sync_at"), // When we last auto-scanned the server
  
  // YAGPDB-style features
  gameFilterRegex: text("game_filter_regex"), // Regex pattern to filter by game/category (e.g., "Minecraft|Fortnite")
  gameFilterEnabled: boolean("game_filter_enabled").default(false), // Whether game filtering is active
  roleRequirements: text("role_requirements"), // JSON array of role IDs - user must have at least one to trigger notifications
  excludedRoles: text("excluded_roles"), // JSON array of role IDs - users with these roles are excluded
  streamingRoleId: text("streaming_role_id"), // Role to assign when user starts streaming, removed when done
  streamingRoleEnabled: boolean("streaming_role_enabled").default(false), // Whether streaming role assignment is enabled
  cooldownMinutes: integer("cooldown_minutes").default(30), // Cooldown between notifications per user (prevent spam)
  notifyAllMembers: boolean("notify_all_members").default(false), // If true, notify for ALL members who go live (not just tracked users)
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stream Notification Tracked Users - tracks which users to monitor for streaming
export const streamTrackedUsers = pgTable("stream_tracked_users", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(), // Discord server ID
  userId: text("user_id").notNull(), // Discord user ID to track
  username: text("username"), // Cache of username for display
  isActive: boolean("is_active").default(true), // Whether to track this user
  lastNotifiedAt: timestamp("last_notified_at"), // When we last sent a notification for this user
  autoDetected: boolean("auto_detected").default(false), // Whether this user was auto-detected vs manually added
  connectedPlatforms: text("connected_platforms"), // JSON array of connected platforms (twitch, youtube, kick)
  platformUsernames: text("platform_usernames"), // JSON object mapping platform to username
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stream Notification Log - tracks notification history for reconciliation
// Used to deduplicate notifications across presence detection, webhooks, and API polling
export const streamNotificationLog = pgTable("stream_notification_log", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  discordUserId: text("discord_user_id").notNull(), // Discord user ID who went live
  platform: text("platform").notNull(), // twitch, youtube, kick, discord
  streamId: text("stream_id"), // Platform-specific stream/broadcast ID for deduplication
  notifiedAt: timestamp("notified_at").defaultNow().notNull(),
  source: text("source").notNull(), // 'presence', 'webhook', 'poller', 'reconciliation'
});
// Index for quick lookups: CREATE INDEX idx_notification_log_lookup ON stream_notification_log(server_id, discord_user_id, stream_id);

// Developers validation schemas
export const insertDeveloperSchema = createInsertSchema(developers).omit({
  id: true,
  addedAt: true
});
export type InsertDeveloper = z.infer<typeof insertDeveloperSchema>;
export type Developer = typeof developers.$inferSelect;

// Stream Notification Settings validation schemas
export const insertStreamNotificationSettingsSchema = createInsertSchema(streamNotificationSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertStreamNotificationSettings = z.infer<typeof insertStreamNotificationSettingsSchema>;
export type StreamNotificationSettings = typeof streamNotificationSettings.$inferSelect;

export const updateStreamNotificationSettingsSchema = createInsertSchema(streamNotificationSettings).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateStreamNotificationSettings = z.infer<typeof updateStreamNotificationSettingsSchema>;

// Stream Tracked Users validation schemas
export const insertStreamTrackedUserSchema = createInsertSchema(streamTrackedUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertStreamTrackedUser = z.infer<typeof insertStreamTrackedUserSchema>;
export type StreamTrackedUser = typeof streamTrackedUsers.$inferSelect;

// Stream Notification Log validation schemas
export const insertStreamNotificationLogSchema = createInsertSchema(streamNotificationLog).omit({
  id: true,
  notifiedAt: true
});
export type InsertStreamNotificationLog = z.infer<typeof insertStreamNotificationLogSchema>;
export type StreamNotificationLog = typeof streamNotificationLog.$inferSelect;

// Notification source types for stream notification log
export type StreamNotificationSource = 'presence' | 'webhook' | 'poller' | 'reconciliation';

// Developer audit log validation schemas
export const insertDeveloperAuditLogSchema = createInsertSchema(developerAuditLog).omit({
  id: true,
  createdAt: true
});
export type InsertDeveloperAuditLog = z.infer<typeof insertDeveloperAuditLogSchema>;
export type DeveloperAuditLog = typeof developerAuditLog.$inferSelect;

// SLA Configurations - defines SLA tiers and response time targets per server
export const slaConfigurations = pgTable("sla_configurations", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  priority: text("priority").notNull(), // urgent, high, normal, low
  responseTimeMinutes: integer("response_time_minutes").notNull(), // Target response time
  resolutionTimeMinutes: integer("resolution_time_minutes"), // Target resolution time
  escalationTimeMinutes: integer("escalation_time_minutes"), // Time before auto-escalation
  notifyOnBreach: boolean("notify_on_breach").default(true),
  notifyChannelId: text("notify_channel_id"), // Discord channel for breach notifications
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// SLA Tracking - tracks SLA status for each ticket
export const slaTracking = pgTable("sla_tracking", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  serverId: text("server_id").notNull(),
  slaConfigId: integer("sla_config_id").references(() => slaConfigurations.id),
  responseDeadline: timestamp("response_deadline"), // When first response is due
  resolutionDeadline: timestamp("resolution_deadline"), // When ticket should be resolved
  firstRespondedAt: timestamp("first_responded_at"), // When first staff response was made
  responseBreached: boolean("response_breached").default(false),
  resolutionBreached: boolean("resolution_breached").default(false),
  breachNotifiedAt: timestamp("breach_notified_at"), // When breach notification was sent
  escalatedAt: timestamp("escalated_at"), // When ticket was escalated due to SLA
  status: text("status").default("active"), // active, responded, resolved, breached
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Escalation Rules - defines escalation paths and triggers
export const escalationRules = pgTable("escalation_rules", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(), // keyword, time_based, priority, manual
  triggerValue: text("trigger_value"), // JSON: keywords array, minutes for time-based, etc.
  escalationLevel: integer("escalation_level").default(1), // 1=support, 2=supervisor, 3=admin
  targetRoleId: text("target_role_id"), // Discord role to escalate to
  notifyChannelId: text("notify_channel_id"), // Channel for escalation notifications
  priority: integer("priority").default(0), // Rule priority (higher = first evaluated)
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Escalation History - tracks all escalations for audit trail
export const escalationHistory = pgTable("escalation_history", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  serverId: text("server_id").notNull(),
  ruleId: integer("rule_id").references(() => escalationRules.id),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  reason: text("reason").notNull(), // Why escalation happened
  triggeredBy: text("triggered_by"), // system, user_id, or rule_name
  previousAssigneeId: text("previous_assignee_id"),
  newAssigneeId: text("new_assignee_id"),
  notificationSent: boolean("notification_sent").default(false),
  messageId: text("message_id"), // Discord notification message ID
  createdAt: timestamp("created_at").defaultNow(),
});

// Webhook Configurations - stores webhook endpoints for external integrations
export const webhookConfigurations = pgTable("webhook_configurations", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  webhookUrl: text("webhook_url"), // External webhook URL to call
  webhookSecret: text("webhook_secret"), // Secret for validating incoming webhooks
  eventTypes: text("event_types").notNull(), // JSON array of event types to trigger on
  targetChannelId: text("target_channel_id"), // Discord channel for incoming webhook alerts
  isInbound: boolean("is_inbound").default(true), // true = receives from external, false = sends to external
  isEnabled: boolean("is_enabled").default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  failureCount: integer("failure_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Webhook Event Log - tracks all webhook events
export const webhookEventLog = pgTable("webhook_event_log", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").references(() => webhookConfigurations.id),
  serverId: text("server_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload"), // JSON payload
  direction: text("direction").notNull(), // inbound or outbound
  statusCode: integer("status_code"), // HTTP status code for outbound
  response: text("response"), // Response body
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at").defaultNow(),
});

// User Warnings - tracks moderation warnings issued to users
export const userWarnings = pgTable("user_warnings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username"),
  moderatorId: text("moderator_id").notNull(),
  moderatorUsername: text("moderator_username"),
  reason: text("reason").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Starred Messages - tracks messages posted to starboard to prevent duplicates
export const starredMessages = pgTable("starred_messages", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  originalMessageId: text("original_message_id").notNull(), // Original message ID
  originalChannelId: text("original_channel_id").notNull(), // Original channel ID
  starboardMessageId: text("starboard_message_id").notNull(), // Message ID in starboard channel
  authorId: text("author_id").notNull(), // Original message author
  starCount: integer("star_count").default(0), // Current star count
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// XP Data - tracks user XP and levels per server
export const xpData = pgTable("xp_data", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(), // Discord user ID
  username: text("username"), // Cached username for display
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(0).notNull(),
  lastMessageAt: timestamp("last_message_at"), // For cooldown tracking
  totalMessages: integer("total_messages").default(0), // Message count for stats
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Guild Provisioning Status - tracks auto-setup progress for new servers
export const guildProvisioningStatus = pgTable("guild_provisioning_status", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  provisioningStartedAt: timestamp("provisioning_started_at").defaultNow(),
  provisioningCompletedAt: timestamp("provisioning_completed_at"),
  categoriesCreated: boolean("categories_created").default(false),
  settingsCreated: boolean("settings_created").default(false),
  welcomeSent: boolean("welcome_sent").default(false),
  ticketCategoryChannelId: text("ticket_category_channel_id"), // Discord category for tickets
  supportChannelId: text("support_channel_id"), // Main support channel
  logChannelId: text("log_channel_id"), // Ticket log channel
  status: text("status").default("pending"), // pending, in_progress, completed, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// SLA Configurations validation schemas
export const insertSlaConfigurationSchema = createInsertSchema(slaConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertSlaConfiguration = z.infer<typeof insertSlaConfigurationSchema>;
export type SlaConfiguration = typeof slaConfigurations.$inferSelect;

export const updateSlaConfigurationSchema = createInsertSchema(slaConfigurations).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateSlaConfiguration = z.infer<typeof updateSlaConfigurationSchema>;

// SLA Tracking validation schemas
export const insertSlaTrackingSchema = createInsertSchema(slaTracking).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertSlaTracking = z.infer<typeof insertSlaTrackingSchema>;
export type SlaTracking = typeof slaTracking.$inferSelect;

// Escalation Rules validation schemas
export const insertEscalationRuleSchema = createInsertSchema(escalationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEscalationRule = z.infer<typeof insertEscalationRuleSchema>;
export type EscalationRule = typeof escalationRules.$inferSelect;

export const updateEscalationRuleSchema = createInsertSchema(escalationRules).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateEscalationRule = z.infer<typeof updateEscalationRuleSchema>;

// Escalation History validation schemas
export const insertEscalationHistorySchema = createInsertSchema(escalationHistory).omit({
  id: true,
  createdAt: true
});
export type InsertEscalationHistory = z.infer<typeof insertEscalationHistorySchema>;
export type EscalationHistory = typeof escalationHistory.$inferSelect;

// Webhook Configurations validation schemas
export const insertWebhookConfigurationSchema = createInsertSchema(webhookConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertWebhookConfiguration = z.infer<typeof insertWebhookConfigurationSchema>;
export type WebhookConfiguration = typeof webhookConfigurations.$inferSelect;

export const updateWebhookConfigurationSchema = createInsertSchema(webhookConfigurations).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateWebhookConfiguration = z.infer<typeof updateWebhookConfigurationSchema>;

// Webhook Event Log validation schemas
export const insertWebhookEventLogSchema = createInsertSchema(webhookEventLog).omit({
  id: true,
  processedAt: true
});
export type InsertWebhookEventLog = z.infer<typeof insertWebhookEventLogSchema>;
export type WebhookEventLog = typeof webhookEventLog.$inferSelect;

// Guild Provisioning Status validation schemas
export const insertGuildProvisioningStatusSchema = createInsertSchema(guildProvisioningStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertGuildProvisioningStatus = z.infer<typeof insertGuildProvisioningStatusSchema>;
export type GuildProvisioningStatus = typeof guildProvisioningStatus.$inferSelect;

// Starred Messages validation schemas
export const insertStarredMessageSchema = createInsertSchema(starredMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertStarredMessage = z.infer<typeof insertStarredMessageSchema>;
export type StarredMessage = typeof starredMessages.$inferSelect;

// XP Data validation schemas
export const insertXpDataSchema = createInsertSchema(xpData).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertXpData = z.infer<typeof insertXpDataSchema>;
export type XpData = typeof xpData.$inferSelect;

export const updateXpDataSchema = createInsertSchema(xpData).omit({
  id: true,
  serverId: true,
  userId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateXpData = z.infer<typeof updateXpDataSchema>;

// Level Rewards - role rewards for reaching specific levels
export const levelRewards = pgTable("level_rewards", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  level: integer("level").notNull(),
  roleId: text("role_id").notNull(),
  roleName: text("role_name"), // Cached role name for display
  createdAt: timestamp("created_at").defaultNow(),
});

// Level Rewards validation schemas
export const insertLevelRewardSchema = createInsertSchema(levelRewards).omit({
  id: true,
  createdAt: true
});
export type InsertLevelReward = z.infer<typeof insertLevelRewardSchema>;
export type LevelReward = typeof levelRewards.$inferSelect;

// Reaction Roles - tracks reaction role assignments
export const reactionRoles = pgTable("reaction_roles", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  messageId: text("message_id").notNull(),
  channelId: text("channel_id").notNull(),
  emoji: text("emoji").notNull(),
  roleId: text("role_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reaction Roles validation schemas
export const insertReactionRoleSchema = createInsertSchema(reactionRoles).omit({
  id: true,
  createdAt: true
});
export type InsertReactionRole = z.infer<typeof insertReactionRoleSchema>;
export type ReactionRole = typeof reactionRoles.$inferSelect;

// Suggestions - tracks user suggestions
export const suggestions = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"), // Discord message ID for the suggestion embed
  authorId: text("author_id").notNull(), // Discord user ID
  authorUsername: text("author_username"), // Cache username for display
  content: text("content").notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, denied, implemented
  adminResponse: text("admin_response"), // Response from admin when approving/denying
  responderId: text("responder_id"), // Discord user ID of admin who responded
  upvotes: integer("upvotes").default(0),
  downvotes: integer("downvotes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Suggestions validation schemas
export const insertSuggestionSchema = createInsertSchema(suggestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertSuggestion = z.infer<typeof insertSuggestionSchema>;
export type Suggestion = typeof suggestions.$inferSelect;

export const updateSuggestionSchema = createInsertSchema(suggestions).omit({
  id: true,
  serverId: true,
  channelId: true,
  authorId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateSuggestion = z.infer<typeof updateSuggestionSchema>;

// AFK Users - tracks users who are AFK
export const afkUsers = pgTable("afk_users", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username"),
  reason: text("reason"),
  afkSince: timestamp("afk_since").defaultNow().notNull(),
});

// AFK Users validation schemas
export const insertAfkUserSchema = createInsertSchema(afkUsers).omit({
  id: true,
  afkSince: true
});
export type InsertAfkUser = z.infer<typeof insertAfkUserSchema>;
export type AfkUser = typeof afkUsers.$inferSelect;

// Discord Giveaways - tracks active and ended giveaways
export const discordGiveaways = pgTable("discord_giveaways", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),
  prize: text("prize").notNull(),
  description: text("description"),
  hostId: text("host_id").notNull(),
  hostUsername: text("host_username"),
  endTime: timestamp("end_time").notNull(),
  winnerCount: integer("winner_count").default(1).notNull(),
  ended: boolean("ended").default(false).notNull(),
  requirements: text("requirements"), // JSON: { minLevel?: number, requiredRoles?: string[] }
  entries: text("entries"), // JSON array of user IDs who entered
  winners: text("winners"), // JSON array of winner user IDs
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Discord Giveaways validation schemas
export const insertDiscordGiveawaySchema = createInsertSchema(discordGiveaways).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertDiscordGiveaway = z.infer<typeof insertDiscordGiveawaySchema>;
export type DiscordGiveaway = typeof discordGiveaways.$inferSelect;

export const updateDiscordGiveawaySchema = createInsertSchema(discordGiveaways).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateDiscordGiveaway = z.infer<typeof updateDiscordGiveawaySchema>;

// Birthdays - tracks user birthdays per server
export const birthdays = pgTable("birthdays", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(), // Discord user ID
  username: text("username"), // Cached username for display
  birthMonth: integer("birth_month").notNull(), // 1-12
  birthDay: integer("birth_day").notNull(), // 1-31
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Birthdays validation schemas
export const insertBirthdaySchema = createInsertSchema(birthdays).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertBirthday = z.infer<typeof insertBirthdaySchema>;
export type Birthday = typeof birthdays.$inferSelect;

export const updateBirthdaySchema = createInsertSchema(birthdays).omit({
  id: true,
  serverId: true,
  userId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateBirthday = z.infer<typeof updateBirthdaySchema>;

// Invite Tracker - tracks who invited whom
export const inviteTracker = pgTable("invite_tracker", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  inviterId: text("inviter_id").notNull(), // Discord user ID of inviter
  inviterUsername: text("inviter_username"), // Cached inviter username
  invitedUserId: text("invited_user_id").notNull(), // Discord user ID of invited user
  invitedUsername: text("invited_username"), // Cached invited username
  inviteCode: text("invite_code"), // The invite code that was used
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

// Invite Tracker validation schemas
export const insertInviteTrackerSchema = createInsertSchema(inviteTracker).omit({
  id: true,
  joinedAt: true
});
export type InsertInviteTracker = z.infer<typeof insertInviteTrackerSchema>;
export type InviteTracker = typeof inviteTracker.$inferSelect;

// Scheduled Messages - stores scheduled messages for servers
export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  channelId: text("channel_id").notNull(),
  message: text("message").notNull(),
  embedJson: text("embed_json"), // JSON string for embed data
  cronExpression: text("cron_expression"), // For repeating messages
  nextRunAt: timestamp("next_run_at").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: text("created_by").notNull(), // Discord user ID
  createdByUsername: text("created_by_username"), // Cached username
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Scheduled Messages validation schemas
export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;

export const updateScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({
  id: true,
  serverId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateScheduledMessage = z.infer<typeof updateScheduledMessageSchema>;

// Custom Commands - stores custom commands for servers (enhanced for powerful command engine)
export const customCommands = pgTable("custom_commands", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  trigger: text("trigger").notNull(), // The command trigger (without prefix)
  aliases: text("aliases"), // JSON array of aliases e.g., ["cmd", "c"]
  description: text("description"), // Command description for help
  category: text("category").default("Custom"), // Category for organizing in help
  response: text("response"), // Response text with variable support
  embedJson: text("embed_json"), // JSON string for embed response
  
  // Command type and behavior
  commandType: text("command_type").default("prefix").notNull(), // prefix, slash, both
  isEnabled: boolean("is_enabled").default(true).notNull(),
  isHidden: boolean("is_hidden").default(false).notNull(), // Hidden from help
  
  // Permissions and requirements
  requiredRoleIds: text("required_role_ids"), // JSON array of role IDs (any of these)
  deniedRoleIds: text("denied_role_ids"), // JSON array of roles that can't use command
  requiredChannelIds: text("required_channel_ids"), // JSON array - only usable in these channels
  requiredPermissions: text("required_permissions"), // JSON array of Discord permissions
  
  // Cooldowns
  cooldownSeconds: integer("cooldown_seconds").default(0), // Per-user cooldown
  globalCooldownSeconds: integer("global_cooldown_seconds").default(0), // Server-wide cooldown
  
  // Response settings
  deleteUserMessage: boolean("delete_user_message").default(false), // Delete triggering message
  deleteResponseAfter: integer("delete_response_after"), // Delete response after X seconds (null = don't delete)
  ephemeral: boolean("ephemeral").default(false), // Ephemeral response for slash commands
  mentionUser: boolean("mention_user").default(false), // Mention user in response
  
  // Actions - for button/interaction responses
  actionsJson: text("actions_json"), // JSON array of actions [{type, data}]
  
  // Draft/publish workflow
  isDraft: boolean("is_draft").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  
  createdBy: text("created_by").notNull(), // Discord user ID
  createdByUsername: text("created_by_username"), // Cached username
  usageCount: integer("usage_count").default(0).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Custom Commands validation schemas
export const insertCustomCommandSchema = createInsertSchema(customCommands).omit({
  id: true,
  usageCount: true,
  lastUsedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCustomCommand = z.infer<typeof insertCustomCommandSchema>;
export type CustomCommand = typeof customCommands.$inferSelect;

export const updateCustomCommandSchema = createInsertSchema(customCommands).omit({
  id: true,
  serverId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateCustomCommand = z.infer<typeof updateCustomCommandSchema>;

// Command Triggers - stores multiple trigger patterns for custom commands
export const commandTriggers = pgTable("command_triggers", {
  id: serial("id").primaryKey(),
  commandId: integer("command_id").notNull(), // Reference to customCommands
  triggerType: text("trigger_type").notNull().default("prefix"), // prefix, contains, exact, regex
  trigger: text("trigger").notNull(), // The trigger pattern
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Command Triggers validation schemas
export const insertCommandTriggerSchema = createInsertSchema(commandTriggers).omit({
  id: true,
  createdAt: true
});
export type InsertCommandTrigger = z.infer<typeof insertCommandTriggerSchema>;
export type CommandTrigger = typeof commandTriggers.$inferSelect;

export const triggerTypeSchema = z.enum(["prefix", "contains", "exact", "regex"]);
export type TriggerType = z.infer<typeof triggerTypeSchema>;

// User Embeds - temporary storage for embed builder per user
export const userEmbeds = pgTable("user_embeds", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Discord user ID
  serverId: text("server_id").notNull(),
  title: text("title"),
  description: text("description"),
  color: text("color").default("#5865F2"),
  footer: text("footer"),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  authorName: text("author_name"),
  authorIconUrl: text("author_icon_url"),
  fields: text("fields"), // JSON array of {name, value, inline} objects
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Embeds validation schemas
export const insertUserEmbedSchema = createInsertSchema(userEmbeds).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertUserEmbed = z.infer<typeof insertUserEmbedSchema>;
export type UserEmbed = typeof userEmbeds.$inferSelect;

export const updateUserEmbedSchema = createInsertSchema(userEmbeds).omit({
  id: true,
  userId: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateUserEmbed = z.infer<typeof updateUserEmbedSchema>;

// Media Requests - tracks Plex media requests
export const mediaRequests = pgTable("media_requests", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(), // Discord user ID of requester
  username: text("username").notNull(), // Cache username for display
  title: text("title").notNull(), // Requested media title
  mediaType: text("media_type").notNull().default("movie"), // movie, show
  status: text("status").notNull().default("pending"), // pending, approved, denied, downloaded
  reason: text("reason"), // Reason for denial (or notes)
  imdbId: text("imdb_id"), // Optional IMDB ID if found
  tmdbId: text("tmdb_id"), // Optional TMDB ID if found
  year: text("year"), // Optional release year
  posterUrl: text("poster_url"), // Optional poster URL for display
  approvedBy: text("approved_by"), // Discord user ID of admin who approved/denied
  approvedByUsername: text("approved_by_username"), // Cache approver username
  approvedAt: timestamp("approved_at"), // When the request was approved/denied
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Media Requests validation schemas
export const insertMediaRequestSchema = createInsertSchema(mediaRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertMediaRequest = z.infer<typeof insertMediaRequestSchema>;
export type MediaRequest = typeof mediaRequests.$inferSelect;

export const updateMediaRequestSchema = createInsertSchema(mediaRequests).omit({
  id: true,
  serverId: true,
  userId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateMediaRequest = z.infer<typeof updateMediaRequestSchema>;

// =============================================
// GUILD CUSTOMIZATION SYSTEM
// =============================================

// Guild Bot Profiles - per-server bot identity (nickname, avatar)
export const guildBotProfiles = pgTable("guild_bot_profiles", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  
  // Bot identity
  nickname: text("nickname"), // Custom nickname for this server (null = use default)
  avatarUrl: text("avatar_url"), // URL to custom avatar image
  avatarAssetId: text("avatar_asset_id"), // Reference to uploaded asset in MinIO/storage
  
  // Sync status
  nicknameSyncedAt: timestamp("nickname_synced_at"),
  avatarSyncedAt: timestamp("avatar_synced_at"),
  lastSyncError: text("last_sync_error"),
  
  // Settings
  autoSyncEnabled: boolean("auto_sync_enabled").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGuildBotProfileSchema = createInsertSchema(guildBotProfiles).omit({
  id: true,
  nicknameSyncedAt: true,
  avatarSyncedAt: true,
  createdAt: true,
  updatedAt: true
});
export type InsertGuildBotProfile = z.infer<typeof insertGuildBotProfileSchema>;
export type GuildBotProfile = typeof guildBotProfiles.$inferSelect;

export const updateGuildBotProfileSchema = createInsertSchema(guildBotProfiles).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateGuildBotProfile = z.infer<typeof updateGuildBotProfileSchema>;

// Command Cooldowns - tracks command usage cooldowns
export const commandCooldowns = pgTable("command_cooldowns", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  commandId: integer("command_id").notNull(), // Reference to customCommands
  userId: text("user_id"), // null for global cooldowns
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCommandCooldownSchema = createInsertSchema(commandCooldowns).omit({
  id: true,
  createdAt: true
});
export type InsertCommandCooldown = z.infer<typeof insertCommandCooldownSchema>;
export type CommandCooldown = typeof commandCooldowns.$inferSelect;

// Command Variables - custom variables for command responses
export const commandVariables = pgTable("command_variables", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(), // Variable name e.g., "server_rules_url"
  value: text("value").notNull(), // Variable value
  description: text("description"), // What this variable is for
  isGlobal: boolean("is_global").default(false), // Available to all commands
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCommandVariableSchema = createInsertSchema(commandVariables).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCommandVariable = z.infer<typeof insertCommandVariableSchema>;
export type CommandVariable = typeof commandVariables.$inferSelect;

// Template Catalog - shareable command/embed templates
export const templateCatalog = pgTable("template_catalog", {
  id: serial("id").primaryKey(),
  
  // Template metadata
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("General"), // Pokemon TCG, Moderation, Fun, etc.
  tags: text("tags"), // JSON array of tags for searching
  
  // Template content
  templateType: text("template_type").notNull(), // command, embed, panel, workflow
  templateJson: text("template_json").notNull(), // Full template configuration
  previewImageUrl: text("preview_image_url"), // Preview screenshot
  
  // Origin
  isOfficial: boolean("is_official").default(false), // Official Nebula Command template
  sourceServerId: text("source_server_id"), // Server that shared this template
  createdBy: text("created_by"), // Discord user ID
  createdByUsername: text("created_by_username"),
  
  // Stats
  installCount: integer("install_count").default(0),
  rating: integer("rating"), // Average rating 1-5
  ratingCount: integer("rating_count").default(0),
  
  // Visibility
  isPublic: boolean("is_public").default(false), // Available in public catalog
  isEnabled: boolean("is_enabled").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTemplateCatalogSchema = createInsertSchema(templateCatalog).omit({
  id: true,
  installCount: true,
  rating: true,
  ratingCount: true,
  createdAt: true,
  updatedAt: true
});
export type InsertTemplateCatalog = z.infer<typeof insertTemplateCatalogSchema>;
export type TemplateCatalog = typeof templateCatalog.$inferSelect;

// Installed Templates - tracks which templates are installed per server
export const installedTemplates = pgTable("installed_templates", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  templateId: integer("template_id").notNull(), // Reference to templateCatalog
  customizations: text("customizations"), // JSON of customizations made to template
  installedBy: text("installed_by"), // Discord user ID
  installedAt: timestamp("installed_at").defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at"),
});

export const insertInstalledTemplateSchema = createInsertSchema(installedTemplates).omit({
  id: true,
  installedAt: true,
  lastUpdatedAt: true
});
export type InsertInstalledTemplate = z.infer<typeof insertInstalledTemplateSchema>;
export type InstalledTemplate = typeof installedTemplates.$inferSelect;

// Custom Help Settings - per-server help customization
export const customHelpSettings = pgTable("custom_help_settings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  
  // Help embed appearance
  title: text("title").default("Help Menu"),
  description: text("description"),
  color: text("color").default("#5865F2"),
  footerText: text("footer_text"),
  thumbnailUrl: text("thumbnail_url"),
  
  // Category display
  showCategories: boolean("show_categories").default(true),
  categoryOrder: text("category_order"), // JSON array of category names in order
  hiddenCategories: text("hidden_categories"), // JSON array of hidden category names
  
  // Command display
  showCommandCount: boolean("show_command_count").default(true),
  showCommandUsage: boolean("show_command_usage").default(true),
  showPermissions: boolean("show_permissions").default(false),
  
  // Behavior
  ephemeral: boolean("ephemeral").default(false), // Ephemeral help response
  paginationEnabled: boolean("pagination_enabled").default(true),
  commandsPerPage: integer("commands_per_page").default(10),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomHelpSettingsSchema = createInsertSchema(customHelpSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCustomHelpSettings = z.infer<typeof insertCustomHelpSettingsSchema>;
export type CustomHelpSettings = typeof customHelpSettings.$inferSelect;

// Interaction Actions - reusable action definitions for buttons, selects, modals
export const interactionActions = pgTable("interaction_actions", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(), // Unique name for this action in server
  description: text("description"),
  
  // Action type and configuration
  actionType: text("action_type").notNull(), // send_message, send_embed, assign_role, remove_role, create_thread, open_modal, create_ticket, webhook, etc.
  actionConfig: text("action_config").notNull(), // JSON configuration for the action
  
  // Chain actions together
  nextActionId: integer("next_action_id"), // For action pipelines
  
  // Requirements
  requiredRoleIds: text("required_role_ids"), // JSON array
  requiredPermissions: text("required_permissions"), // JSON array
  
  isEnabled: boolean("is_enabled").default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInteractionActionSchema = createInsertSchema(interactionActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertInteractionAction = z.infer<typeof insertInteractionActionSchema>;
export type InteractionAction = typeof interactionActions.$inferSelect;

// Command Analytics - tracks command usage for insights
export const commandAnalytics = pgTable("command_analytics", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  commandId: integer("command_id"), // null for built-in commands
  commandName: text("command_name").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id"),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  responseTimeMs: integer("response_time_ms"),
  usedAt: timestamp("used_at").defaultNow(),
});

export const insertCommandAnalyticsSchema = createInsertSchema(commandAnalytics).omit({
  id: true,
  usedAt: true
});
export type InsertCommandAnalytics = z.infer<typeof insertCommandAnalyticsSchema>;
export type CommandAnalytics = typeof commandAnalytics.$inferSelect;

// Welcome Card Templates - visual welcome card designs per server
export const welcomeCardTemplates = pgTable("welcome_card_templates", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull().default("Default Welcome Card"),
  isActive: boolean("is_active").default(true),
  
  // Canvas settings
  width: integer("width").default(800),
  height: integer("height").default(400),
  
  // Background settings
  backgroundType: text("background_type").default("solid"), // solid, gradient, image
  backgroundColor: text("background_color").default("#1a1a2e"),
  backgroundGradient: text("background_gradient"), // JSON: {start, end, direction}
  backgroundImage: text("background_image"), // URL or base64
  backgroundBlur: integer("background_blur").default(0),
  backgroundOpacity: integer("background_opacity").default(100),
  
  // Border settings
  borderEnabled: boolean("border_enabled").default(false),
  borderColor: text("border_color").default("#ffffff"),
  borderWidth: integer("border_width").default(2),
  borderRadius: integer("border_radius").default(20),
  
  // Elements stored as JSON array
  elements: text("elements").default("[]"), // JSON array of WelcomeCardElement objects
  
  // Message settings
  welcomeMessage: text("welcome_message").default("Welcome to {server}!"),
  channelId: text("channel_id"), // Override botSettings welcomeChannelId
  
  // Metadata
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWelcomeCardTemplateSchema = createInsertSchema(welcomeCardTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertWelcomeCardTemplate = z.infer<typeof insertWelcomeCardTemplateSchema>;
export type WelcomeCardTemplate = typeof welcomeCardTemplates.$inferSelect;

// Welcome Card Element Types
export interface WelcomeCardElement {
  id: string;
  type: "avatar" | "text" | "shape" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  
  // Avatar-specific
  avatarStyle?: "circle" | "rounded" | "square";
  avatarBorderColor?: string;
  avatarBorderWidth?: number;
  
  // Text-specific
  text?: string; // Supports variables: {username}, {server}, {memberCount}, {date}
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  textShadow?: boolean;
  textShadowColor?: string;
  
  // Shape-specific
  shapeType?: "rectangle" | "circle" | "line";
  shapeFill?: string;
  shapeStroke?: string;
  shapeStrokeWidth?: number;
  shapeOpacity?: number;
  
  // Image-specific
  imageUrl?: string;
  imageOpacity?: number;
}

// Voice Channel Stats - tracking voice activity
export const voiceStats = pgTable("voice_stats", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  sessionStart: timestamp("session_start").defaultNow(),
  sessionEnd: timestamp("session_end"),
  durationSeconds: integer("duration_seconds").default(0),
  date: text("date").notNull(), // YYYY-MM-DD for daily aggregation
});

export const insertVoiceStatsSchema = createInsertSchema(voiceStats).omit({
  id: true
});
export type InsertVoiceStats = z.infer<typeof insertVoiceStatsSchema>;
export type VoiceStats = typeof voiceStats.$inferSelect;

// Moderation Logs - detailed mod action tracking
export const modLogs = pgTable("mod_logs", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  moderatorName: text("moderator_name").notNull(),
  targetId: text("target_id"), // User being moderated
  targetName: text("target_name"),
  action: text("action").notNull(), // ban, kick, timeout, warn, mute, unmute, role_add, role_remove
  reason: text("reason"),
  duration: text("duration"), // For timeouts
  channelId: text("channel_id"),
  messageId: text("message_id"),
  metadata: text("metadata"), // JSON for additional context
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertModLogSchema = createInsertSchema(modLogs).omit({
  id: true,
  createdAt: true
});
export type InsertModLog = z.infer<typeof insertModLogSchema>;
export type ModLog = typeof modLogs.$inferSelect;

// ============================================================
// INTERACTION STUDIO - Visual Workflow Automation Builder
// ============================================================

// Automation Workflows - Main workflow definitions with triggers
export const automationWorkflows = pgTable("automation_workflows", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Trigger configuration
  triggerType: text("trigger_type").notNull(), // message_received, member_join, member_leave, reaction_add, reaction_remove, button_click, select_menu, scheduled, voice_join, voice_leave, role_add, role_remove, channel_create, thread_create
  triggerConfig: text("trigger_config").default("{}"), // JSON: channel filters, keyword matches, role filters, etc.
  
  // Workflow settings
  isEnabled: boolean("is_enabled").default(true),
  priority: integer("priority").default(0), // Higher = runs first when multiple match
  
  // Cooldown settings
  cooldownEnabled: boolean("cooldown_enabled").default(false),
  cooldownSeconds: integer("cooldown_seconds").default(60),
  cooldownType: text("cooldown_type").default("user"), // user, channel, server
  
  // Rate limiting
  maxExecutionsPerHour: integer("max_executions_per_hour").default(100),
  
  // Metadata
  createdBy: text("created_by"),
  lastTriggeredAt: timestamp("last_triggered_at"),
  executionCount: integer("execution_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAutomationWorkflowSchema = createInsertSchema(automationWorkflows).omit({
  id: true,
  lastTriggeredAt: true,
  executionCount: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAutomationWorkflow = z.infer<typeof insertAutomationWorkflowSchema>;
export type AutomationWorkflow = typeof automationWorkflows.$inferSelect;

// Workflow Conditions - Filters that must pass for workflow to execute
export const workflowConditions = pgTable("workflow_conditions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  
  // Condition grouping (for AND/OR logic)
  groupIndex: integer("group_index").default(0), // Conditions in same group = AND, different groups = OR
  
  // Condition type and configuration
  conditionType: text("condition_type").notNull(), // user_has_role, user_missing_role, channel_is, channel_is_not, message_contains, message_starts_with, message_matches_regex, user_is, user_is_not, has_permission, time_between, day_of_week, user_joined_after, user_joined_before, member_count_above, member_count_below
  conditionConfig: text("condition_config").notNull(), // JSON with condition-specific data
  
  // Negation support
  isNegated: boolean("is_negated").default(false),
  
  // Order for display
  sortOrder: integer("sort_order").default(0),
});

export const insertWorkflowConditionSchema = createInsertSchema(workflowConditions).omit({
  id: true
});
export type InsertWorkflowCondition = z.infer<typeof insertWorkflowConditionSchema>;
export type WorkflowCondition = typeof workflowConditions.$inferSelect;

// Workflow Actions - Ordered actions to execute
export const workflowActions = pgTable("workflow_actions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  
  // Action ordering
  sortOrder: integer("sort_order").default(0),
  
  // Action type and configuration
  actionType: text("action_type").notNull(), // send_message, send_embed, send_dm, add_role, remove_role, create_thread, delete_message, add_reaction, timeout_user, kick_user, ban_user, set_nickname, move_to_voice, disconnect_from_voice, wait_delay, call_webhook, set_variable, branch_if
  actionConfig: text("action_config").notNull(), // JSON with action-specific data
  
  // Branching support (for if/else logic)
  branchParentId: integer("branch_parent_id"), // Points to the branch_if action this belongs to
  branchType: text("branch_type"), // "then" or "else" - which branch this action is in
  
  // Error handling
  continueOnError: boolean("continue_on_error").default(true),
  errorMessage: text("error_message"), // Custom error message to log
});

export const insertWorkflowActionSchema = createInsertSchema(workflowActions).omit({
  id: true
});
export type InsertWorkflowAction = z.infer<typeof insertWorkflowActionSchema>;
export type WorkflowAction = typeof workflowActions.$inferSelect;

// Workflow Variables - Persistent variables per workflow/server
export const workflowVariables = pgTable("workflow_variables", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  workflowId: integer("workflow_id"), // null = server-wide variable
  
  name: text("name").notNull(),
  value: text("value").default(""),
  valueType: text("value_type").default("string"), // string, number, boolean, json
  
  // Scope
  scope: text("scope").default("server"), // server, channel, user
  scopeId: text("scope_id"), // Channel ID or User ID if scoped
  
  // Metadata
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkflowVariableSchema = createInsertSchema(workflowVariables).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertWorkflowVariable = z.infer<typeof insertWorkflowVariableSchema>;
export type WorkflowVariable = typeof workflowVariables.$inferSelect;

// Workflow Execution Logs - For debugging and monitoring
export const workflowLogs = pgTable("workflow_logs", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  serverId: text("server_id").notNull(),
  
  // Trigger context
  triggerUserId: text("trigger_user_id"),
  triggerChannelId: text("trigger_channel_id"),
  triggerMessageId: text("trigger_message_id"),
  triggerData: text("trigger_data"), // JSON snapshot of trigger context
  
  // Execution result
  status: text("status").notNull(), // started, success, failed, skipped, rate_limited, cooldown
  
  // Timing
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Action execution details
  actionsExecuted: integer("actions_executed").default(0),
  actionResults: text("action_results"), // JSON array of action results
  
  // Error details
  errorMessage: text("error_message"),
  errorActionId: integer("error_action_id"), // Which action failed
  errorStack: text("error_stack"),
});

export const insertWorkflowLogSchema = createInsertSchema(workflowLogs).omit({
  id: true,
  startedAt: true,
  completedAt: true
});
export type InsertWorkflowLog = z.infer<typeof insertWorkflowLogSchema>;
export type WorkflowLog = typeof workflowLogs.$inferSelect;

// Workflow Templates - Pre-built workflows that can be installed
export const workflowTemplates = pgTable("workflow_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // moderation, welcome, engagement, utility, fun
  
  // Template content
  triggerType: text("trigger_type").notNull(),
  triggerConfig: text("trigger_config").default("{}"),
  conditions: text("conditions").default("[]"), // JSON array of condition configs
  actions: text("actions").default("[]"), // JSON array of action configs
  
  // Template metadata
  author: text("author").default("System"),
  version: text("version").default("1.0.0"),
  tags: text("tags"), // JSON array of tags for search
  previewImage: text("preview_image"), // URL to preview image
  
  // Usage stats
  installCount: integer("install_count").default(0),
  rating: integer("rating").default(0), // 1-5 star rating
  
  isOfficial: boolean("is_official").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkflowTemplateSchema = createInsertSchema(workflowTemplates).omit({
  id: true,
  installCount: true,
  rating: true,
  createdAt: true,
  updatedAt: true
});
export type InsertWorkflowTemplate = z.infer<typeof insertWorkflowTemplateSchema>;
export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;

// Workflow Cooldowns - Track cooldown state
export const workflowCooldowns = pgTable("workflow_cooldowns", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  serverId: text("server_id").notNull(),
  
  // Cooldown target
  cooldownType: text("cooldown_type").notNull(), // user, channel, server
  targetId: text("target_id"), // User ID, Channel ID, or null for server-wide
  
  // Timing
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkflowCooldownSchema = createInsertSchema(workflowCooldowns).omit({
  id: true,
  createdAt: true
});
export type InsertWorkflowCooldown = z.infer<typeof insertWorkflowCooldownSchema>;
export type WorkflowCooldown = typeof workflowCooldowns.$inferSelect;

// Type definitions for workflow configuration
export interface TriggerConfig {
  // Message triggers
  channelIds?: string[];
  excludeChannelIds?: string[];
  keywords?: string[];
  keywordMatchType?: "contains" | "starts_with" | "ends_with" | "exact" | "regex";
  ignoreBots?: boolean;
  ignoreCommands?: boolean;
  
  // Reaction triggers
  emojiNames?: string[];
  messageId?: string;
  
  // Role triggers
  roleIds?: string[];
  
  // Scheduled triggers
  cronExpression?: string;
  timezone?: string;
  
  // Voice triggers
  voiceChannelIds?: string[];
  
  // Button/Select triggers
  customIds?: string[];
}

// Embed Templates - stores reusable embed templates per server
export const embedTemplates = pgTable("embed_templates", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  embedData: text("embed_data").notNull(), // JSON with title, description, color, fields, footer, image, thumbnail, author, timestamp
  createdBy: text("created_by").notNull(), // Discord user ID
  createdByUsername: text("created_by_username"), // Cached username
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Embed Templates validation schemas
export const insertEmbedTemplateSchema = createInsertSchema(embedTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEmbedTemplate = z.infer<typeof insertEmbedTemplateSchema>;
export type EmbedTemplate = typeof embedTemplates.$inferSelect;

export const updateEmbedTemplateSchema = createInsertSchema(embedTemplates).omit({
  id: true,
  serverId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateEmbedTemplate = z.infer<typeof updateEmbedTemplateSchema>;

// Embed data structure interface
export interface EmbedData {
  title?: string;
  description?: string;
  color?: string;
  url?: string;
  timestamp?: boolean;
  footer?: {
    text?: string;
    iconUrl?: string;
  };
  image?: {
    url?: string;
  };
  thumbnail?: {
    url?: string;
  };
  author?: {
    name?: string;
    iconUrl?: string;
    url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

export interface ConditionConfig {
  // Role conditions
  roleIds?: string[];
  
  // Channel conditions
  channelIds?: string[];
  categoryIds?: string[];
  
  // User conditions
  userIds?: string[];
  
  // Permission conditions
  permissions?: string[];
  
  // Content conditions
  pattern?: string;
  caseSensitive?: boolean;
  
  // Time conditions
  startTime?: string; // HH:mm format
  endTime?: string;
  daysOfWeek?: number[]; // 0=Sunday, 1=Monday, etc.
  
  // Numeric conditions
  value?: number;
  operator?: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
}

export interface ActionConfig {
  // Message actions
  content?: string; // Supports variables like {user.mention}, {channel.name}
  embedConfig?: {
    title?: string;
    description?: string;
    color?: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    thumbnail?: string;
    image?: string;
    footer?: string;
  };
  channelId?: string; // Override target channel
  replyToTrigger?: boolean;
  ephemeral?: boolean;
  
  // Role actions
  roleId?: string;
  roleIds?: string[];
  
  // Thread actions
  threadName?: string;
  autoArchiveDuration?: number;
  
  // Reaction actions
  emoji?: string;
  
  // Moderation actions
  reason?: string;
  duration?: number; // In seconds for timeout
  deleteMessageDays?: number; // For ban
  
  // Delay actions
  delayMs?: number;
  
  // Webhook actions
  webhookUrl?: string;
  webhookBody?: string;
  
  // Variable actions
  variableName?: string;
  variableValue?: string;
  variableOperation?: "set" | "increment" | "decrement" | "append";
  
  // Branch actions
  branchCondition?: ConditionConfig;
}

// Supported variables for dynamic content
export const WORKFLOW_VARIABLES = {
  user: {
    id: "{user.id}",
    mention: "{user.mention}",
    name: "{user.name}",
    displayName: "{user.displayName}",
    avatar: "{user.avatar}",
    joinedAt: "{user.joinedAt}",
    createdAt: "{user.createdAt}",
    roles: "{user.roles}",
  },
  channel: {
    id: "{channel.id}",
    name: "{channel.name}",
    mention: "{channel.mention}",
    topic: "{channel.topic}",
  },
  server: {
    id: "{server.id}",
    name: "{server.name}",
    memberCount: "{server.memberCount}",
    icon: "{server.icon}",
  },
  message: {
    id: "{message.id}",
    content: "{message.content}",
    link: "{message.link}",
  },
  trigger: {
    timestamp: "{trigger.timestamp}",
    date: "{trigger.date}",
    time: "{trigger.time}",
  },
  random: {
    number: "{random.number}", // Random number 1-100
    uuid: "{random.uuid}",
    choice: "{random.choice:option1,option2,option3}", // Random from list
  },
} as const;

// =============================================
// CUSTOM FORMS / INTAKE SYSTEM
// =============================================

// Custom Forms - stores form templates per server
export const customForms = pgTable("custom_forms", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  fields: text("fields").notNull(), // JSON array of {label, type, required, options, placeholder}
  submitChannelId: text("submit_channel_id"), // Channel to post submissions
  createTicket: boolean("create_ticket").default(false), // Create ticket on submission
  ticketCategoryId: integer("ticket_category_id"), // Category for auto-created tickets
  isEnabled: boolean("is_enabled").default(true),
  buttonLabel: text("button_label").default("Open Form"),
  buttonEmoji: text("button_emoji"),
  buttonStyle: text("button_style").default("Primary"), // Primary, Secondary, Success, Danger
  embedColor: text("embed_color").default("#5865F2"),
  successMessage: text("success_message").default("Thank you for your submission!"),
  createdBy: text("created_by"),
  createdByUsername: text("created_by_username"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Form field type definition for JSONB
export interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  required: boolean;
  placeholder?: string;
  options?: string[]; // For select type
  minLength?: number;
  maxLength?: number;
}

// Custom Forms validation schemas
export const insertCustomFormSchema = createInsertSchema(customForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertCustomForm = z.infer<typeof insertCustomFormSchema>;
export type CustomForm = typeof customForms.$inferSelect;

export const updateCustomFormSchema = createInsertSchema(customForms).omit({
  id: true,
  serverId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateCustomForm = z.infer<typeof updateCustomFormSchema>;

// Form Submissions - stores submitted form data
export const formSubmissions = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => customForms.id, { onDelete: "cascade" }),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(), // Discord user ID
  username: text("username"), // Cached username
  responses: text("responses").notNull(), // JSON object of {fieldId: value}
  ticketId: integer("ticket_id"), // Optional reference to created ticket
  messageId: text("message_id"), // Discord message ID of the submission embed
  channelId: text("channel_id"), // Channel where submission was posted
  submittedAt: timestamp("submitted_at").defaultNow(),
});

// Form submission response type definition
export interface FormResponse {
  [fieldId: string]: string | number;
}

// Form Submissions validation schemas
export const insertFormSubmissionSchema = createInsertSchema(formSubmissions).omit({
  id: true,
  submittedAt: true
});
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormSubmission = typeof formSubmissions.$inferSelect;

// =============================================
// ECONOMY SYSTEM
// =============================================

// Economy Settings - per-server economy configuration
export const economySettings = pgTable("economy_settings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  currencyName: text("currency_name").default("Coins"),
  currencyEmoji: text("currency_emoji").default("🪙"),
  dailyAmount: integer("daily_amount").default(100),
  messageReward: integer("message_reward").default(5),
  voiceRewardPerMin: integer("voice_reward_per_min").default(2),
  messageRewardCooldown: integer("message_reward_cooldown").default(60), // Seconds between message rewards
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Economy Settings validation schemas
export const insertEconomySettingsSchema = createInsertSchema(economySettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertEconomySettings = z.infer<typeof insertEconomySettingsSchema>;
export type EconomySettings = typeof economySettings.$inferSelect;

export const updateEconomySettingsSchema = createInsertSchema(economySettings).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateEconomySettings = z.infer<typeof updateEconomySettingsSchema>;

// User Balances - tracks user currency per server
export const userBalances = pgTable("user_balances", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(), // Discord user ID
  balance: integer("balance").default(0),
  bank: integer("bank").default(0),
  lastDaily: timestamp("last_daily"),
  lastMessageReward: timestamp("last_message_reward"),
  totalEarned: integer("total_earned").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Balances validation schemas
export const insertUserBalanceSchema = createInsertSchema(userBalances).omit({
  id: true,
  createdAt: true
});
export type InsertUserBalance = z.infer<typeof insertUserBalanceSchema>;
export type UserBalance = typeof userBalances.$inferSelect;

export const updateUserBalanceSchema = createInsertSchema(userBalances).omit({
  id: true,
  serverId: true,
  userId: true,
  createdAt: true
}).partial();
export type UpdateUserBalance = z.infer<typeof updateUserBalanceSchema>;

// Shop Items - items users can purchase
export const shopItems = pgTable("shop_items", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  type: text("type").notNull().default("item"), // "role" | "item"
  roleId: text("role_id"), // Discord role ID if type is "role"
  stock: integer("stock"), // null = unlimited
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shop Items validation schemas
export const insertShopItemSchema = createInsertSchema(shopItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertShopItem = z.infer<typeof insertShopItemSchema>;
export type ShopItem = typeof shopItems.$inferSelect;

export const updateShopItemSchema = createInsertSchema(shopItems).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateShopItem = z.infer<typeof updateShopItemSchema>;

// Economy Transactions - audit log of all economy activity
export const economyTransactions = pgTable("economy_transactions", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(), // Positive = gain, negative = loss
  type: text("type").notNull(), // "daily", "message", "voice", "gamble", "pay", "purchase", "admin"
  description: text("description"),
  relatedUserId: text("related_user_id"), // For transfers
  createdAt: timestamp("created_at").defaultNow(),
});

// Economy Transactions validation schemas
export const insertEconomyTransactionSchema = createInsertSchema(economyTransactions).omit({
  id: true,
  createdAt: true
});
export type InsertEconomyTransaction = z.infer<typeof insertEconomyTransactionSchema>;
export type EconomyTransaction = typeof economyTransactions.$inferSelect;

// User Purchases - tracks what users have bought
export const userPurchases = pgTable("user_purchases", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  shopItemId: integer("shop_item_id").notNull().references(() => shopItems.id, { onDelete: "cascade" }),
  purchasedAt: timestamp("purchased_at").defaultNow(),
});

// User Purchases validation schemas
export const insertUserPurchaseSchema = createInsertSchema(userPurchases).omit({
  id: true,
  purchasedAt: true
});
export type InsertUserPurchase = z.infer<typeof insertUserPurchaseSchema>;
export type UserPurchase = typeof userPurchases.$inferSelect;

// =============================================
// CONTENT SCHEDULER
// =============================================

// Scheduled Posts - stores scheduled content per server
export const scheduledPosts = pgTable("scheduled_posts", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  content: text("content"), // Plain text content
  embedData: text("embed_data"), // JSON embed data (optional)
  channelId: text("channel_id").notNull(), // Target Discord channel
  scheduleType: text("schedule_type").notNull().default("once"), // "once" | "recurring"
  cronExpression: text("cron_expression"), // Cron expression for recurring posts
  nextRunAt: timestamp("next_run_at"), // Next scheduled execution
  lastRunAt: timestamp("last_run_at"), // Last execution time
  timezone: text("timezone").default("UTC"),
  isEnabled: boolean("is_enabled").default(true),
  createdBy: text("created_by").notNull(), // Discord user ID
  createdByUsername: text("created_by_username"), // Cached username
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Scheduled Posts validation schemas
export const insertScheduledPostSchema = createInsertSchema(scheduledPosts).omit({
  id: true,
  lastRunAt: true,
  createdAt: true,
  updatedAt: true
});
export type InsertScheduledPost = z.infer<typeof insertScheduledPostSchema>;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;

export const updateScheduledPostSchema = createInsertSchema(scheduledPosts).omit({
  id: true,
  serverId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateScheduledPost = z.infer<typeof updateScheduledPostSchema>;

// Scheduled post embed data interface
export interface ScheduledPostEmbedData {
  title?: string;
  description?: string;
  color?: string;
  url?: string;
  timestamp?: boolean;
  footer?: {
    text?: string;
    iconUrl?: string;
  };
  image?: {
    url?: string;
  };
  thumbnail?: {
    url?: string;
  };
  author?: {
    name?: string;
    iconUrl?: string;
    url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

// =============================================
// ANALYTICS DASHBOARD TABLES
// =============================================

// Server Metrics - daily aggregate metrics per server
export const serverMetrics = pgTable("server_metrics", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  date: timestamp("date").notNull(),
  memberCount: integer("member_count").default(0),
  messageCount: integer("message_count").default(0),
  voiceMinutes: integer("voice_minutes").default(0),
  newMembers: integer("new_members").default(0),
  leftMembers: integer("left_members").default(0),
  activeUsers: integer("active_users").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Server Metrics validation schemas
export const insertServerMetricsSchema = createInsertSchema(serverMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertServerMetrics = z.infer<typeof insertServerMetricsSchema>;
export type ServerMetrics = typeof serverMetrics.$inferSelect;

export const updateServerMetricsSchema = createInsertSchema(serverMetrics).omit({
  id: true,
  serverId: true,
  date: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateServerMetrics = z.infer<typeof updateServerMetricsSchema>;

// Command Usage - detailed command usage log (supplements commandAnalytics)
export const commandUsage = pgTable("command_usage", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  commandName: text("command_name").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id"),
  usedAt: timestamp("used_at").defaultNow(),
});

// Command Usage validation schemas
export const insertCommandUsageSchema = createInsertSchema(commandUsage).omit({
  id: true,
  usedAt: true
});
export type InsertCommandUsage = z.infer<typeof insertCommandUsageSchema>;
export type CommandUsage = typeof commandUsage.$inferSelect;

// Workflow Metrics - daily workflow execution stats
export const workflowMetrics = pgTable("workflow_metrics", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  serverId: text("server_id").notNull(),
  date: timestamp("date").notNull(),
  executions: integer("executions").default(0),
  successes: integer("successes").default(0),
  failures: integer("failures").default(0),
  avgDurationMs: integer("avg_duration_ms").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workflow Metrics validation schemas
export const insertWorkflowMetricsSchema = createInsertSchema(workflowMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertWorkflowMetrics = z.infer<typeof insertWorkflowMetricsSchema>;
export type WorkflowMetrics = typeof workflowMetrics.$inferSelect;

export const updateWorkflowMetricsSchema = createInsertSchema(workflowMetrics).omit({
  id: true,
  workflowId: true,
  serverId: true,
  date: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateWorkflowMetrics = z.infer<typeof updateWorkflowMetricsSchema>;

// =============================================
// ONBOARDING WIZARD
// =============================================

// Onboarding Progress - tracks setup wizard progress per server
export const onboardingProgress = pgTable("onboarding_progress", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  step: text("step").notNull(), // "welcome", "features", "welcome_channel", "moderation", "templates", "complete"
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  stepData: text("step_data"), // JSON data for the step (e.g., selected features, channel configs)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Onboarding Status - overall onboarding status per server
export const onboardingStatus = pgTable("onboarding_status", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  isSkipped: boolean("is_skipped").default(false),
  isCompleted: boolean("is_completed").default(false),
  currentStep: text("current_step").default("welcome"),
  appliedTemplate: text("applied_template"), // "gaming", "creator", "business", null
  completedAt: timestamp("completed_at"),
  skippedAt: timestamp("skipped_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Onboarding Progress validation schemas
export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;

export const updateOnboardingProgressSchema = createInsertSchema(onboardingProgress).omit({
  id: true,
  serverId: true,
  step: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateOnboardingProgress = z.infer<typeof updateOnboardingProgressSchema>;

// Onboarding Status validation schemas
export const insertOnboardingStatusSchema = createInsertSchema(onboardingStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertOnboardingStatus = z.infer<typeof insertOnboardingStatusSchema>;
export type OnboardingStatus = typeof onboardingStatus.$inferSelect;

export const updateOnboardingStatusSchema = createInsertSchema(onboardingStatus).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateOnboardingStatus = z.infer<typeof updateOnboardingStatusSchema>;

// =============================================
// POLLS / VOTING SYSTEM
// =============================================

// Poll types
export type PollType = 'single' | 'multiple' | 'ranked';

// Discord Polls table - stores Discord bot poll definitions
export const discordPolls = pgTable("discord_polls", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),
  question: text("question").notNull(),
  pollType: text("poll_type").notNull().default("single"),
  options: text("options").notNull(),
  votes: text("votes").default("{}"),
  createdBy: text("created_by").notNull(),
  createdByUsername: text("created_by_username"),
  endsAt: timestamp("ends_at"),
  ended: boolean("ended").default(false),
  anonymous: boolean("anonymous").default(false),
  maxChoices: integer("max_choices").default(1),
  allowedRoles: text("allowed_roles"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Discord Poll Votes table - tracks individual votes for non-anonymous polls
export const discordPollVotes = pgTable("discord_poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => discordPolls.id, { onDelete: "cascade" }),
  odUserId: text("od_user_id").notNull(),
  odUsername: text("od_username"),
  optionIndices: text("option_indices").notNull(),
  votedAt: timestamp("voted_at").defaultNow(),
});

// Keep aliases for backwards compatibility
export const polls = discordPolls;
export const pollVotes = discordPollVotes;

// Polls validation schemas
export const insertPollSchema = createInsertSchema(polls).omit({
  id: true,
  createdAt: true
});
export type InsertPoll = z.infer<typeof insertPollSchema>;
export type Poll = typeof polls.$inferSelect;

export const updatePollSchema = createInsertSchema(polls).omit({
  id: true,
  serverId: true,
  channelId: true,
  createdBy: true,
  createdAt: true
}).partial();
export type UpdatePoll = z.infer<typeof updatePollSchema>;

// Poll Votes validation schemas
export const insertPollVoteSchema = createInsertSchema(pollVotes).omit({
  id: true,
  votedAt: true
});
export type InsertPollVote = z.infer<typeof insertPollVoteSchema>;
export type PollVote = typeof pollVotes.$inferSelect;

// Poll option interface for JSON storage
export interface PollOption {
  text: string;
  emoji?: string;
}

// Poll votes structure for JSON storage
export interface PollVotesData {
  [optionIndex: string]: string[];
}

// =============================================
// MODERATION / AUTOMOD SYSTEM
// =============================================

// Rule types for automod
export type AutomodRuleType = 'banned_words' | 'spam' | 'links' | 'caps' | 'mentions' | 'invites';
export type ModerationActionType = 'warn' | 'mute' | 'kick' | 'ban' | 'timeout' | 'unban' | 'unwarn';

// Automod Rules table - configurable rules per server
export const automodRules = pgTable("automod_rules", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(), // banned_words, spam, links, caps, mentions, invites
  config: text("config").notNull().default("{}"), // JSON config specific to rule type
  action: text("action").notNull().default("warn"), // warn, mute, kick, ban
  actionDuration: integer("action_duration"), // Duration in seconds for mute/ban (null = permanent)
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Moderation Actions table - logs all moderation actions taken
export const moderationActions = pgTable("moderation_actions", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(), // Target user
  moderatorId: text("moderator_id").notNull(), // Who performed the action
  moderatorUsername: text("moderator_username"),
  actionType: text("action_type").notNull(), // warn, mute, kick, ban, timeout, unban, unwarn
  reason: text("reason"),
  duration: integer("duration"), // Duration in seconds (for mute/ban/timeout)
  expiresAt: timestamp("expires_at"), // When the action expires
  isAutomod: boolean("is_automod").default(false), // Was this triggered by automod
  ruleId: integer("rule_id"), // Reference to automod rule if automod triggered
  createdAt: timestamp("created_at").defaultNow(),
});

// Warnings table - separate table for warnings with thresholds
export const warnings = pgTable("warnings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  odUserId: text("od_user_id").notNull(), // Target user
  odUsername: text("od_username"),
  moderatorId: text("moderator_id").notNull(),
  moderatorUsername: text("moderator_username"),
  reason: text("reason").notNull(),
  isActive: boolean("is_active").default(true), // Can be removed/pardoned
  createdAt: timestamp("created_at").defaultNow(),
});

// Temp Bans table - tracks temporary bans for automatic unbanning
export const tempBans = pgTable("temp_bans", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  odUserId: text("od_user_id").notNull(), // Banned user
  odUsername: text("od_username"),
  moderatorId: text("moderator_id").notNull(),
  moderatorUsername: text("moderator_username"),
  reason: text("reason"),
  expiresAt: timestamp("expires_at").notNull(), // When the ban expires
  isActive: boolean("is_active").default(true), // False when unbanned
  createdAt: timestamp("created_at").defaultNow(),
});

// Automod Rules validation schemas
export const insertAutomodRuleSchema = createInsertSchema(automodRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAutomodRule = z.infer<typeof insertAutomodRuleSchema>;
export type AutomodRule = typeof automodRules.$inferSelect;

export const updateAutomodRuleSchema = createInsertSchema(automodRules).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateAutomodRule = z.infer<typeof updateAutomodRuleSchema>;

// Moderation Actions validation schemas
export const insertModerationActionSchema = createInsertSchema(moderationActions).omit({
  id: true,
  createdAt: true
});
export type InsertModerationAction = z.infer<typeof insertModerationActionSchema>;
export type ModerationAction = typeof moderationActions.$inferSelect;

// Warnings validation schemas
export const insertWarningSchema = createInsertSchema(warnings).omit({
  id: true,
  createdAt: true
});
export type InsertWarning = z.infer<typeof insertWarningSchema>;
export type Warning = typeof warnings.$inferSelect;

// Temp Bans validation schemas
export const insertTempBanSchema = createInsertSchema(tempBans).omit({
  id: true,
  createdAt: true
});
export type InsertTempBan = z.infer<typeof insertTempBanSchema>;
export type TempBan = typeof tempBans.$inferSelect;

// Automod rule config interfaces for JSON storage
export interface BannedWordsConfig {
  words: string[];
  useWildcards: boolean;
  matchCase: boolean;
}

export interface SpamConfig {
  maxMessages: number;
  timeWindowSeconds: number;
  duplicateThreshold: number;
}

export interface LinksConfig {
  blockAll: boolean;
  whitelist: string[];
  blacklist: string[];
}

export interface CapsConfig {
  maxPercentage: number;
  minLength: number;
}

export interface MentionsConfig {
  maxMentions: number;
  includeRoles: boolean;
  includeEveryone: boolean;
}

export interface InvitesConfig {
  blockAllInvites: boolean;
  whitelistedServers: string[];
}

// Media Presence Settings - tracks channel auto-posting for Plex/Jellyfin now playing
export const mediaPresenceSettings = pgTable("media_presence_settings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  channelId: text("channel_id"), // Discord channel to post updates
  isEnabled: boolean("is_enabled").default(true),
  postTypes: text("post_types").default("all"), // "movies", "shows", "music", "all"
  cooldownMinutes: integer("cooldown_minutes").default(30), // Prevent spam for same title
  showUser: boolean("show_user").default(true), // Show who's watching
  showProgress: boolean("show_progress").default(true), // Show progress on end
  showPoster: boolean("show_poster").default(true), // Show movie/album art
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Media Presence Log - tracks posted updates for cooldown and message editing
export const mediaPresenceLog = pgTable("media_presence_log", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  sessionKey: text("session_key").notNull(), // Unique key: source_itemId_user
  messageId: text("message_id"), // Discord message ID for editing
  channelId: text("channel_id").notNull(),
  source: text("source").notNull(), // "plex" or "jellyfin"
  title: text("title").notNull(),
  mediaType: text("media_type").notNull(), // "movie", "episode", "track"
  user: text("user").notNull(), // Who's watching
  state: text("state").notNull().default("playing"), // "playing", "paused", "ended"
  postedAt: timestamp("posted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Media Presence Settings validation schemas
export const insertMediaPresenceSettingsSchema = createInsertSchema(mediaPresenceSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertMediaPresenceSettings = z.infer<typeof insertMediaPresenceSettingsSchema>;
export type MediaPresenceSettings = typeof mediaPresenceSettings.$inferSelect;

export const updateMediaPresenceSettingsSchema = createInsertSchema(mediaPresenceSettings).omit({
  id: true,
  serverId: true,
  createdAt: true,
  updatedAt: true
}).partial();
export type UpdateMediaPresenceSettings = z.infer<typeof updateMediaPresenceSettingsSchema>;

// Media Presence Log validation schemas
export const insertMediaPresenceLogSchema = createInsertSchema(mediaPresenceLog).omit({
  id: true,
  postedAt: true,
  updatedAt: true
});
export type InsertMediaPresenceLog = z.infer<typeof insertMediaPresenceLogSchema>;
export type MediaPresenceLog = typeof mediaPresenceLog.$inferSelect;