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
  logChannelId: text("log_channel_id"),
  ticketChannelId: text("ticket_channel_id"),
  dashboardUrl: text("dashboard_url"),
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
});

// Ticket categories
export const ticketCategories = pgTable("ticket_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
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

// Schema validation for inserting ticket messages
export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({ id: true, createdAt: true });
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;

// Schema validation for inserting users
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;