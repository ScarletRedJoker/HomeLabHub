import { 
  type User, 
  type InsertUser, 
  type DiscordUser, 
  type InsertDiscordUser,
  type Server,
  type InsertServer,
  type BotSettings,
  type InsertBotSettings,
  type TicketCategory, 
  type InsertTicketCategory, 
  type Ticket, 
  type InsertTicket, 
  type TicketMessage, 
  type InsertTicketMessage,
  type TicketPanelSettings,
  type InsertTicketPanelSettings,
  type UpdateTicketPanelSettings,
  type TicketPanelCategory,
  type InsertTicketPanelCategory,
  type UpdateTicketPanelCategory,
  type PanelTemplate,
  type InsertPanelTemplate,
  type UpdatePanelTemplate,
  type PanelTemplateField,
  type InsertPanelTemplateField,
  type UpdatePanelTemplateField,
  type PanelTemplateButton,
  type InsertPanelTemplateButton,
  type UpdatePanelTemplateButton,
  type TicketResolution,
  type InsertTicketResolution,
  type TicketAuditLog,
  type InsertTicketAuditLog,
  type ServerRolePermission,
  type InsertServerRolePermission,
  type UpdateServerRolePermission,
  type ThreadMapping,
  type InsertThreadMapping,
  type Developer,
  type InsertDeveloper,
  type DeveloperAuditLog,
  type InsertDeveloperAuditLog,
  type StreamNotificationSettings,
  type InsertStreamNotificationSettings,
  type UpdateStreamNotificationSettings,
  type StreamTrackedUser,
  type InsertStreamTrackedUser,
  type StreamNotificationLog,
  type InsertStreamNotificationLog,
  type InteractionLock,
  type InsertInteractionLock,
  type SlaConfiguration,
  type InsertSlaConfiguration,
  type UpdateSlaConfiguration,
  type SlaTracking,
  type InsertSlaTracking,
  type EscalationRule,
  type InsertEscalationRule,
  type UpdateEscalationRule,
  type EscalationHistory,
  type InsertEscalationHistory,
  type WebhookConfiguration,
  type InsertWebhookConfiguration,
  type UpdateWebhookConfiguration,
  type WebhookEventLog,
  type InsertWebhookEventLog,
  type GuildProvisioningStatus,
  type InsertGuildProvisioningStatus,
  type StarredMessage,
  type InsertStarredMessage,
  type XpData,
  type InsertXpData,
  type UpdateXpData,
  type ReactionRole,
  type InsertReactionRole,
  type AfkUser,
  type InsertAfkUser,
  type DiscordGiveaway,
  type InsertDiscordGiveaway,
  type UpdateDiscordGiveaway,
  type Suggestion,
  type InsertSuggestion,
  type UpdateSuggestion,
  type Birthday,
  type InsertBirthday,
  type UpdateBirthday,
  type InviteTracker,
  type InsertInviteTracker,
  type ScheduledMessage,
  type InsertScheduledMessage,
  type UpdateScheduledMessage,
  type CustomCommand,
  type InsertCustomCommand,
  type UpdateCustomCommand,
  type CommandTrigger,
  type InsertCommandTrigger,
  type UserEmbed,
  type InsertUserEmbed,
  type UpdateUserEmbed,
  type MediaRequest,
  type InsertMediaRequest,
  type UpdateMediaRequest,
  type LevelReward,
  type InsertLevelReward,
  type CommandVariable,
  type CustomForm,
  type InsertCustomForm,
  type UpdateCustomForm,
  type FormSubmission,
  type InsertFormSubmission,
  type InsertCommandVariable,
  type AutomationWorkflow,
  type InsertAutomationWorkflow,
  type WorkflowCondition,
  type InsertWorkflowCondition,
  type WorkflowAction,
  type InsertWorkflowAction,
  type WorkflowLog,
  type InsertWorkflowLog,
  type WorkflowCooldown,
  type InsertWorkflowCooldown,
  type WorkflowTemplate,
  type EmbedTemplate,
  type InsertEmbedTemplate,
  type UpdateEmbedTemplate,
  type EconomySettings,
  type InsertEconomySettings,
  type UpdateEconomySettings,
  type UserBalance,
  type InsertUserBalance,
  type UpdateUserBalance,
  type ShopItem,
  type InsertShopItem,
  type UpdateShopItem,
  type EconomyTransaction,
  type InsertEconomyTransaction,
  type UserPurchase,
  type InsertUserPurchase,
  type ScheduledPost,
  type InsertScheduledPost,
  type UpdateScheduledPost,
  type OnboardingProgress,
  type InsertOnboardingProgress,
  type UpdateOnboardingProgress,
  type OnboardingStatus,
  type InsertOnboardingStatus,
  type UpdateOnboardingStatus,
  type Poll,
  type InsertPoll,
  type UpdatePoll,
  type PollVote,
  type InsertPollVote,
  users,
  discordUsers,
  servers,
  botSettings,
  ticketCategories,
  tickets,
  ticketMessages,
  ticketPanelSettings,
  ticketPanelCategories,
  panelTemplates,
  panelTemplateFields,
  panelTemplateButtons,
  ticketResolutions,
  ticketAuditLog,
  serverRolePermissions,
  threadMappings,
  developers,
  developerAuditLog,
  streamNotificationSettings,
  streamTrackedUsers,
  streamNotificationLog,
  interactionLocks,
  slaConfigurations,
  slaTracking,
  escalationRules,
  escalationHistory,
  webhookConfigurations,
  webhookEventLog,
  guildProvisioningStatus,
  starredMessages,
  xpData,
  levelRewards,
  reactionRoles,
  afkUsers,
  discordGiveaways,
  suggestions,
  birthdays,
  inviteTracker,
  scheduledMessages,
  customCommands,
  commandTriggers,
  userEmbeds,
  mediaRequests,
  commandVariables,
  automationWorkflows,
  workflowConditions,
  workflowActions,
  workflowLogs,
  workflowCooldowns,
  workflowTemplates,
  embedTemplates,
  customForms,
  formSubmissions,
  economySettings,
  userBalances,
  shopItems,
  economyTransactions,
  userPurchases,
  scheduledPosts,
  onboardingProgress,
  onboardingStatus,
  discordPolls,
  discordPollVotes
} from "@shared/schema";
import { IStorage } from "./storage";
import { db } from "./db";
import { eq, and, lte, desc } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  // Discord user operations
  async getAllDiscordUsers(): Promise<DiscordUser[]> {
    return await db.select().from(discordUsers);
  }
  
  async getDiscordUser(id: string): Promise<DiscordUser | undefined> {
    const [user] = await db.select().from(discordUsers).where(eq(discordUsers.id, id));
    return user;
  }
  
  async createDiscordUser(user: InsertDiscordUser): Promise<DiscordUser> {
    const [discordUser] = await db.insert(discordUsers).values({
      ...user,
      serverId: user.serverId || null
    }).returning();
    return discordUser;
  }
  
  async updateDiscordUser(id: string, updates: Partial<InsertDiscordUser>): Promise<DiscordUser | undefined> {
    const [updatedUser] = await db
      .update(discordUsers)
      .set(updates)
      .where(eq(discordUsers.id, id))
      .returning();
    return updatedUser;
  }

  async findOrCreateDiscordUserAtomic(
    discordId: string,
    createData: InsertDiscordUser
  ): Promise<{ user: DiscordUser; created: boolean }> {
    return await db.transaction(async (tx: PgTransaction<any, any, any>) => {
      const [existingUser] = await tx
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.id, discordId));

      if (existingUser) {
        return { user: existingUser, created: false };
      }

      const [newUser] = await tx
        .insert(discordUsers)
        .values({
          ...createData,
          serverId: createData.serverId || null
        })
        .returning();

      return { user: newUser, created: true };
    });
  }
  
  // Server operations
  async getAllServers(): Promise<Server[]> {
    return await db.select().from(servers);
  }
  
  async getServer(id: string): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.id, id));
    return server;
  }
  
  async createServer(server: InsertServer): Promise<Server> {
    const [newServer] = await db.insert(servers).values(server).returning();
    return newServer;
  }
  
  async updateServer(id: string, updates: Partial<InsertServer>): Promise<Server | undefined> {
    const [updatedServer] = await db
      .update(servers)
      .set(updates)
      .where(eq(servers.id, id))
      .returning();
    return updatedServer;
  }
  
  // Bot settings operations
  async getBotSettings(serverId: string): Promise<BotSettings | undefined> {
    const [settings] = await db.select().from(botSettings).where(eq(botSettings.serverId, serverId));
    return settings;
  }
  
  async createBotSettings(settings: InsertBotSettings): Promise<BotSettings> {
    const [newSettings] = await db.insert(botSettings).values({
      ...settings,
      updatedAt: new Date()
    }).returning();
    return newSettings;
  }
  
  async updateBotSettings(serverId: string, updates: Partial<InsertBotSettings>): Promise<BotSettings | undefined> {
    const [updatedSettings] = await db
      .update(botSettings)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(botSettings.serverId, serverId))
      .returning();
    return updatedSettings;
  }
  
  // Ticket category operations
  async getAllTicketCategories(): Promise<TicketCategory[]> {
    return await db.select().from(ticketCategories);
  }
  
  async getTicketCategoriesByServerId(serverId: string): Promise<TicketCategory[]> {
    return await db.select().from(ticketCategories).where(eq(ticketCategories.serverId, serverId));
  }
  
  async getTicketCategory(id: number): Promise<TicketCategory | undefined> {
    const [category] = await db.select().from(ticketCategories).where(eq(ticketCategories.id, id));
    return category;
  }
  
  async createTicketCategory(category: InsertTicketCategory): Promise<TicketCategory> {
    const [newCategory] = await db.insert(ticketCategories).values({
      ...category,
      serverId: category.serverId || null
    }).returning();
    return newCategory;
  }

  // Create default ticket categories for a new server
  async createDefaultCategories(serverId: string): Promise<TicketCategory[]> {
    const defaultCategories = [
      {
        name: "General Support",
        emoji: "💬",
        color: "#5865F2", // Discord Blurple
        serverId: serverId
      },
      {
        name: "Technical Issue",
        emoji: "🛠️",
        color: "#ED4245", // Discord Red
        serverId: serverId
      },
      {
        name: "Bug Report",
        emoji: "🐛",
        color: "#FEE75C", // Discord Yellow
        serverId: serverId
      },
      {
        name: "Feature Request",
        emoji: "✨",
        color: "#57F287", // Discord Green
        serverId: serverId
      }
    ];

    const createdCategories = await db.insert(ticketCategories)
      .values(defaultCategories)
      .returning();
    
    return createdCategories;
  }

  async deleteTicketCategory(id: number): Promise<boolean> {
    const result = await db.delete(ticketCategories).where(eq(ticketCategories.id, id));
    // Check if any rows were affected (Drizzle returns a result object)
    return true; // Drizzle doesn't provide rowCount easily, so we'll trust the operation
  }

  async deleteTicketCategoriesByServerId(serverId: string): Promise<boolean> {
    const result = await db.delete(ticketCategories).where(eq(ticketCategories.serverId, serverId));
    // Drizzle doesn't return affected row count directly, operation successful if no error thrown
    return true;
  }
  
  // Ticket operations
  async getAllTickets(): Promise<Ticket[]> {
    return await db.select().from(tickets);
  }
  
  async getTicket(id: number): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }
  
  async getTicketsByCreator(creatorId: string): Promise<Ticket[]> {
    return await db.select().from(tickets).where(eq(tickets.creatorId, creatorId));
  }
  
  async getTicketsByServerId(serverId: string): Promise<Ticket[]> {
    return await db.select().from(tickets).where(eq(tickets.serverId, serverId));
  }
  
  async getTicketsByCategory(categoryId: number): Promise<Ticket[]> {
    return await db.select().from(tickets).where(eq(tickets.categoryId, categoryId));
  }
  
  async getTicketsByStatus(status: string): Promise<Ticket[]> {
    return await db.select().from(tickets).where(eq(tickets.status, status));
  }
  
  async createTicket(ticket: InsertTicket): Promise<Ticket> {
    const now = new Date();
    const [newTicket] = await db.insert(tickets).values({
      ...ticket,
      serverId: ticket.serverId || null,
      createdAt: now,
      updatedAt: now
    }).returning();
    return newTicket;
  }
  
  async updateTicket(id: number, updates: Partial<InsertTicket>): Promise<Ticket | undefined> {
    const [updatedTicket] = await db
      .update(tickets)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(tickets.id, id))
      .returning();
    return updatedTicket;
  }

  async deleteTicket(id: number): Promise<boolean> {
    const ticket = await this.getTicket(id);
    if (!ticket) return false;

    await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, id));
    await db.delete(ticketResolutions).where(eq(ticketResolutions.ticketId, id));
    await db.delete(ticketAuditLog).where(eq(ticketAuditLog.ticketId, id));
    await db.delete(tickets).where(eq(tickets.id, id));
    
    return true;
  }
  
  // Ticket message operations
  async getTicketMessages(ticketId: number): Promise<TicketMessage[]> {
    return await db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);
  }
  
  async createTicketMessage(message: InsertTicketMessage): Promise<TicketMessage> {
    // Query the Discord user to get their username
    let senderUsername = null;
    
    try {
      const [discordUser] = await db
        .select()
        .from(discordUsers)
        .where(eq(discordUsers.id, message.senderId));
      
      if (discordUser) {
        senderUsername = discordUser.username;
      }
    } catch (error) {
      console.error("Error fetching user for message:", error);
    }
    
    const [newMessage] = await db.insert(ticketMessages).values({
      ...message,
      senderUsername,
      createdAt: new Date()
    }).returning();
    
    // Update the ticket's last update time
    if (message.ticketId) {
      await db
        .update(tickets)
        .set({ updatedAt: new Date() })
        .where(eq(tickets.id, message.ticketId));
    }
    
    return newMessage;
  }
  
  // Ticket panel settings operations
  async getTicketPanelSettings(serverId: string): Promise<TicketPanelSettings | undefined> {
    const [settings] = await db
      .select()
      .from(ticketPanelSettings)
      .where(eq(ticketPanelSettings.serverId, serverId));
    return settings;
  }

  async createTicketPanelSettings(settings: InsertTicketPanelSettings): Promise<TicketPanelSettings> {
    const now = new Date();
    const [newSettings] = await db
      .insert(ticketPanelSettings)
      .values({
        ...settings,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return newSettings;
  }

  async updateTicketPanelSettings(serverId: string, updates: UpdateTicketPanelSettings): Promise<TicketPanelSettings | undefined> {
    const [updatedSettings] = await db
      .update(ticketPanelSettings)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(ticketPanelSettings.serverId, serverId))
      .returning();
    return updatedSettings;
  }

  async resetTicketPanelSettings(serverId: string): Promise<TicketPanelSettings> {
    // Delete existing settings
    await db
      .delete(ticketPanelSettings)
      .where(eq(ticketPanelSettings.serverId, serverId));
    
    // Create default settings
    const defaultSettings: InsertTicketPanelSettings = { serverId };
    const newSettings = await this.createTicketPanelSettings(defaultSettings);
    
    // Also create default categories for this server
    await this.createDefaultTicketPanelCategories(serverId);
    
    return newSettings;
  }

  // Ticket panel categories operations
  async getTicketPanelCategories(serverId: string): Promise<TicketPanelCategory[]> {
    return await db
      .select()
      .from(ticketPanelCategories)
      .where(eq(ticketPanelCategories.serverId, serverId))
      .orderBy(ticketPanelCategories.sortOrder);
  }

  async getTicketPanelCategory(id: number): Promise<TicketPanelCategory | undefined> {
    const [category] = await db
      .select()
      .from(ticketPanelCategories)
      .where(eq(ticketPanelCategories.id, id));
    return category;
  }

  async createTicketPanelCategory(category: InsertTicketPanelCategory): Promise<TicketPanelCategory> {
    // Check category limit
    const existingCategories = await this.getTicketPanelCategories(category.serverId);
    if (existingCategories.length >= 25) {
      throw new Error('Maximum of 25 categories allowed per server');
    }

    const [newCategory] = await db
      .insert(ticketPanelCategories)
      .values({
        ...category,
        customId: category.customId || `createTicket_${category.ticketCategoryId}`
      })
      .returning();
    return newCategory;
  }

  async updateTicketPanelCategory(id: number, updates: UpdateTicketPanelCategory): Promise<TicketPanelCategory | undefined> {
    const [updatedCategory] = await db
      .update(ticketPanelCategories)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(ticketPanelCategories.id, id))
      .returning();
    return updatedCategory;
  }

  async deleteTicketPanelCategory(id: number): Promise<boolean> {
    const result = await db
      .delete(ticketPanelCategories)
      .where(eq(ticketPanelCategories.id, id));
    return true;
  }

  async reorderTicketPanelCategories(serverId: string, categoryOrders: { id: number; sortOrder: number }[]): Promise<TicketPanelCategory[]> {
    // Update sort orders for each category
    for (const order of categoryOrders) {
      const category = await this.getTicketPanelCategory(order.id);
      if (category && category.serverId === serverId) {
        await this.updateTicketPanelCategory(order.id, { sortOrder: order.sortOrder });
      }
    }
    
    // Return the updated categories in sorted order
    return this.getTicketPanelCategories(serverId);
  }

  // Helper method to create default categories
  private async createDefaultTicketPanelCategories(serverId: string): Promise<void> {
    // Fetch existing ticket categories for this server (or global ones if serverId is null/empty)
    const allCategories = await this.getAllTicketCategories();
    const categoriesForServer = allCategories.filter(c => !c.serverId || c.serverId === serverId);

    // Map default categories to existing ones by name matching
    const defaultCategories = [
      { 
        name: "General Support", 
        emoji: "❓", 
        buttonStyle: "Primary" as const,
        description: "General questions and support requests",
        matchNames: ["support", "general", "help"]
      },
      { 
        name: "Bug Reports", 
        emoji: "🐛", 
        buttonStyle: "Danger" as const,
        description: "Report bugs and technical issues",
        matchNames: ["bug", "issue", "problem"]
      },
      { 
        name: "Feature Requests", 
        emoji: "💡", 
        buttonStyle: "Success" as const,
        description: "Suggest new features and improvements",
        matchNames: ["feature", "request", "suggestion"]
      },
      { 
        name: "Account Issues", 
        emoji: "👤", 
        buttonStyle: "Secondary" as const,
        description: "Account-related problems and questions",
        matchNames: ["account", "profile", "user"]
      }
    ];

    for (let i = 0; i < defaultCategories.length; i++) {
      const defaultCat = defaultCategories[i];
      
      // Find matching category ID
      const matchingCategory = categoriesForServer.find(c => 
        defaultCat.matchNames.some(match => c.name.toLowerCase().includes(match))
      );
      
      if (!matchingCategory) continue; // Skip if no match
      
      const categoryData: InsertTicketPanelCategory = {
        serverId,
        ticketCategoryId: matchingCategory.id,
        name: defaultCat.name,
        description: defaultCat.description,
        emoji: defaultCat.emoji,
        buttonStyle: defaultCat.buttonStyle,
        isEnabled: true,
        sortOrder: i
      };
      
      // Create category - customId will be auto-generated in the format createTicket_<id>
      await this.createTicketPanelCategory(categoryData);
    }
  }
  
  // Panel Template operations
  async getPanelTemplates(serverId: string): Promise<PanelTemplate[]> {
    const templates = await db.select()
      .from(panelTemplates)
      .where(eq(panelTemplates.serverId, serverId))
      .orderBy(panelTemplates.createdAt);
    return templates;
  }
  
  async getPanelTemplate(id: number): Promise<PanelTemplate | undefined> {
    const [template] = await db.select()
      .from(panelTemplates)
      .where(eq(panelTemplates.id, id));
    return template;
  }
  
  async createPanelTemplate(template: InsertPanelTemplate): Promise<PanelTemplate> {
    const [newTemplate] = await db.insert(panelTemplates)
      .values({
        ...template,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newTemplate;
  }
  
  async updatePanelTemplate(id: number, updates: UpdatePanelTemplate): Promise<PanelTemplate | undefined> {
    const [updatedTemplate] = await db.update(panelTemplates)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(panelTemplates.id, id))
      .returning();
    return updatedTemplate;
  }
  
  async deletePanelTemplate(id: number): Promise<boolean> {
    await db.delete(panelTemplates)
      .where(eq(panelTemplates.id, id));
    return true;
  }
  
  async incrementTemplateUseCount(id: number): Promise<void> {
    const template = await this.getPanelTemplate(id);
    if (!template) return;
    
    await db.update(panelTemplates)
      .set({
        useCount: (template.useCount || 0) + 1,
        lastUsed: new Date()
      })
      .where(eq(panelTemplates.id, id));
  }
  
  // Panel Template Field operations
  async getPanelTemplateFields(templateId: number): Promise<PanelTemplateField[]> {
    const fields = await db.select()
      .from(panelTemplateFields)
      .where(eq(panelTemplateFields.templateId, templateId))
      .orderBy(panelTemplateFields.sortOrder);
    return fields;
  }
  
  async createPanelTemplateField(field: InsertPanelTemplateField): Promise<PanelTemplateField> {
    const [newField] = await db.insert(panelTemplateFields)
      .values({
        ...field,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newField;
  }
  
  async updatePanelTemplateField(id: number, updates: UpdatePanelTemplateField): Promise<PanelTemplateField | undefined> {
    const [updatedField] = await db.update(panelTemplateFields)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(panelTemplateFields.id, id))
      .returning();
    return updatedField;
  }
  
  async deletePanelTemplateField(id: number): Promise<boolean> {
    await db.delete(panelTemplateFields)
      .where(eq(panelTemplateFields.id, id));
    return true;
  }
  
  // Panel Template Button operations
  async getPanelTemplateButtons(templateId: number): Promise<PanelTemplateButton[]> {
    const buttons = await db.select()
      .from(panelTemplateButtons)
      .where(eq(panelTemplateButtons.templateId, templateId))
      .orderBy(panelTemplateButtons.row, panelTemplateButtons.position);
    return buttons;
  }
  
  async createPanelTemplateButton(button: InsertPanelTemplateButton): Promise<PanelTemplateButton> {
    const [newButton] = await db.insert(panelTemplateButtons)
      .values({
        ...button,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newButton;
  }
  
  async updatePanelTemplateButton(id: number, updates: UpdatePanelTemplateButton): Promise<PanelTemplateButton | undefined> {
    const [updatedButton] = await db.update(panelTemplateButtons)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(panelTemplateButtons.id, id))
      .returning();
    return updatedButton;
  }
  
  async deletePanelTemplateButton(id: number): Promise<boolean> {
    await db.delete(panelTemplateButtons)
      .where(eq(panelTemplateButtons.id, id));
    return true;
  }
  
  // Ticket resolution operations
  async getTicketResolutions(ticketId: number): Promise<TicketResolution[]> {
    return await db.select()
      .from(ticketResolutions)
      .where(eq(ticketResolutions.ticketId, ticketId))
      .orderBy(ticketResolutions.resolvedAt);
  }
  
  async getTicketResolution(id: number): Promise<TicketResolution | undefined> {
    const [resolution] = await db.select()
      .from(ticketResolutions)
      .where(eq(ticketResolutions.id, id));
    return resolution;
  }
  
  async createTicketResolution(resolution: InsertTicketResolution): Promise<TicketResolution> {
    const [newResolution] = await db.insert(ticketResolutions)
      .values(resolution)
      .returning();
    return newResolution;
  }
  
  async updateTicketResolution(id: number, updates: Partial<InsertTicketResolution>): Promise<TicketResolution | undefined> {
    const [updatedResolution] = await db.update(ticketResolutions)
      .set(updates)
      .where(eq(ticketResolutions.id, id))
      .returning();
    return updatedResolution;
  }
  
  async getResolutionsByServer(serverId: string): Promise<TicketResolution[]> {
    return await db.select()
      .from(ticketResolutions)
      .where(eq(ticketResolutions.serverId, serverId))
      .orderBy(ticketResolutions.resolvedAt);
  }
  
  // Ticket audit log operations
  async getTicketAuditLogs(ticketId: number): Promise<TicketAuditLog[]> {
    return await db.select()
      .from(ticketAuditLog)
      .where(eq(ticketAuditLog.ticketId, ticketId))
      .orderBy(ticketAuditLog.createdAt);
  }
  
  async createTicketAuditLog(log: InsertTicketAuditLog): Promise<TicketAuditLog> {
    const [newLog] = await db.insert(ticketAuditLog)
      .values(log)
      .returning();
    return newLog;
  }
  
  async getAuditLogsByServer(serverId: string): Promise<TicketAuditLog[]> {
    return await db.select()
      .from(ticketAuditLog)
      .where(eq(ticketAuditLog.serverId, serverId))
      .orderBy(ticketAuditLog.createdAt);
  }
  
  async getAuditLogsByUser(userId: string): Promise<TicketAuditLog[]> {
    return await db.select()
      .from(ticketAuditLog)
      .where(eq(ticketAuditLog.performedBy, userId))
      .orderBy(ticketAuditLog.createdAt);
  }
  
  // Server role permissions operations
  async getRolePermissions(serverId: string): Promise<ServerRolePermission[]> {
    return await db.select()
      .from(serverRolePermissions)
      .where(eq(serverRolePermissions.serverId, serverId))
      .orderBy(serverRolePermissions.createdAt);
  }
  
  async getRolePermission(id: number): Promise<ServerRolePermission | undefined> {
    const [permission] = await db.select()
      .from(serverRolePermissions)
      .where(eq(serverRolePermissions.id, id));
    return permission;
  }
  
  async addRolePermission(permission: InsertServerRolePermission): Promise<ServerRolePermission> {
    const [newPermission] = await db.insert(serverRolePermissions)
      .values({
        ...permission,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newPermission;
  }
  
  async updateRolePermission(id: number, updates: UpdateServerRolePermission): Promise<ServerRolePermission | undefined> {
    const [updatedPermission] = await db.update(serverRolePermissions)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(serverRolePermissions.id, id))
      .returning();
    return updatedPermission;
  }
  
  async deleteRolePermission(id: number): Promise<boolean> {
    await db.delete(serverRolePermissions)
      .where(eq(serverRolePermissions.id, id));
    return true;
  }
  
  // Thread mappings operations
  async getThreadMapping(threadId: string): Promise<ThreadMapping | null> {
    const [mapping] = await db.select()
      .from(threadMappings)
      .where(eq(threadMappings.threadId, threadId));
    return mapping || null;
  }
  
  async getThreadMappingByTicket(ticketId: number): Promise<ThreadMapping | null> {
    const [mapping] = await db.select()
      .from(threadMappings)
      .where(eq(threadMappings.ticketId, ticketId));
    return mapping || null;
  }
  
  async createThreadMapping(data: InsertThreadMapping): Promise<ThreadMapping> {
    const now = new Date();
    const [newMapping] = await db.insert(threadMappings)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return newMapping;
  }
  
  async updateThreadMapping(threadId: string, data: Partial<ThreadMapping>): Promise<ThreadMapping> {
    const [updatedMapping] = await db.update(threadMappings)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(threadMappings.threadId, threadId))
      .returning();
    
    if (!updatedMapping) {
      throw new Error(`Thread mapping not found for threadId: ${threadId}`);
    }
    
    return updatedMapping;
  }
  
  async deleteThreadMapping(threadId: string): Promise<void> {
    await db.delete(threadMappings)
      .where(eq(threadMappings.threadId, threadId));
  }
  
  async getServerThreadMappings(serverId: string): Promise<ThreadMapping[]> {
    return await db.select()
      .from(threadMappings)
      .where(eq(threadMappings.serverId, serverId))
      .orderBy(threadMappings.createdAt);
  }
  
  // Developer operations
  async getDevelopers(): Promise<Developer[]> {
    return await db.select()
      .from(developers)
      .where(eq(developers.isActive, true))
      .orderBy(developers.addedAt);
  }
  
  async getDeveloper(discordId: string): Promise<Developer | null> {
    const [developer] = await db.select()
      .from(developers)
      .where(eq(developers.discordId, discordId));
    return developer || null;
  }
  
  async addDeveloper(data: InsertDeveloper): Promise<Developer> {
    const [newDeveloper] = await db.insert(developers)
      .values(data)
      .returning();
    return newDeveloper;
  }
  
  async removeDeveloper(discordId: string): Promise<boolean> {
    const [updatedDeveloper] = await db.update(developers)
      .set({ isActive: false })
      .where(eq(developers.discordId, discordId))
      .returning();
    return !!updatedDeveloper;
  }
  
  // Developer audit log operations
  async getDeveloperAuditLogs(developerId?: string): Promise<DeveloperAuditLog[]> {
    if (developerId) {
      return await db.select()
        .from(developerAuditLog)
        .where(eq(developerAuditLog.developerId, developerId))
        .orderBy(developerAuditLog.createdAt);
    }
    return await db.select()
      .from(developerAuditLog)
      .orderBy(developerAuditLog.createdAt);
  }
  
  async createDeveloperAuditLog(log: InsertDeveloperAuditLog): Promise<DeveloperAuditLog> {
    const [newLog] = await db.insert(developerAuditLog)
      .values(log)
      .returning();
    return newLog;
  }
  
  // Stream notification operations
  async getStreamNotificationSettings(serverId: string): Promise<StreamNotificationSettings | null> {
    const [settings] = await db.select()
      .from(streamNotificationSettings)
      .where(eq(streamNotificationSettings.serverId, serverId))
      .limit(1);
    return settings || null;
  }
  
  async createStreamNotificationSettings(settings: InsertStreamNotificationSettings): Promise<StreamNotificationSettings> {
    const [newSettings] = await db.insert(streamNotificationSettings)
      .values(settings)
      .returning();
    return newSettings;
  }
  
  async updateStreamNotificationSettings(
    serverId: string,
    updates: UpdateStreamNotificationSettings
  ): Promise<StreamNotificationSettings | null> {
    const [updated] = await db.update(streamNotificationSettings)
      .set(updates)
      .where(eq(streamNotificationSettings.serverId, serverId))
      .returning();
    return updated || null;
  }
  
  async getStreamTrackedUsers(serverId: string): Promise<StreamTrackedUser[]> {
    return await db.select()
      .from(streamTrackedUsers)
      .where(eq(streamTrackedUsers.serverId, serverId));
  }
  
  async addStreamTrackedUser(user: InsertStreamTrackedUser): Promise<StreamTrackedUser> {
    const [newUser] = await db.insert(streamTrackedUsers)
      .values(user)
      .returning();
    return newUser;
  }
  
  async removeStreamTrackedUser(serverId: string, userId: string): Promise<boolean> {
    const result = await db.delete(streamTrackedUsers)
      .where(
        and(
          eq(streamTrackedUsers.serverId, serverId),
          eq(streamTrackedUsers.userId, userId)
        )
      );
    return result.rowCount ? result.rowCount > 0 : false;
  }
  
  async updateStreamTrackedUser(
    serverId: string,
    userId: string,
    updates: Partial<StreamTrackedUser>
  ): Promise<StreamTrackedUser | null> {
    const [updated] = await db.update(streamTrackedUsers)
      .set(updates)
      .where(
        and(
          eq(streamTrackedUsers.serverId, serverId),
          eq(streamTrackedUsers.userId, userId)
        )
      )
      .returning();
    return updated || null;
  }
  
  async createStreamNotificationLog(log: InsertStreamNotificationLog): Promise<StreamNotificationLog> {
    const [newLog] = await db.insert(streamNotificationLog)
      .values(log)
      .returning();
    return newLog;
  }
  
  async getStreamNotificationLogs(serverId: string, limit: number = 50): Promise<StreamNotificationLog[]> {
    return await db.select()
      .from(streamNotificationLog)
      .where(eq(streamNotificationLog.serverId, serverId))
      .orderBy(streamNotificationLog.notifiedAt)
      .limit(limit);
  }

  async getServersTrackingUser(userId: string): Promise<{ serverId: string; settings: StreamNotificationSettings }[]> {
    const trackedUserRecords = await db.select()
      .from(streamTrackedUsers)
      .where(eq(streamTrackedUsers.userId, userId));
    
    const results: { serverId: string; settings: StreamNotificationSettings }[] = [];
    
    for (const record of trackedUserRecords) {
      const settings = await this.getStreamNotificationSettings(record.serverId);
      if (settings && settings.isEnabled && settings.notificationChannelId) {
        results.push({ serverId: record.serverId, settings });
      }
    }
    
    return results;
  }
  
  // Notification reconciliation operations
  async checkNotificationExists(serverId: string, discordUserId: string, streamId: string): Promise<boolean> {
    if (!streamId) return false;
    
    const { and: andOp } = await import('drizzle-orm');
    const [existing] = await db.select({ id: streamNotificationLog.id })
      .from(streamNotificationLog)
      .where(andOp(
        eq(streamNotificationLog.serverId, serverId),
        eq(streamNotificationLog.discordUserId, discordUserId),
        eq(streamNotificationLog.streamId, streamId)
      ))
      .limit(1);
    
    return !!existing;
  }
  
  async cleanupOldNotificationLogs(daysOld: number = 7): Promise<number> {
    const { lt } = await import('drizzle-orm');
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const result = await db.delete(streamNotificationLog)
      .where(lt(streamNotificationLog.notifiedAt, cutoffDate));
    
    const deletedCount = result.rowCount ?? 0;
    if (deletedCount > 0) {
      console.log(`[Notification Log Cleanup] Deleted ${deletedCount} logs older than ${daysOld} days`);
    }
    return deletedCount;
  }
  
  // Interaction lock operations (deduplication)
  async createInteractionLock(interactionId: string, userId: string, actionType: string): Promise<boolean> {
    try {
      await db.insert(interactionLocks).values({
        interactionId,
        userId,
        actionType,
        createdAt: new Date(),
      });
      return true;
    } catch (error: any) {
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique constraint')) {
        return false;
      }
      throw error;
    }
  }
  
  async cleanupOldInteractionLocks(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { lt } = await import('drizzle-orm');
    await db.delete(interactionLocks).where(
      lt(interactionLocks.createdAt, fiveMinutesAgo)
    );
  }

  // SLA Configuration operations
  async getSlaConfigurations(serverId: string): Promise<SlaConfiguration[]> {
    return await db.select()
      .from(slaConfigurations)
      .where(eq(slaConfigurations.serverId, serverId));
  }

  async getSlaConfigurationByPriority(serverId: string, priority: string): Promise<SlaConfiguration | null> {
    const [config] = await db.select()
      .from(slaConfigurations)
      .where(and(
        eq(slaConfigurations.serverId, serverId),
        eq(slaConfigurations.priority, priority)
      ))
      .limit(1);
    return config || null;
  }

  async createSlaConfiguration(config: InsertSlaConfiguration): Promise<SlaConfiguration> {
    const [newConfig] = await db.insert(slaConfigurations)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateSlaConfiguration(id: number, updates: UpdateSlaConfiguration): Promise<SlaConfiguration | null> {
    const [updated] = await db.update(slaConfigurations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(slaConfigurations.id, id))
      .returning();
    return updated || null;
  }

  async deleteSlaConfiguration(id: number): Promise<boolean> {
    const result = await db.delete(slaConfigurations)
      .where(eq(slaConfigurations.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // SLA Tracking operations
  async getSlaTracking(ticketId: number): Promise<SlaTracking | null> {
    const [tracking] = await db.select()
      .from(slaTracking)
      .where(eq(slaTracking.ticketId, ticketId))
      .limit(1);
    return tracking || null;
  }

  async getSlaTrackingByServer(serverId: string): Promise<SlaTracking[]> {
    return await db.select()
      .from(slaTracking)
      .where(eq(slaTracking.serverId, serverId));
  }

  async getActiveSlasApproachingBreach(): Promise<SlaTracking[]> {
    const { lt, or, isNull } = await import('drizzle-orm');
    const now = new Date();
    return await db.select()
      .from(slaTracking)
      .where(and(
        eq(slaTracking.status, 'active'),
        or(
          lt(slaTracking.responseDeadline, now),
          lt(slaTracking.resolutionDeadline, now)
        )
      ));
  }

  async createSlaTracking(tracking: InsertSlaTracking): Promise<SlaTracking> {
    const [newTracking] = await db.insert(slaTracking)
      .values(tracking)
      .returning();
    return newTracking;
  }

  async updateSlaTracking(ticketId: number, updates: Partial<SlaTracking>): Promise<SlaTracking | null> {
    const [updated] = await db.update(slaTracking)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(slaTracking.ticketId, ticketId))
      .returning();
    return updated || null;
  }

  // Escalation Rules operations
  async getEscalationRules(serverId: string): Promise<EscalationRule[]> {
    const { desc } = await import('drizzle-orm');
    return await db.select()
      .from(escalationRules)
      .where(eq(escalationRules.serverId, serverId))
      .orderBy(desc(escalationRules.priority));
  }

  async getEscalationRulesByType(serverId: string, triggerType: string): Promise<EscalationRule[]> {
    return await db.select()
      .from(escalationRules)
      .where(and(
        eq(escalationRules.serverId, serverId),
        eq(escalationRules.triggerType, triggerType),
        eq(escalationRules.isEnabled, true)
      ));
  }

  async createEscalationRule(rule: InsertEscalationRule): Promise<EscalationRule> {
    const [newRule] = await db.insert(escalationRules)
      .values(rule)
      .returning();
    return newRule;
  }

  async updateEscalationRule(id: number, updates: UpdateEscalationRule): Promise<EscalationRule | null> {
    const [updated] = await db.update(escalationRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(escalationRules.id, id))
      .returning();
    return updated || null;
  }

  async deleteEscalationRule(id: number): Promise<boolean> {
    const result = await db.delete(escalationRules)
      .where(eq(escalationRules.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Escalation History operations
  async getEscalationHistory(ticketId: number): Promise<EscalationHistory[]> {
    const { desc } = await import('drizzle-orm');
    return await db.select()
      .from(escalationHistory)
      .where(eq(escalationHistory.ticketId, ticketId))
      .orderBy(desc(escalationHistory.createdAt));
  }

  async getEscalationHistoryByServer(serverId: string, limit: number = 50): Promise<EscalationHistory[]> {
    const { desc } = await import('drizzle-orm');
    return await db.select()
      .from(escalationHistory)
      .where(eq(escalationHistory.serverId, serverId))
      .orderBy(desc(escalationHistory.createdAt))
      .limit(limit);
  }

  async createEscalationHistory(history: InsertEscalationHistory): Promise<EscalationHistory> {
    const [newHistory] = await db.insert(escalationHistory)
      .values(history)
      .returning();
    return newHistory;
  }

  // Webhook Configuration operations
  async getWebhookConfigurations(serverId: string): Promise<WebhookConfiguration[]> {
    return await db.select()
      .from(webhookConfigurations)
      .where(eq(webhookConfigurations.serverId, serverId));
  }

  async getWebhookConfigurationById(id: number): Promise<WebhookConfiguration | null> {
    const [config] = await db.select()
      .from(webhookConfigurations)
      .where(eq(webhookConfigurations.id, id))
      .limit(1);
    return config || null;
  }

  async getInboundWebhookBySecret(secret: string): Promise<WebhookConfiguration | null> {
    const [config] = await db.select()
      .from(webhookConfigurations)
      .where(and(
        eq(webhookConfigurations.webhookSecret, secret),
        eq(webhookConfigurations.isInbound, true),
        eq(webhookConfigurations.isEnabled, true)
      ))
      .limit(1);
    return config || null;
  }

  async createWebhookConfiguration(config: InsertWebhookConfiguration): Promise<WebhookConfiguration> {
    const [newConfig] = await db.insert(webhookConfigurations)
      .values(config)
      .returning();
    return newConfig;
  }

  async updateWebhookConfiguration(id: number, updates: UpdateWebhookConfiguration): Promise<WebhookConfiguration | null> {
    const [updated] = await db.update(webhookConfigurations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(webhookConfigurations.id, id))
      .returning();
    return updated || null;
  }

  async deleteWebhookConfiguration(id: number): Promise<boolean> {
    const result = await db.delete(webhookConfigurations)
      .where(eq(webhookConfigurations.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async incrementWebhookFailureCount(id: number): Promise<void> {
    const config = await this.getWebhookConfigurationById(id);
    if (config) {
      await db.update(webhookConfigurations)
        .set({ failureCount: (config.failureCount || 0) + 1, updatedAt: new Date() })
        .where(eq(webhookConfigurations.id, id));
    }
  }

  async resetWebhookFailureCount(id: number): Promise<void> {
    await db.update(webhookConfigurations)
      .set({ failureCount: 0, lastTriggeredAt: new Date(), updatedAt: new Date() })
      .where(eq(webhookConfigurations.id, id));
  }

  // Webhook Event Log operations
  async createWebhookEventLog(log: InsertWebhookEventLog): Promise<WebhookEventLog> {
    const [newLog] = await db.insert(webhookEventLog)
      .values(log)
      .returning();
    return newLog;
  }

  async getWebhookEventLogs(webhookId: number, limit: number = 50): Promise<WebhookEventLog[]> {
    const { desc } = await import('drizzle-orm');
    return await db.select()
      .from(webhookEventLog)
      .where(eq(webhookEventLog.webhookId, webhookId))
      .orderBy(desc(webhookEventLog.processedAt))
      .limit(limit);
  }

  // Guild Provisioning operations
  async getGuildProvisioningStatus(serverId: string): Promise<GuildProvisioningStatus | null> {
    const [status] = await db.select()
      .from(guildProvisioningStatus)
      .where(eq(guildProvisioningStatus.serverId, serverId))
      .limit(1);
    return status || null;
  }

  async createGuildProvisioningStatus(status: InsertGuildProvisioningStatus): Promise<GuildProvisioningStatus> {
    const [newStatus] = await db.insert(guildProvisioningStatus)
      .values(status)
      .returning();
    return newStatus;
  }

  async updateGuildProvisioningStatus(serverId: string, updates: Partial<GuildProvisioningStatus>): Promise<GuildProvisioningStatus | null> {
    const [updated] = await db.update(guildProvisioningStatus)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(guildProvisioningStatus.serverId, serverId))
      .returning();
    return updated || null;
  }

  // Database health check for probes
  async checkDatabaseHealth(): Promise<{ connected: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await db.execute('SELECT 1');
      return { connected: true, latencyMs: Date.now() - start };
    } catch (error) {
      return { connected: false, latencyMs: Date.now() - start };
    }
  }

  // Starboard operations
  async getStarredMessage(serverId: string, originalMessageId: string): Promise<StarredMessage | null> {
    const [message] = await db.select()
      .from(starredMessages)
      .where(and(
        eq(starredMessages.serverId, serverId),
        eq(starredMessages.originalMessageId, originalMessageId)
      ))
      .limit(1);
    return message || null;
  }

  async createStarredMessage(message: InsertStarredMessage): Promise<StarredMessage> {
    const [newMessage] = await db.insert(starredMessages)
      .values({
        ...message,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newMessage;
  }

  async updateStarredMessageCount(serverId: string, originalMessageId: string, starCount: number): Promise<StarredMessage | null> {
    const [updated] = await db.update(starredMessages)
      .set({ starCount, updatedAt: new Date() })
      .where(and(
        eq(starredMessages.serverId, serverId),
        eq(starredMessages.originalMessageId, originalMessageId)
      ))
      .returning();
    return updated || null;
  }

  async deleteStarredMessage(serverId: string, originalMessageId: string): Promise<boolean> {
    const result = await db.delete(starredMessages)
      .where(and(
        eq(starredMessages.serverId, serverId),
        eq(starredMessages.originalMessageId, originalMessageId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // XP/Leveling operations
  async getXpData(serverId: string, userId: string): Promise<XpData | null> {
    const [data] = await db.select()
      .from(xpData)
      .where(and(
        eq(xpData.serverId, serverId),
        eq(xpData.userId, userId)
      ))
      .limit(1);
    return data || null;
  }

  async createXpData(data: InsertXpData): Promise<XpData> {
    const [newData] = await db.insert(xpData)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newData;
  }

  async updateXpData(serverId: string, userId: string, updates: UpdateXpData): Promise<XpData | null> {
    const [updated] = await db.update(xpData)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(xpData.serverId, serverId),
        eq(xpData.userId, userId)
      ))
      .returning();
    return updated || null;
  }

  async getServerLeaderboard(serverId: string, limit: number = 10, offset: number = 0): Promise<XpData[]> {
    const { desc } = await import('drizzle-orm');
    return await db.select()
      .from(xpData)
      .where(eq(xpData.serverId, serverId))
      .orderBy(desc(xpData.xp))
      .limit(limit)
      .offset(offset);
  }

  async getServerLeaderboardCount(serverId: string): Promise<number> {
    const { count } = await import('drizzle-orm');
    const [result] = await db.select({ count: count() })
      .from(xpData)
      .where(eq(xpData.serverId, serverId));
    return result?.count || 0;
  }

  async getUserRank(serverId: string, userId: string): Promise<number> {
    const { gt, count } = await import('drizzle-orm');
    const userData = await this.getXpData(serverId, userId);
    if (!userData) return 0;
    
    const [result] = await db.select({ count: count() })
      .from(xpData)
      .where(and(
        eq(xpData.serverId, serverId),
        gt(xpData.xp, userData.xp)
      ));
    
    return (result?.count || 0) + 1;
  }

  // Level Rewards operations
  async getLevelRewards(serverId: string): Promise<LevelReward[]> {
    return await db.select()
      .from(levelRewards)
      .where(eq(levelRewards.serverId, serverId));
  }

  async getLevelReward(serverId: string, level: number): Promise<LevelReward | null> {
    const [reward] = await db.select()
      .from(levelRewards)
      .where(and(
        eq(levelRewards.serverId, serverId),
        eq(levelRewards.level, level)
      ))
      .limit(1);
    return reward || null;
  }

  async createLevelReward(data: InsertLevelReward): Promise<LevelReward> {
    const [newReward] = await db.insert(levelRewards)
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();
    return newReward;
  }

  async deleteLevelReward(serverId: string, level: number): Promise<boolean> {
    const result = await db.delete(levelRewards)
      .where(and(
        eq(levelRewards.serverId, serverId),
        eq(levelRewards.level, level)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Reaction Role operations
  async getReactionRoles(serverId: string): Promise<ReactionRole[]> {
    return await db.select()
      .from(reactionRoles)
      .where(eq(reactionRoles.serverId, serverId));
  }

  async getReactionRole(serverId: string, messageId: string, emoji: string): Promise<ReactionRole | null> {
    const [role] = await db.select()
      .from(reactionRoles)
      .where(and(
        eq(reactionRoles.serverId, serverId),
        eq(reactionRoles.messageId, messageId),
        eq(reactionRoles.emoji, emoji)
      ))
      .limit(1);
    return role || null;
  }

  async createReactionRole(data: InsertReactionRole): Promise<ReactionRole> {
    const [newRole] = await db.insert(reactionRoles)
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();
    return newRole;
  }

  async deleteReactionRole(serverId: string, messageId: string, emoji: string): Promise<boolean> {
    const result = await db.delete(reactionRoles)
      .where(and(
        eq(reactionRoles.serverId, serverId),
        eq(reactionRoles.messageId, messageId),
        eq(reactionRoles.emoji, emoji)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // AFK operations
  async getAfkUser(serverId: string, userId: string): Promise<AfkUser | null> {
    const [user] = await db.select()
      .from(afkUsers)
      .where(and(
        eq(afkUsers.serverId, serverId),
        eq(afkUsers.userId, userId)
      ))
      .limit(1);
    return user || null;
  }

  async setAfkUser(data: InsertAfkUser): Promise<AfkUser> {
    await db.delete(afkUsers)
      .where(and(
        eq(afkUsers.serverId, data.serverId),
        eq(afkUsers.userId, data.userId)
      ));
    
    const [newAfk] = await db.insert(afkUsers)
      .values({
        ...data,
        afkSince: new Date()
      })
      .returning();
    return newAfk;
  }

  async removeAfkUser(serverId: string, userId: string): Promise<boolean> {
    const result = await db.delete(afkUsers)
      .where(and(
        eq(afkUsers.serverId, serverId),
        eq(afkUsers.userId, userId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Giveaway operations
  async getActiveGiveaways(serverId: string): Promise<DiscordGiveaway[]> {
    return await db.select()
      .from(discordGiveaways)
      .where(and(
        eq(discordGiveaways.serverId, serverId),
        eq(discordGiveaways.ended, false)
      ));
  }

  async getGiveaway(id: number): Promise<DiscordGiveaway | null> {
    const [giveaway] = await db.select()
      .from(discordGiveaways)
      .where(eq(discordGiveaways.id, id))
      .limit(1);
    return giveaway || null;
  }

  async getGiveawayByMessage(messageId: string): Promise<DiscordGiveaway | null> {
    const [giveaway] = await db.select()
      .from(discordGiveaways)
      .where(eq(discordGiveaways.messageId, messageId))
      .limit(1);
    return giveaway || null;
  }

  async getEndedGiveaways(): Promise<DiscordGiveaway[]> {
    const { lte } = await import('drizzle-orm');
    return await db.select()
      .from(discordGiveaways)
      .where(and(
        eq(discordGiveaways.ended, false),
        lte(discordGiveaways.endTime, new Date())
      ));
  }

  async createGiveaway(data: InsertDiscordGiveaway): Promise<DiscordGiveaway> {
    const [newGiveaway] = await db.insert(discordGiveaways)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newGiveaway;
  }

  async updateGiveaway(id: number, updates: UpdateDiscordGiveaway): Promise<DiscordGiveaway | null> {
    const [updated] = await db.update(discordGiveaways)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(discordGiveaways.id, id))
      .returning();
    return updated || null;
  }

  async endGiveaway(id: number, winners: string[]): Promise<DiscordGiveaway | null> {
    const [updated] = await db.update(discordGiveaways)
      .set({
        ended: true,
        winners: JSON.stringify(winners),
        updatedAt: new Date()
      })
      .where(eq(discordGiveaways.id, id))
      .returning();
    return updated || null;
  }

  // Suggestion operations
  async getSuggestion(id: number): Promise<Suggestion | null> {
    const [suggestion] = await db.select()
      .from(suggestions)
      .where(eq(suggestions.id, id))
      .limit(1);
    return suggestion || null;
  }

  async getSuggestionByMessage(messageId: string): Promise<Suggestion | null> {
    const [suggestion] = await db.select()
      .from(suggestions)
      .where(eq(suggestions.messageId, messageId))
      .limit(1);
    return suggestion || null;
  }

  async getSuggestionsByServer(serverId: string): Promise<Suggestion[]> {
    return await db.select()
      .from(suggestions)
      .where(eq(suggestions.serverId, serverId));
  }

  async getSuggestionsByAuthor(serverId: string, authorId: string): Promise<Suggestion[]> {
    return await db.select()
      .from(suggestions)
      .where(and(
        eq(suggestions.serverId, serverId),
        eq(suggestions.authorId, authorId)
      ));
  }

  async createSuggestion(data: InsertSuggestion): Promise<Suggestion> {
    const [newSuggestion] = await db.insert(suggestions)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newSuggestion;
  }

  async updateSuggestion(id: number, updates: UpdateSuggestion): Promise<Suggestion | null> {
    const [updated] = await db.update(suggestions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(suggestions.id, id))
      .returning();
    return updated || null;
  }

  async deleteSuggestion(id: number): Promise<boolean> {
    const result = await db.delete(suggestions)
      .where(eq(suggestions.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Birthday operations
  async getBirthday(serverId: string, userId: string): Promise<Birthday | null> {
    const [birthday] = await db.select()
      .from(birthdays)
      .where(and(
        eq(birthdays.serverId, serverId),
        eq(birthdays.userId, userId)
      ))
      .limit(1);
    return birthday || null;
  }

  async getBirthdaysByServer(serverId: string): Promise<Birthday[]> {
    return await db.select()
      .from(birthdays)
      .where(eq(birthdays.serverId, serverId));
  }

  async getBirthdaysForDate(month: number, day: number): Promise<Birthday[]> {
    return await db.select()
      .from(birthdays)
      .where(and(
        eq(birthdays.birthMonth, month),
        eq(birthdays.birthDay, day)
      ));
  }

  async createBirthday(data: InsertBirthday): Promise<Birthday> {
    const existing = await this.getBirthday(data.serverId, data.userId);
    if (existing) {
      const [updated] = await db.update(birthdays)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(birthdays.serverId, data.serverId),
          eq(birthdays.userId, data.userId)
        ))
        .returning();
      return updated;
    }
    const [newBirthday] = await db.insert(birthdays)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newBirthday;
  }

  async updateBirthday(serverId: string, userId: string, updates: UpdateBirthday): Promise<Birthday | null> {
    const [updated] = await db.update(birthdays)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(birthdays.serverId, serverId),
        eq(birthdays.userId, userId)
      ))
      .returning();
    return updated || null;
  }

  async deleteBirthday(serverId: string, userId: string): Promise<boolean> {
    const result = await db.delete(birthdays)
      .where(and(
        eq(birthdays.serverId, serverId),
        eq(birthdays.userId, userId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Invite Tracker operations
  async getInvitesByInviter(serverId: string, inviterId: string): Promise<InviteTracker[]> {
    return await db.select()
      .from(inviteTracker)
      .where(and(
        eq(inviteTracker.serverId, serverId),
        eq(inviteTracker.inviterId, inviterId)
      ));
  }

  async getInvitesByServer(serverId: string): Promise<InviteTracker[]> {
    return await db.select()
      .from(inviteTracker)
      .where(eq(inviteTracker.serverId, serverId));
  }

  async getInviteLeaderboard(serverId: string, limit: number): Promise<{ inviterId: string; inviterUsername: string | null; count: number }[]> {
    const allInvites = await this.getInvitesByServer(serverId);
    const inviteCounts = new Map<string, { count: number; username: string | null }>();
    
    for (const invite of allInvites) {
      const existing = inviteCounts.get(invite.inviterId);
      if (existing) {
        existing.count++;
      } else {
        inviteCounts.set(invite.inviterId, { count: 1, username: invite.inviterUsername });
      }
    }
    
    return Array.from(inviteCounts.entries())
      .map(([inviterId, data]) => ({
        inviterId,
        inviterUsername: data.username,
        count: data.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async createInviteRecord(data: InsertInviteTracker): Promise<InviteTracker> {
    const [newRecord] = await db.insert(inviteTracker)
      .values({
        ...data,
        joinedAt: new Date()
      })
      .returning();
    return newRecord;
  }

  // Scheduled Messages operations
  async getScheduledMessages(serverId: string): Promise<ScheduledMessage[]> {
    return await db.select()
      .from(scheduledMessages)
      .where(eq(scheduledMessages.serverId, serverId));
  }

  async getScheduledMessage(id: number): Promise<ScheduledMessage | null> {
    const [message] = await db.select()
      .from(scheduledMessages)
      .where(eq(scheduledMessages.id, id))
      .limit(1);
    return message || null;
  }

  async getDueScheduledMessages(): Promise<ScheduledMessage[]> {
    const now = new Date();
    return await db.select()
      .from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.isActive, true),
        lte(scheduledMessages.nextRunAt, now)
      ));
  }

  async createScheduledMessage(data: InsertScheduledMessage): Promise<ScheduledMessage> {
    const [newMessage] = await db.insert(scheduledMessages)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newMessage;
  }

  async updateScheduledMessage(id: number, updates: UpdateScheduledMessage): Promise<ScheduledMessage | null> {
    const [updated] = await db.update(scheduledMessages)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scheduledMessages.id, id))
      .returning();
    return updated || null;
  }

  async deleteScheduledMessage(id: number): Promise<boolean> {
    const result = await db.delete(scheduledMessages)
      .where(eq(scheduledMessages.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Custom Commands operations
  async getCustomCommands(serverId: string): Promise<CustomCommand[]> {
    return await db.select()
      .from(customCommands)
      .where(eq(customCommands.serverId, serverId));
  }

  async getCustomCommand(serverId: string, trigger: string): Promise<CustomCommand | null> {
    const [command] = await db.select()
      .from(customCommands)
      .where(and(
        eq(customCommands.serverId, serverId),
        eq(customCommands.trigger, trigger.toLowerCase())
      ))
      .limit(1);
    return command || null;
  }

  async createCustomCommand(data: InsertCustomCommand): Promise<CustomCommand> {
    const [newCommand] = await db.insert(customCommands)
      .values({
        ...data,
        trigger: data.trigger.toLowerCase(),
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newCommand;
  }

  async updateCustomCommand(serverId: string, trigger: string, updates: UpdateCustomCommand): Promise<CustomCommand | null> {
    const [updated] = await db.update(customCommands)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(customCommands.serverId, serverId),
        eq(customCommands.trigger, trigger.toLowerCase())
      ))
      .returning();
    return updated || null;
  }

  async deleteCustomCommand(serverId: string, trigger: string): Promise<boolean> {
    const result = await db.delete(customCommands)
      .where(and(
        eq(customCommands.serverId, serverId),
        eq(customCommands.trigger, trigger.toLowerCase())
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async incrementCustomCommandUsage(serverId: string, trigger: string): Promise<void> {
    const cmd = await this.getCustomCommand(serverId, trigger);
    if (cmd) {
      await db.update(customCommands)
        .set({ usageCount: cmd.usageCount + 1, updatedAt: new Date() })
        .where(and(
          eq(customCommands.serverId, serverId),
          eq(customCommands.trigger, trigger.toLowerCase())
        ));
    }
  }

  // Command Triggers operations
  async getCommandTriggers(commandId: number): Promise<CommandTrigger[]> {
    return await db.select()
      .from(commandTriggers)
      .where(eq(commandTriggers.commandId, commandId));
  }

  async getCommandTriggersByServer(serverId: string): Promise<CommandTrigger[]> {
    const commands = await this.getCustomCommands(serverId);
    const commandIds = commands.map(c => c.id);
    
    if (commandIds.length === 0) return [];
    
    const triggers: CommandTrigger[] = [];
    for (const commandId of commandIds) {
      const cmdTriggers = await this.getCommandTriggers(commandId);
      triggers.push(...cmdTriggers);
    }
    return triggers;
  }

  async createCommandTrigger(data: InsertCommandTrigger): Promise<CommandTrigger> {
    const [trigger] = await db.insert(commandTriggers)
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();
    return trigger;
  }

  async deleteCommandTrigger(id: number): Promise<boolean> {
    const result = await db.delete(commandTriggers)
      .where(eq(commandTriggers.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteCommandTriggersByCommand(commandId: number): Promise<boolean> {
    const result = await db.delete(commandTriggers)
      .where(eq(commandTriggers.commandId, commandId));
    return result.rowCount ? result.rowCount >= 0 : true;
  }

  // User Embeds operations
  async getUserEmbed(userId: string, serverId: string): Promise<UserEmbed | null> {
    const [embed] = await db.select()
      .from(userEmbeds)
      .where(and(
        eq(userEmbeds.userId, userId),
        eq(userEmbeds.serverId, serverId)
      ))
      .limit(1);
    return embed || null;
  }

  async createOrUpdateUserEmbed(data: InsertUserEmbed): Promise<UserEmbed> {
    const existing = await this.getUserEmbed(data.userId, data.serverId);
    if (existing) {
      const [updated] = await db.update(userEmbeds)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(userEmbeds.userId, data.userId),
          eq(userEmbeds.serverId, data.serverId)
        ))
        .returning();
      return updated;
    }
    const [newEmbed] = await db.insert(userEmbeds)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newEmbed;
  }

  async deleteUserEmbed(userId: string, serverId: string): Promise<boolean> {
    const result = await db.delete(userEmbeds)
      .where(and(
        eq(userEmbeds.userId, userId),
        eq(userEmbeds.serverId, serverId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Media Request operations
  async getMediaRequest(id: number): Promise<MediaRequest | null> {
    const [request] = await db.select()
      .from(mediaRequests)
      .where(eq(mediaRequests.id, id))
      .limit(1);
    return request || null;
  }

  async getMediaRequestsByServer(serverId: string, status?: string): Promise<MediaRequest[]> {
    if (status) {
      return await db.select()
        .from(mediaRequests)
        .where(and(
          eq(mediaRequests.serverId, serverId),
          eq(mediaRequests.status, status)
        ))
        .orderBy(mediaRequests.createdAt);
    }
    return await db.select()
      .from(mediaRequests)
      .where(eq(mediaRequests.serverId, serverId))
      .orderBy(mediaRequests.createdAt);
  }

  async getMediaRequestsByUser(serverId: string, userId: string): Promise<MediaRequest[]> {
    return await db.select()
      .from(mediaRequests)
      .where(and(
        eq(mediaRequests.serverId, serverId),
        eq(mediaRequests.userId, userId)
      ))
      .orderBy(mediaRequests.createdAt);
  }

  async getPendingMediaRequests(serverId: string): Promise<MediaRequest[]> {
    return await db.select()
      .from(mediaRequests)
      .where(and(
        eq(mediaRequests.serverId, serverId),
        eq(mediaRequests.status, 'pending')
      ))
      .orderBy(mediaRequests.createdAt);
  }

  async createMediaRequest(data: InsertMediaRequest): Promise<MediaRequest> {
    const [newRequest] = await db.insert(mediaRequests)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newRequest;
  }

  async updateMediaRequest(id: number, updates: UpdateMediaRequest): Promise<MediaRequest | null> {
    const [updated] = await db.update(mediaRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mediaRequests.id, id))
      .returning();
    return updated || null;
  }

  async approveMediaRequest(id: number, approvedBy: string, approvedByUsername: string): Promise<MediaRequest | null> {
    const [updated] = await db.update(mediaRequests)
      .set({
        status: 'approved',
        approvedBy,
        approvedByUsername,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(mediaRequests.id, id))
      .returning();
    return updated || null;
  }

  async denyMediaRequest(id: number, approvedBy: string, approvedByUsername: string, reason?: string): Promise<MediaRequest | null> {
    const [updated] = await db.update(mediaRequests)
      .set({
        status: 'denied',
        approvedBy,
        approvedByUsername,
        reason: reason || null,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(mediaRequests.id, id))
      .returning();
    return updated || null;
  }

  async markMediaRequestDownloaded(id: number, downloadedBy: string, downloadedByUsername: string): Promise<MediaRequest | null> {
    const [updated] = await db.update(mediaRequests)
      .set({
        status: 'downloaded',
        approvedBy: downloadedBy,
        approvedByUsername: downloadedByUsername,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(mediaRequests.id, id))
      .returning();
    return updated || null;
  }

  async deleteMediaRequest(id: number): Promise<boolean> {
    const result = await db.delete(mediaRequests)
      .where(eq(mediaRequests.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Custom Command by ID operations
  async getCustomCommandById(id: number): Promise<CustomCommand | null> {
    const [command] = await db.select()
      .from(customCommands)
      .where(eq(customCommands.id, id))
      .limit(1);
    return command || null;
  }

  async updateCustomCommandById(id: number, updates: UpdateCustomCommand): Promise<CustomCommand | null> {
    const [updated] = await db.update(customCommands)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customCommands.id, id))
      .returning();
    return updated || null;
  }

  async deleteCustomCommandById(id: number): Promise<boolean> {
    const result = await db.delete(customCommands)
      .where(eq(customCommands.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Command Variable operations
  async getCommandVariables(serverId: string): Promise<CommandVariable[]> {
    return await db.select()
      .from(commandVariables)
      .where(eq(commandVariables.serverId, serverId));
  }

  async getCommandVariable(id: number): Promise<CommandVariable | null> {
    const [variable] = await db.select()
      .from(commandVariables)
      .where(eq(commandVariables.id, id))
      .limit(1);
    return variable || null;
  }

  async createCommandVariable(data: InsertCommandVariable): Promise<CommandVariable> {
    const [newVariable] = await db.insert(commandVariables)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newVariable;
  }

  async updateCommandVariable(id: number, updates: Partial<InsertCommandVariable>): Promise<CommandVariable | null> {
    const [updated] = await db.update(commandVariables)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(commandVariables.id, id))
      .returning();
    return updated || null;
  }

  async deleteCommandVariable(id: number): Promise<boolean> {
    const result = await db.delete(commandVariables)
      .where(eq(commandVariables.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================
  // INTERACTION STUDIO - Workflow Automation Storage
  // ============================================================

  // Workflow CRUD operations
  async getWorkflowsByServerId(serverId: string): Promise<AutomationWorkflow[]> {
    return await db.select()
      .from(automationWorkflows)
      .where(eq(automationWorkflows.serverId, serverId))
      .orderBy(desc(automationWorkflows.createdAt));
  }

  async getWorkflow(id: number): Promise<AutomationWorkflow | undefined> {
    const [workflow] = await db.select()
      .from(automationWorkflows)
      .where(eq(automationWorkflows.id, id));
    return workflow;
  }

  async createWorkflow(data: InsertAutomationWorkflow): Promise<AutomationWorkflow> {
    const [newWorkflow] = await db.insert(automationWorkflows)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newWorkflow;
  }

  async updateWorkflow(id: number, data: Partial<InsertAutomationWorkflow>): Promise<AutomationWorkflow> {
    const [updated] = await db.update(automationWorkflows)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(automationWorkflows.id, id))
      .returning();
    return updated;
  }

  async deleteWorkflow(id: number): Promise<void> {
    await db.delete(workflowConditions).where(eq(workflowConditions.workflowId, id));
    await db.delete(workflowActions).where(eq(workflowActions.workflowId, id));
    await db.delete(workflowCooldowns).where(eq(workflowCooldowns.workflowId, id));
    await db.delete(automationWorkflows).where(eq(automationWorkflows.id, id));
  }

  // Workflow Conditions operations
  async getWorkflowConditions(workflowId: number): Promise<WorkflowCondition[]> {
    return await db.select()
      .from(workflowConditions)
      .where(eq(workflowConditions.workflowId, workflowId))
      .orderBy(workflowConditions.sortOrder);
  }

  async createWorkflowCondition(data: InsertWorkflowCondition): Promise<WorkflowCondition> {
    const [newCondition] = await db.insert(workflowConditions)
      .values(data)
      .returning();
    return newCondition;
  }

  async updateWorkflowCondition(id: number, data: Partial<InsertWorkflowCondition>): Promise<WorkflowCondition> {
    const [updated] = await db.update(workflowConditions)
      .set(data)
      .where(eq(workflowConditions.id, id))
      .returning();
    return updated;
  }

  async deleteWorkflowCondition(id: number): Promise<void> {
    await db.delete(workflowConditions).where(eq(workflowConditions.id, id));
  }

  async deleteWorkflowConditionsByWorkflowId(workflowId: number): Promise<void> {
    await db.delete(workflowConditions).where(eq(workflowConditions.workflowId, workflowId));
  }

  // Workflow Actions operations
  async getWorkflowActions(workflowId: number): Promise<WorkflowAction[]> {
    return await db.select()
      .from(workflowActions)
      .where(eq(workflowActions.workflowId, workflowId))
      .orderBy(workflowActions.sortOrder);
  }

  async createWorkflowAction(data: InsertWorkflowAction): Promise<WorkflowAction> {
    const [newAction] = await db.insert(workflowActions)
      .values(data)
      .returning();
    return newAction;
  }

  async updateWorkflowAction(id: number, data: Partial<InsertWorkflowAction>): Promise<WorkflowAction> {
    const [updated] = await db.update(workflowActions)
      .set(data)
      .where(eq(workflowActions.id, id))
      .returning();
    return updated;
  }

  async deleteWorkflowAction(id: number): Promise<void> {
    await db.delete(workflowActions).where(eq(workflowActions.id, id));
  }

  async deleteWorkflowActionsByWorkflowId(workflowId: number): Promise<void> {
    await db.delete(workflowActions).where(eq(workflowActions.workflowId, workflowId));
  }

  // Workflow Logs operations
  async getWorkflowLogs(workflowId: number, limit: number = 100): Promise<WorkflowLog[]> {
    return await db.select()
      .from(workflowLogs)
      .where(eq(workflowLogs.workflowId, workflowId))
      .orderBy(desc(workflowLogs.startedAt))
      .limit(limit);
  }

  async getServerWorkflowLogs(serverId: string, limit: number = 100): Promise<WorkflowLog[]> {
    return await db.select()
      .from(workflowLogs)
      .where(eq(workflowLogs.serverId, serverId))
      .orderBy(desc(workflowLogs.startedAt))
      .limit(limit);
  }

  async createWorkflowLog(data: InsertWorkflowLog): Promise<WorkflowLog> {
    const [newLog] = await db.insert(workflowLogs)
      .values({
        ...data,
        startedAt: new Date()
      })
      .returning();
    return newLog;
  }

  async updateWorkflowLog(id: number, data: Partial<InsertWorkflowLog>): Promise<void> {
    await db.update(workflowLogs)
      .set(data)
      .where(eq(workflowLogs.id, id));
  }

  // Workflow Cooldowns operations
  async getWorkflowCooldown(workflowId: number, cooldownType: string, targetId?: string): Promise<WorkflowCooldown | undefined> {
    if (targetId) {
      const [cooldown] = await db.select()
        .from(workflowCooldowns)
        .where(and(
          eq(workflowCooldowns.workflowId, workflowId),
          eq(workflowCooldowns.cooldownType, cooldownType),
          eq(workflowCooldowns.targetId, targetId)
        ));
      return cooldown;
    } else {
      const [cooldown] = await db.select()
        .from(workflowCooldowns)
        .where(and(
          eq(workflowCooldowns.workflowId, workflowId),
          eq(workflowCooldowns.cooldownType, cooldownType)
        ));
      return cooldown;
    }
  }

  async setWorkflowCooldown(data: InsertWorkflowCooldown): Promise<WorkflowCooldown> {
    const [newCooldown] = await db.insert(workflowCooldowns)
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();
    return newCooldown;
  }

  async clearExpiredCooldowns(): Promise<void> {
    await db.delete(workflowCooldowns)
      .where(lte(workflowCooldowns.expiresAt, new Date()));
  }

  // Workflow Templates operations
  async getWorkflowTemplates(category?: string): Promise<WorkflowTemplate[]> {
    if (category) {
      return await db.select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.category, category))
        .orderBy(desc(workflowTemplates.installCount));
    }
    return await db.select()
      .from(workflowTemplates)
      .orderBy(desc(workflowTemplates.installCount));
  }

  async getWorkflowTemplate(id: number): Promise<WorkflowTemplate | undefined> {
    const [template] = await db.select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, id));
    return template;
  }

  // Embed Template operations
  async getEmbedTemplates(serverId: string): Promise<EmbedTemplate[]> {
    return await db.select()
      .from(embedTemplates)
      .where(eq(embedTemplates.serverId, serverId))
      .orderBy(desc(embedTemplates.updatedAt));
  }

  async getEmbedTemplate(id: number): Promise<EmbedTemplate | undefined> {
    const [template] = await db.select()
      .from(embedTemplates)
      .where(eq(embedTemplates.id, id));
    return template;
  }

  async createEmbedTemplate(data: InsertEmbedTemplate): Promise<EmbedTemplate> {
    const [newTemplate] = await db.insert(embedTemplates)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newTemplate;
  }

  async updateEmbedTemplate(id: number, data: UpdateEmbedTemplate): Promise<EmbedTemplate | undefined> {
    const [updated] = await db.update(embedTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(embedTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteEmbedTemplate(id: number): Promise<void> {
    await db.delete(embedTemplates).where(eq(embedTemplates.id, id));
  }

  // Custom Forms operations
  async getCustomForms(serverId: string): Promise<CustomForm[]> {
    return await db.select()
      .from(customForms)
      .where(eq(customForms.serverId, serverId))
      .orderBy(desc(customForms.updatedAt));
  }

  async getCustomForm(id: number): Promise<CustomForm | undefined> {
    const [form] = await db.select()
      .from(customForms)
      .where(eq(customForms.id, id));
    return form;
  }

  async createCustomForm(data: InsertCustomForm): Promise<CustomForm> {
    const [newForm] = await db.insert(customForms)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newForm;
  }

  async updateCustomForm(id: number, data: UpdateCustomForm): Promise<CustomForm | undefined> {
    const [updated] = await db.update(customForms)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customForms.id, id))
      .returning();
    return updated;
  }

  async deleteCustomForm(id: number): Promise<void> {
    await db.delete(customForms).where(eq(customForms.id, id));
  }

  // Form Submissions operations
  async getFormSubmissions(formId: number): Promise<FormSubmission[]> {
    return await db.select()
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(desc(formSubmissions.submittedAt));
  }

  async getFormSubmission(id: number): Promise<FormSubmission | undefined> {
    const [submission] = await db.select()
      .from(formSubmissions)
      .where(eq(formSubmissions.id, id));
    return submission;
  }

  async createFormSubmission(data: InsertFormSubmission): Promise<FormSubmission> {
    const [newSubmission] = await db.insert(formSubmissions)
      .values({
        ...data,
        submittedAt: new Date()
      })
      .returning();
    return newSubmission;
  }

  async getFormSubmissionsByServer(serverId: string): Promise<FormSubmission[]> {
    return await db.select()
      .from(formSubmissions)
      .where(eq(formSubmissions.serverId, serverId))
      .orderBy(desc(formSubmissions.submittedAt));
  }

  // =============================================
  // ECONOMY SYSTEM OPERATIONS
  // =============================================

  // Economy Settings operations
  async getEconomySettings(serverId: string): Promise<EconomySettings | undefined> {
    const [settings] = await db.select()
      .from(economySettings)
      .where(eq(economySettings.serverId, serverId));
    return settings;
  }

  async createEconomySettings(data: InsertEconomySettings): Promise<EconomySettings> {
    const [newSettings] = await db.insert(economySettings)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newSettings;
  }

  async updateEconomySettings(serverId: string, data: UpdateEconomySettings): Promise<EconomySettings | undefined> {
    const [updated] = await db.update(economySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(economySettings.serverId, serverId))
      .returning();
    return updated;
  }

  async getOrCreateEconomySettings(serverId: string): Promise<EconomySettings> {
    const existing = await this.getEconomySettings(serverId);
    if (existing) return existing;
    return this.createEconomySettings({ serverId });
  }

  // User Balance operations
  async getUserBalance(serverId: string, userId: string): Promise<UserBalance | undefined> {
    const [balance] = await db.select()
      .from(userBalances)
      .where(and(
        eq(userBalances.serverId, serverId),
        eq(userBalances.userId, userId)
      ));
    return balance;
  }

  async createUserBalance(data: InsertUserBalance): Promise<UserBalance> {
    const [newBalance] = await db.insert(userBalances)
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();
    return newBalance;
  }

  async updateUserBalance(serverId: string, userId: string, data: UpdateUserBalance): Promise<UserBalance | undefined> {
    const [updated] = await db.update(userBalances)
      .set(data)
      .where(and(
        eq(userBalances.serverId, serverId),
        eq(userBalances.userId, userId)
      ))
      .returning();
    return updated;
  }

  async getOrCreateUserBalance(serverId: string, userId: string): Promise<UserBalance> {
    const existing = await this.getUserBalance(serverId, userId);
    if (existing) return existing;
    return this.createUserBalance({ serverId, userId });
  }

  async getEconomyLeaderboard(serverId: string, limit: number = 10): Promise<UserBalance[]> {
    return await db.select()
      .from(userBalances)
      .where(eq(userBalances.serverId, serverId))
      .orderBy(desc(userBalances.balance))
      .limit(limit);
  }

  async addBalance(serverId: string, userId: string, amount: number, type: string, description?: string): Promise<UserBalance> {
    const balance = await this.getOrCreateUserBalance(serverId, userId);
    const newBalance = (balance.balance || 0) + amount;
    const newTotalEarned = amount > 0 ? (balance.totalEarned || 0) + amount : balance.totalEarned || 0;
    
    const updated = await this.updateUserBalance(serverId, userId, {
      balance: newBalance,
      totalEarned: newTotalEarned
    });

    await this.createEconomyTransaction({
      serverId,
      userId,
      amount,
      type,
      description
    });

    return updated || balance;
  }

  // Shop Item operations
  async getShopItems(serverId: string): Promise<ShopItem[]> {
    return await db.select()
      .from(shopItems)
      .where(eq(shopItems.serverId, serverId))
      .orderBy(shopItems.price);
  }

  async getShopItem(id: number): Promise<ShopItem | undefined> {
    const [item] = await db.select()
      .from(shopItems)
      .where(eq(shopItems.id, id));
    return item;
  }

  async createShopItem(data: InsertShopItem): Promise<ShopItem> {
    const [newItem] = await db.insert(shopItems)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newItem;
  }

  async updateShopItem(id: number, data: UpdateShopItem): Promise<ShopItem | undefined> {
    const [updated] = await db.update(shopItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shopItems.id, id))
      .returning();
    return updated;
  }

  async deleteShopItem(id: number): Promise<void> {
    await db.delete(shopItems).where(eq(shopItems.id, id));
  }

  // Economy Transaction operations
  async createEconomyTransaction(data: InsertEconomyTransaction): Promise<EconomyTransaction> {
    const [newTransaction] = await db.insert(economyTransactions)
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();
    return newTransaction;
  }

  async getEconomyTransactions(serverId: string, limit: number = 50): Promise<EconomyTransaction[]> {
    return await db.select()
      .from(economyTransactions)
      .where(eq(economyTransactions.serverId, serverId))
      .orderBy(desc(economyTransactions.createdAt))
      .limit(limit);
  }

  async getUserTransactions(serverId: string, userId: string, limit: number = 20): Promise<EconomyTransaction[]> {
    return await db.select()
      .from(economyTransactions)
      .where(and(
        eq(economyTransactions.serverId, serverId),
        eq(economyTransactions.userId, userId)
      ))
      .orderBy(desc(economyTransactions.createdAt))
      .limit(limit);
  }

  // User Purchase operations
  async createUserPurchase(data: InsertUserPurchase): Promise<UserPurchase> {
    const [newPurchase] = await db.insert(userPurchases)
      .values({
        ...data,
        purchasedAt: new Date()
      })
      .returning();
    return newPurchase;
  }

  async getUserPurchases(serverId: string, userId: string): Promise<UserPurchase[]> {
    return await db.select()
      .from(userPurchases)
      .where(and(
        eq(userPurchases.serverId, serverId),
        eq(userPurchases.userId, userId)
      ))
      .orderBy(desc(userPurchases.purchasedAt));
  }

  async hasUserPurchasedItem(serverId: string, userId: string, shopItemId: number): Promise<boolean> {
    const [purchase] = await db.select()
      .from(userPurchases)
      .where(and(
        eq(userPurchases.serverId, serverId),
        eq(userPurchases.userId, userId),
        eq(userPurchases.shopItemId, shopItemId)
      ));
    return !!purchase;
  }

  // Scheduled Posts operations
  async getScheduledPosts(serverId: string): Promise<ScheduledPost[]> {
    return await db.select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.serverId, serverId))
      .orderBy(scheduledPosts.nextRunAt);
  }

  async getScheduledPost(id: number): Promise<ScheduledPost | undefined> {
    const [post] = await db.select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, id));
    return post;
  }

  async getDueScheduledPosts(): Promise<ScheduledPost[]> {
    const now = new Date();
    return await db.select()
      .from(scheduledPosts)
      .where(and(
        eq(scheduledPosts.isEnabled, true),
        lte(scheduledPosts.nextRunAt, now)
      ));
  }

  async createScheduledPost(data: InsertScheduledPost): Promise<ScheduledPost> {
    const [newPost] = await db.insert(scheduledPosts)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newPost;
  }

  async updateScheduledPost(id: number, data: UpdateScheduledPost): Promise<ScheduledPost | undefined> {
    const [updated] = await db.update(scheduledPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scheduledPosts.id, id))
      .returning();
    return updated;
  }

  async deleteScheduledPost(id: number): Promise<void> {
    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, id));
  }

  // Onboarding operations
  async getOnboardingStatus(serverId: string): Promise<OnboardingStatus | undefined> {
    const [status] = await db.select()
      .from(onboardingStatus)
      .where(eq(onboardingStatus.serverId, serverId));
    return status;
  }

  async getOrCreateOnboardingStatus(serverId: string): Promise<OnboardingStatus> {
    const existing = await this.getOnboardingStatus(serverId);
    if (existing) return existing;

    const [newStatus] = await db.insert(onboardingStatus)
      .values({
        serverId,
        isSkipped: false,
        isCompleted: false,
        currentStep: "welcome",
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newStatus;
  }

  async updateOnboardingStatus(serverId: string, data: UpdateOnboardingStatus): Promise<OnboardingStatus | undefined> {
    const [updated] = await db.update(onboardingStatus)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(onboardingStatus.serverId, serverId))
      .returning();
    return updated;
  }

  async getOnboardingProgress(serverId: string): Promise<OnboardingProgress[]> {
    return await db.select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.serverId, serverId))
      .orderBy(onboardingProgress.createdAt);
  }

  async getOnboardingStepProgress(serverId: string, step: string): Promise<OnboardingProgress | undefined> {
    const [progress] = await db.select()
      .from(onboardingProgress)
      .where(and(
        eq(onboardingProgress.serverId, serverId),
        eq(onboardingProgress.step, step)
      ));
    return progress;
  }

  async createOnboardingProgress(data: InsertOnboardingProgress): Promise<OnboardingProgress> {
    const [newProgress] = await db.insert(onboardingProgress)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newProgress;
  }

  async updateOnboardingProgress(serverId: string, step: string, data: UpdateOnboardingProgress): Promise<OnboardingProgress | undefined> {
    const [updated] = await db.update(onboardingProgress)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(onboardingProgress.serverId, serverId),
        eq(onboardingProgress.step, step)
      ))
      .returning();
    return updated;
  }

  async markStepComplete(serverId: string, step: string, stepData?: string): Promise<OnboardingProgress> {
    const existing = await this.getOnboardingStepProgress(serverId, step);
    
    if (existing) {
      const [updated] = await db.update(onboardingProgress)
        .set({ 
          isCompleted: true, 
          completedAt: new Date(),
          stepData: stepData || existing.stepData,
          updatedAt: new Date() 
        })
        .where(eq(onboardingProgress.id, existing.id))
        .returning();
      return updated;
    }

    return await this.createOnboardingProgress({
      serverId,
      step,
      isCompleted: true,
      completedAt: new Date(),
      stepData
    });
  }

  async skipOnboarding(serverId: string): Promise<OnboardingStatus> {
    await this.getOrCreateOnboardingStatus(serverId);
    const [updated] = await db.update(onboardingStatus)
      .set({ 
        isSkipped: true, 
        skippedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(onboardingStatus.serverId, serverId))
      .returning();
    return updated;
  }

  async completeOnboarding(serverId: string, template?: string): Promise<OnboardingStatus> {
    await this.getOrCreateOnboardingStatus(serverId);
    const [updated] = await db.update(onboardingStatus)
      .set({ 
        isCompleted: true, 
        currentStep: "complete",
        appliedTemplate: template || null,
        completedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(onboardingStatus.serverId, serverId))
      .returning();
    return updated;
  }

  // Poll operations
  async getPoll(id: number): Promise<Poll | null> {
    const [poll] = await db.select().from(discordPolls).where(eq(discordPolls.id, id));
    return poll || null;
  }

  async getActivePolls(serverId: string): Promise<Poll[]> {
    return await db.select()
      .from(discordPolls)
      .where(and(
        eq(discordPolls.serverId, serverId),
        eq(discordPolls.ended, false)
      ))
      .orderBy(desc(discordPolls.createdAt));
  }

  async getExpiredPolls(): Promise<Poll[]> {
    const now = new Date();
    return await db.select()
      .from(discordPolls)
      .where(and(
        eq(discordPolls.ended, false),
        lte(discordPolls.endsAt, now)
      ));
  }

  async createPoll(data: InsertPoll): Promise<Poll> {
    const [poll] = await db.insert(discordPolls)
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();
    return poll;
  }

  async updatePoll(id: number, updates: UpdatePoll): Promise<Poll | null> {
    const [poll] = await db.update(discordPolls)
      .set(updates)
      .where(eq(discordPolls.id, id))
      .returning();
    return poll || null;
  }

  async deletePoll(id: number): Promise<boolean> {
    const result = await db.delete(discordPolls).where(eq(discordPolls.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Poll Vote operations
  async getPollVoteByUser(pollId: number, odUserId: string): Promise<PollVote | null> {
    const [vote] = await db.select()
      .from(discordPollVotes)
      .where(and(
        eq(discordPollVotes.pollId, pollId),
        eq(discordPollVotes.odUserId, odUserId)
      ));
    return vote || null;
  }

  async createPollVote(data: InsertPollVote): Promise<PollVote> {
    const [vote] = await db.insert(discordPollVotes)
      .values({
        ...data,
        votedAt: new Date()
      })
      .returning();
    return vote;
  }

  async deletePollVote(id: number): Promise<boolean> {
    const result = await db.delete(discordPollVotes).where(eq(discordPollVotes.id, id));
    return (result.rowCount || 0) > 0;
  }
}

// Export a single instance
export const dbStorage = new DatabaseStorage();