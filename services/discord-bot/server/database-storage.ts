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
  streamNotificationLog
} from "@shared/schema";
import { IStorage } from "./storage";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

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
    return await db.transaction(async (tx) => {
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
}

// Export a single instance
export const dbStorage = new DatabaseStorage();