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
  type InsertStreamNotificationLog
} from "@shared/schema";

// Define the storage interface
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Discord user operations
  getAllDiscordUsers(): Promise<DiscordUser[]>;
  getDiscordUser(id: string): Promise<DiscordUser | undefined>;
  createDiscordUser(user: InsertDiscordUser): Promise<DiscordUser>;
  updateDiscordUser(id: string, updates: Partial<InsertDiscordUser>): Promise<DiscordUser | undefined>;
  findOrCreateDiscordUserAtomic(discordId: string, createData: InsertDiscordUser): Promise<{ user: DiscordUser; created: boolean }>;
  
  // Server operations
  getAllServers(): Promise<Server[]>;
  getServer(id: string): Promise<Server | undefined>;
  createServer(server: InsertServer): Promise<Server>;
  updateServer(id: string, updates: Partial<InsertServer>): Promise<Server | undefined>;
  
  // Bot settings operations
  getBotSettings(serverId: string): Promise<BotSettings | undefined>;
  createBotSettings(settings: InsertBotSettings): Promise<BotSettings>;
  updateBotSettings(serverId: string, updates: Partial<InsertBotSettings>): Promise<BotSettings | undefined>;
  
  // Ticket category operations
  getAllTicketCategories(): Promise<TicketCategory[]>;
  getTicketCategory(id: number): Promise<TicketCategory | undefined>;
  getTicketCategoriesByServerId(serverId: string): Promise<TicketCategory[]>;
  createTicketCategory(category: InsertTicketCategory): Promise<TicketCategory>;
  createDefaultCategories(serverId: string): Promise<TicketCategory[]>;
  deleteTicketCategory(id: number): Promise<boolean>;
  deleteTicketCategoriesByServerId(serverId: string): Promise<boolean>;
  
  // Ticket operations
  getAllTickets(): Promise<Ticket[]>;
  getTicket(id: number): Promise<Ticket | undefined>;
  getTicketsByCreator(creatorId: string): Promise<Ticket[]>;
  getTicketsByServerId(serverId: string): Promise<Ticket[]>;
  getTicketsByCategory(categoryId: number): Promise<Ticket[]>;
  getTicketsByStatus(status: string): Promise<Ticket[]>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, updates: Partial<InsertTicket>): Promise<Ticket | undefined>;
  deleteTicket(id: number): Promise<boolean>;
  
  // Ticket message operations
  getTicketMessages(ticketId: number): Promise<TicketMessage[]>;
  createTicketMessage(message: InsertTicketMessage): Promise<TicketMessage>;
  
  // Ticket panel settings operations
  getTicketPanelSettings(serverId: string): Promise<TicketPanelSettings | undefined>;
  createTicketPanelSettings(settings: InsertTicketPanelSettings): Promise<TicketPanelSettings>;
  updateTicketPanelSettings(serverId: string, updates: UpdateTicketPanelSettings): Promise<TicketPanelSettings | undefined>;
  resetTicketPanelSettings(serverId: string): Promise<TicketPanelSettings>;
  
  // Ticket panel categories operations
  getTicketPanelCategories(serverId: string): Promise<TicketPanelCategory[]>;
  getTicketPanelCategory(id: number): Promise<TicketPanelCategory | undefined>;
  createTicketPanelCategory(category: InsertTicketPanelCategory): Promise<TicketPanelCategory>;
  updateTicketPanelCategory(id: number, updates: UpdateTicketPanelCategory): Promise<TicketPanelCategory | undefined>;
  deleteTicketPanelCategory(id: number): Promise<boolean>;
  reorderTicketPanelCategories(serverId: string, categoryOrders: { id: number; sortOrder: number }[]): Promise<TicketPanelCategory[]>;
  
  // Panel Template operations
  getPanelTemplates(serverId: string): Promise<PanelTemplate[]>;
  getPanelTemplate(id: number): Promise<PanelTemplate | undefined>;
  createPanelTemplate(template: InsertPanelTemplate): Promise<PanelTemplate>;
  updatePanelTemplate(id: number, updates: UpdatePanelTemplate): Promise<PanelTemplate | undefined>;
  deletePanelTemplate(id: number): Promise<boolean>;
  incrementTemplateUseCount(id: number): Promise<void>;
  
  // Panel Template Field operations
  getPanelTemplateFields(templateId: number): Promise<PanelTemplateField[]>;
  createPanelTemplateField(field: InsertPanelTemplateField): Promise<PanelTemplateField>;
  updatePanelTemplateField(id: number, updates: UpdatePanelTemplateField): Promise<PanelTemplateField | undefined>;
  deletePanelTemplateField(id: number): Promise<boolean>;
  
  // Panel Template Button operations
  getPanelTemplateButtons(templateId: number): Promise<PanelTemplateButton[]>;
  createPanelTemplateButton(button: InsertPanelTemplateButton): Promise<PanelTemplateButton>;
  updatePanelTemplateButton(id: number, updates: UpdatePanelTemplateButton): Promise<PanelTemplateButton | undefined>;
  deletePanelTemplateButton(id: number): Promise<boolean>;
  
  // Ticket resolution operations
  getTicketResolutions(ticketId: number): Promise<TicketResolution[]>;
  getTicketResolution(id: number): Promise<TicketResolution | undefined>;
  createTicketResolution(resolution: InsertTicketResolution): Promise<TicketResolution>;
  updateTicketResolution(id: number, updates: Partial<InsertTicketResolution>): Promise<TicketResolution | undefined>;
  getResolutionsByServer(serverId: string): Promise<TicketResolution[]>;
  
  // Ticket audit log operations
  getTicketAuditLogs(ticketId: number): Promise<TicketAuditLog[]>;
  createTicketAuditLog(log: InsertTicketAuditLog): Promise<TicketAuditLog>;
  getAuditLogsByServer(serverId: string): Promise<TicketAuditLog[]>;
  getAuditLogsByUser(userId: string): Promise<TicketAuditLog[]>;
  
  // Server role permissions operations
  getRolePermissions(serverId: string): Promise<ServerRolePermission[]>;
  getRolePermission(id: number): Promise<ServerRolePermission | undefined>;
  addRolePermission(permission: InsertServerRolePermission): Promise<ServerRolePermission>;
  updateRolePermission(id: number, updates: UpdateServerRolePermission): Promise<ServerRolePermission | undefined>;
  deleteRolePermission(id: number): Promise<boolean>;
  
  // Thread mappings operations
  getThreadMapping(threadId: string): Promise<ThreadMapping | null>;
  getThreadMappingByTicket(ticketId: number): Promise<ThreadMapping | null>;
  createThreadMapping(data: InsertThreadMapping): Promise<ThreadMapping>;
  updateThreadMapping(threadId: string, data: Partial<ThreadMapping>): Promise<ThreadMapping>;
  deleteThreadMapping(threadId: string): Promise<void>;
  getServerThreadMappings(serverId: string): Promise<ThreadMapping[]>;
  
  // Developer operations
  getDevelopers(): Promise<Developer[]>;
  getDeveloper(discordId: string): Promise<Developer | null>;
  addDeveloper(data: InsertDeveloper): Promise<Developer>;
  removeDeveloper(discordId: string): Promise<boolean>;
  
  // Developer audit log operations
  getDeveloperAuditLogs(developerId?: string): Promise<DeveloperAuditLog[]>;
  createDeveloperAuditLog(log: InsertDeveloperAuditLog): Promise<DeveloperAuditLog>;
  
  // Stream notification operations
  getStreamNotificationSettings(serverId: string): Promise<StreamNotificationSettings | null>;
  createStreamNotificationSettings(settings: InsertStreamNotificationSettings): Promise<StreamNotificationSettings>;
  updateStreamNotificationSettings(serverId: string, updates: UpdateStreamNotificationSettings): Promise<StreamNotificationSettings | null>;
  
  getStreamTrackedUsers(serverId: string): Promise<StreamTrackedUser[]>;
  addStreamTrackedUser(user: InsertStreamTrackedUser): Promise<StreamTrackedUser>;
  removeStreamTrackedUser(serverId: string, userId: string): Promise<boolean>;
  updateStreamTrackedUser(serverId: string, userId: string, updates: Partial<StreamTrackedUser>): Promise<StreamTrackedUser | null>;
  
  createStreamNotificationLog(log: InsertStreamNotificationLog): Promise<StreamNotificationLog>;
  getStreamNotificationLogs(serverId: string, limit?: number): Promise<StreamNotificationLog[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private discordUsers: Map<string, DiscordUser> = new Map();
  private servers: Map<string, Server> = new Map();
  private botSettings: Map<string, BotSettings> = new Map();
  private ticketCategories: Map<number, TicketCategory> = new Map();
  private tickets: Map<number, Ticket> = new Map();
  private ticketMessages: Map<number, TicketMessage> = new Map();
  private ticketPanelSettings: Map<string, TicketPanelSettings> = new Map();
  private ticketPanelCategories: Map<number, TicketPanelCategory> = new Map();
  private panelTemplates: Map<number, PanelTemplate> = new Map();
  private panelTemplateFields: Map<number, PanelTemplateField> = new Map();
  private panelTemplateButtons: Map<number, PanelTemplateButton> = new Map();
  private ticketResolutions: Map<number, TicketResolution> = new Map();
  private ticketAuditLogs: Map<number, TicketAuditLog> = new Map();
  private threadMappings: Map<string, ThreadMapping> = new Map();
  private developers: Map<string, Developer> = new Map();
  private developerAuditLogs: Map<number, DeveloperAuditLog> = new Map();
  
  private currentUserId: number = 1;
  private currentTicketCategoryId: number = 1;
  private currentTicketId: number = 1;
  private currentTicketMessageId: number = 1;
  private currentBotSettingsId: number = 1;
  private currentTicketPanelSettingsId: number = 1;
  private currentTicketPanelCategoryId: number = 1;
  private currentPanelTemplateId: number = 1;
  private currentPanelTemplateFieldId: number = 1;
  private currentPanelTemplateButtonId: number = 1;
  private currentResolutionId: number = 1;
  private currentAuditLogId: number = 1;
  private currentThreadMappingId: number = 1;
  private currentDeveloperId: number = 1;
  private currentDeveloperAuditLogId: number = 1;
  
  constructor() {
    this.users = new Map();
    this.discordUsers = new Map();
    this.ticketCategories = new Map();
    this.tickets = new Map();
    this.ticketMessages = new Map();
    this.ticketPanelSettings = new Map();
    this.ticketPanelCategories = new Map();
    
    this.currentUserId = 1;
    this.currentTicketCategoryId = 1;
    this.currentTicketId = 1;
    this.currentTicketMessageId = 1;
    this.currentTicketPanelSettingsId = 1;
    this.currentTicketPanelCategoryId = 1;
    
    // Initialize with default categories
    this.initializeDefaults();
  }
  
  private initializeDefaults() {
    // Add default ticket categories
    const defaultCategories = [
      { name: "General Support", color: "#5865F2" }, // Discord blue
      { name: "Bug Reports", color: "#F04747" },     // Discord red
      { name: "Feature Requests", color: "#FAA61A" }, // Discord yellow
      { name: "Account Issues", color: "#43B581" }   // Discord green
    ];
    
    defaultCategories.forEach(category => {
      this.createTicketCategory(category);
    });
  }
  
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Discord user operations
  async getAllDiscordUsers(): Promise<DiscordUser[]> {
    return Array.from(this.discordUsers.values());
  }
  
  async getDiscordUser(id: string): Promise<DiscordUser | undefined> {
    return this.discordUsers.get(id);
  }
  
  async createDiscordUser(insertUser: InsertDiscordUser): Promise<DiscordUser> {
    // Ensure all properties are properly typed, converting undefined to null
    const discordUser: DiscordUser = {
      id: insertUser.id,
      username: insertUser.username,
      discriminator: insertUser.discriminator,
      avatar: insertUser.avatar ?? null,
      isAdmin: insertUser.isAdmin ?? null,
      serverId: insertUser.serverId ?? null,
      onboardingCompleted: insertUser.onboardingCompleted ?? null,
      firstLoginAt: insertUser.firstLoginAt ?? null,
      lastSeenAt: insertUser.lastSeenAt ?? null,
      adminGuilds: insertUser.adminGuilds ?? null,
      connectedServers: insertUser.connectedServers ?? null
    };
    
    this.discordUsers.set(discordUser.id, discordUser);
    return discordUser;
  }
  
  async updateDiscordUser(id: string, updates: Partial<InsertDiscordUser>): Promise<DiscordUser | undefined> {
    const user = await this.getDiscordUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.discordUsers.set(id, updatedUser);
    return updatedUser;
  }
  
  // Server operations
  async getAllServers(): Promise<Server[]> {
    return Array.from(this.servers.values());
  }
  
  async getServer(id: string): Promise<Server | undefined> {
    return this.servers.get(id);
  }
  
  async createServer(insertServer: InsertServer): Promise<Server> {
    const server: Server = {
      ...insertServer,
      icon: insertServer.icon || null,
      ownerId: insertServer.ownerId || null,
      adminRoleId: insertServer.adminRoleId || null,
      supportRoleId: insertServer.supportRoleId || null,
      isActive: insertServer.isActive !== undefined ? insertServer.isActive : null
    };
    this.servers.set(server.id, server);
    return server;
  }
  
  async updateServer(id: string, updates: Partial<InsertServer>): Promise<Server | undefined> {
    const server = await this.getServer(id);
    if (!server) return undefined;
    
    const updatedServer = { ...server, ...updates };
    this.servers.set(id, updatedServer);
    return updatedServer;
  }
  
  // Bot settings operations
  async getBotSettings(serverId: string): Promise<BotSettings | undefined> {
    return this.botSettings.get(serverId);
  }
  
  async createBotSettings(insertSettings: InsertBotSettings): Promise<BotSettings> {
    const id = this.currentBotSettingsId++;
    const now = new Date();
    const settings: BotSettings = {
      id,
      serverId: insertSettings.serverId,
      botName: insertSettings.botName ?? null,
      botNickname: insertSettings.botNickname ?? null,
      botPrefix: insertSettings.botPrefix ?? null,
      welcomeMessage: insertSettings.welcomeMessage ?? null,
      notificationsEnabled: insertSettings.notificationsEnabled ?? null,
      adminRoleId: insertSettings.adminRoleId ?? null,
      supportRoleId: insertSettings.supportRoleId ?? null,
      autoCloseEnabled: insertSettings.autoCloseEnabled ?? null,
      autoCloseHours: insertSettings.autoCloseHours ?? null,
      defaultPriority: insertSettings.defaultPriority ?? null,
      debugMode: insertSettings.debugMode ?? null,
      logChannelId: insertSettings.logChannelId ?? null,
      ticketChannelId: insertSettings.ticketChannelId ?? null,
      dashboardUrl: insertSettings.dashboardUrl ?? null,
      adminChannelId: insertSettings.adminChannelId ?? null,
      publicLogChannelId: insertSettings.publicLogChannelId ?? null,
      adminNotificationsEnabled: insertSettings.adminNotificationsEnabled ?? null,
      sendCopyToAdminChannel: insertSettings.sendCopyToAdminChannel ?? null,
      threadIntegrationEnabled: insertSettings.threadIntegrationEnabled ?? null,
      threadChannelId: insertSettings.threadChannelId ?? null,
      threadAutoCreate: insertSettings.threadAutoCreate ?? null,
      threadBidirectionalSync: insertSettings.threadBidirectionalSync ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.botSettings.set(settings.serverId, settings);
    return settings;
  }
  
  async updateBotSettings(serverId: string, updates: Partial<InsertBotSettings>): Promise<BotSettings | undefined> {
    const settings = await this.getBotSettings(serverId);
    if (!settings) return undefined;
    
    const updatedSettings = { ...settings, ...updates };
    this.botSettings.set(serverId, updatedSettings);
    return updatedSettings;
  }
  
  // Ticket category operations
  async getAllTicketCategories(): Promise<TicketCategory[]> {
    return Array.from(this.ticketCategories.values());
  }
  
  async getTicketCategory(id: number): Promise<TicketCategory | undefined> {
    return this.ticketCategories.get(id);
  }
  
  async getTicketCategoriesByServerId(serverId: string): Promise<TicketCategory[]> {
    return Array.from(this.ticketCategories.values())
      .filter(category => category.serverId === serverId);
  }
  
  async createTicketCategory(category: InsertTicketCategory): Promise<TicketCategory> {
    const id = this.currentTicketCategoryId++;
    const newCategory: TicketCategory = { 
      ...category, 
      id,
      serverId: category.serverId || null,
      emoji: category.emoji ?? "🎫", // Default emoji if not provided
      color: category.color || '#3b82f6' // Default color if not provided
    };
    this.ticketCategories.set(id, newCategory);
    return newCategory;
  }

  async createDefaultCategories(serverId: string): Promise<TicketCategory[]> {
    const defaultCategories = [
      { name: "General Support", emoji: "💬", color: "#5865F2", serverId },
      { name: "Technical Issue", emoji: "🛠️", color: "#ED4245", serverId },
      { name: "Bug Report", emoji: "🐛", color: "#FEE75C", serverId },
      { name: "Feature Request", emoji: "✨", color: "#57F287", serverId }
    ];

    const createdCategories: TicketCategory[] = [];
    for (const category of defaultCategories) {
      const created = await this.createTicketCategory(category);
      createdCategories.push(created);
    }
    
    return createdCategories;
  }

  async deleteTicketCategory(id: number): Promise<boolean> {
    return this.ticketCategories.delete(id);
  }

  async deleteTicketCategoriesByServerId(serverId: string): Promise<boolean> {
    const categories = await this.getTicketCategoriesByServerId(serverId);
    for (const category of categories) {
      this.ticketCategories.delete(category.id);
    }
    return true;
  }
  
  // Ticket operations
  async getAllTickets(): Promise<Ticket[]> {
    return Array.from(this.tickets.values());
  }
  
  async getTicket(id: number): Promise<Ticket | undefined> {
    return this.tickets.get(id);
  }
  
  async getTicketsByCreator(creatorId: string): Promise<Ticket[]> {
    return Array.from(this.tickets.values())
      .filter(ticket => ticket.creatorId === creatorId);
  }
  
  async getTicketsByCategory(categoryId: number): Promise<Ticket[]> {
    return Array.from(this.tickets.values())
      .filter(ticket => ticket.categoryId === categoryId);
  }
  
  async getTicketsByServerId(serverId: string): Promise<Ticket[]> {
    return Array.from(this.tickets.values())
      .filter(ticket => ticket.serverId === serverId);
  }
  
  async getTicketsByStatus(status: string): Promise<Ticket[]> {
    return Array.from(this.tickets.values())
      .filter(ticket => ticket.status === status);
  }
  
  async createTicket(insertTicket: InsertTicket): Promise<Ticket> {
    const id = this.currentTicketId++;
    const now = new Date();
    const ticket: Ticket = { 
      id,
      serverId: insertTicket.serverId || null,
      title: insertTicket.title,
      description: insertTicket.description,
      creatorId: insertTicket.creatorId,
      status: insertTicket.status || 'open',
      discordId: insertTicket.discordId || null,
      priority: insertTicket.priority || null,
      categoryId: insertTicket.categoryId || null,
      assigneeId: insertTicket.assigneeId || null,
      mediationActions: insertTicket.mediationActions || null,
      userActions: insertTicket.userActions || null,
      createdAt: now,
      updatedAt: now
    };
    this.tickets.set(id, ticket);
    return ticket;
  }
  
  async updateTicket(id: number, updates: Partial<InsertTicket>): Promise<Ticket | undefined> {
    const ticket = await this.getTicket(id);
    if (!ticket) return undefined;
    
    const updatedTicket: Ticket = { 
      ...ticket, 
      ...updates,
      updatedAt: new Date()
    };
    this.tickets.set(id, updatedTicket);
    return updatedTicket;
  }

  async deleteTicket(id: number): Promise<boolean> {
    const ticket = await this.getTicket(id);
    if (!ticket) return false;
    
    this.ticketMessages.forEach((message, messageId) => {
      if (message.ticketId === id) {
        this.ticketMessages.delete(messageId);
      }
    });
    
    this.ticketResolutions.forEach((resolution, resolutionId) => {
      if (resolution.ticketId === id) {
        this.ticketResolutions.delete(resolutionId);
      }
    });
    
    this.ticketAuditLogs.forEach((log, logId) => {
      if (log.ticketId === id) {
        this.ticketAuditLogs.delete(logId);
      }
    });
    
    return this.tickets.delete(id);
  }
  
  // Ticket message operations
  async getTicketMessages(ticketId: number): Promise<TicketMessage[]> {
    return Array.from(this.ticketMessages.values())
      .filter(message => message.ticketId === ticketId)
      .sort((a, b) => {
        // Handle null createdAt values (should not happen, but just in case)
        if (!a.createdAt) return -1;
        if (!b.createdAt) return 1;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }
  
  async createTicketMessage(insertMessage: InsertTicketMessage): Promise<TicketMessage> {
    const id = this.currentTicketMessageId++;
    const message: TicketMessage = { 
      ...insertMessage, 
      id,
      senderUsername: insertMessage.senderUsername || null,
      createdAt: new Date()
    };
    this.ticketMessages.set(id, message);
    
    // Update the ticket's updatedAt timestamp
    if (insertMessage.ticketId) {
      const ticket = await this.getTicket(insertMessage.ticketId);
      if (ticket) {
        await this.updateTicket(ticket.id, {});
      }
    }
    
    return message;
  }

  // Ticket panel settings operations
  async getTicketPanelSettings(serverId: string): Promise<TicketPanelSettings | undefined> {
    return this.ticketPanelSettings.get(serverId);
  }

  async createTicketPanelSettings(insertSettings: InsertTicketPanelSettings): Promise<TicketPanelSettings> {
    const id = this.currentTicketPanelSettingsId++;
    const now = new Date();
    const settings: TicketPanelSettings = {
      id,
      serverId: insertSettings.serverId,
      title: insertSettings.title || "🎫 Support Ticket System",
      description: insertSettings.description || "**Welcome to our support ticket system!**\n\nClick one of the buttons below to create a new support ticket. Our team will respond as quickly as possible.\n\n*Please provide as much detail as possible when creating your ticket to help us assist you better.*",
      embedColor: insertSettings.embedColor || "#5865F2",
      footerText: insertSettings.footerText || "Click a button below to get started • Support Team",
      showTimestamp: insertSettings.showTimestamp ?? true,
      thumbnailUrl: insertSettings.thumbnailUrl || null,
      authorName: insertSettings.authorName || null,
      authorIconUrl: insertSettings.authorIconUrl || null,
      buttonsPerRow: insertSettings.buttonsPerRow || 2,
      showCategoriesInDescription: insertSettings.showCategoriesInDescription ?? true,
      maxCategories: insertSettings.maxCategories || 25,
      isEnabled: insertSettings.isEnabled ?? true,
      requireReason: insertSettings.requireReason ?? true,
      cooldownMinutes: insertSettings.cooldownMinutes || 0,
      createdAt: now,
      updatedAt: now
    };
    this.ticketPanelSettings.set(settings.serverId, settings);
    return settings;
  }

  async updateTicketPanelSettings(serverId: string, updates: UpdateTicketPanelSettings): Promise<TicketPanelSettings | undefined> {
    const settings = await this.getTicketPanelSettings(serverId);
    if (!settings) return undefined;
    
    const updatedSettings: TicketPanelSettings = { 
      ...settings, 
      ...updates,
      updatedAt: new Date()
    };
    this.ticketPanelSettings.set(serverId, updatedSettings);
    return updatedSettings;
  }

  async resetTicketPanelSettings(serverId: string): Promise<TicketPanelSettings> {
    // Delete existing settings
    this.ticketPanelSettings.delete(serverId);
    
    // Create default settings
    const defaultSettings: InsertTicketPanelSettings = { serverId };
    const newSettings = await this.createTicketPanelSettings(defaultSettings);
    
    // Also create default categories for this server
    await this.createDefaultTicketPanelCategories(serverId);
    
    return newSettings;
  }

  // Ticket panel categories operations
  async getTicketPanelCategories(serverId: string): Promise<TicketPanelCategory[]> {
    return Array.from(this.ticketPanelCategories.values())
      .filter(category => category.serverId === serverId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async getTicketPanelCategory(id: number): Promise<TicketPanelCategory | undefined> {
    return this.ticketPanelCategories.get(id);
  }

  async createTicketPanelCategory(insertCategory: InsertTicketPanelCategory): Promise<TicketPanelCategory> {
    // Check category limit
    const existingCategories = await this.getTicketPanelCategories(insertCategory.serverId);
    if (existingCategories.length >= 25) {
      throw new Error('Maximum of 25 categories allowed per server');
    }

    const id = this.currentTicketPanelCategoryId++;
    const now = new Date();
    
    // Generate custom ID if not provided - use format expected by interaction handler
    const customId = insertCategory.customId || `createTicket_${insertCategory.ticketCategoryId}`;
    
    const category: TicketPanelCategory = {
      id,
      serverId: insertCategory.serverId,
      ticketCategoryId: insertCategory.ticketCategoryId,
      name: insertCategory.name,
      description: insertCategory.description || null,
      emoji: insertCategory.emoji || "🎫",
      buttonStyle: insertCategory.buttonStyle || "Primary",
      isEnabled: insertCategory.isEnabled ?? true,
      sortOrder: insertCategory.sortOrder || existingCategories.length,
      customId,
      requiresRole: insertCategory.requiresRole || null,
      welcomeMessage: insertCategory.welcomeMessage || null,
      assignToRole: insertCategory.assignToRole || null,
      createdAt: now,
      updatedAt: now
    };

    this.ticketPanelCategories.set(id, category);
    return category;
  }

  async updateTicketPanelCategory(id: number, updates: UpdateTicketPanelCategory): Promise<TicketPanelCategory | undefined> {
    const category = await this.getTicketPanelCategory(id);
    if (!category) return undefined;
    
    const updatedCategory: TicketPanelCategory = { 
      ...category, 
      ...updates,
      updatedAt: new Date()
    };
    this.ticketPanelCategories.set(id, updatedCategory);
    return updatedCategory;
  }

  async deleteTicketPanelCategory(id: number): Promise<boolean> {
    return this.ticketPanelCategories.delete(id);
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
    return Array.from(this.panelTemplates.values())
      .filter(template => template.serverId === serverId)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  }

  async getPanelTemplate(id: number): Promise<PanelTemplate | undefined> {
    return this.panelTemplates.get(id);
  }

  async createPanelTemplate(insertTemplate: InsertPanelTemplate): Promise<PanelTemplate> {
    const id = this.currentPanelTemplateId++;
    const now = new Date();
    const template: PanelTemplate = {
      id,
      serverId: insertTemplate.serverId,
      name: insertTemplate.name,
      description: insertTemplate.description || null,
      type: insertTemplate.type || "custom",
      embedTitle: insertTemplate.embedTitle || null,
      embedDescription: insertTemplate.embedDescription || null,
      embedColor: insertTemplate.embedColor || "#5865F2",
      embedUrl: insertTemplate.embedUrl || null,
      authorName: insertTemplate.authorName || null,
      authorIconUrl: insertTemplate.authorIconUrl || null,
      authorUrl: insertTemplate.authorUrl || null,
      thumbnailUrl: insertTemplate.thumbnailUrl || null,
      imageUrl: insertTemplate.imageUrl || null,
      footerText: insertTemplate.footerText || null,
      footerIconUrl: insertTemplate.footerIconUrl || null,
      showTimestamp: insertTemplate.showTimestamp || false,
      isEnabled: insertTemplate.isEnabled ?? true,
      isTicketPanel: insertTemplate.isTicketPanel || false,
      lastUsed: null,
      useCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.panelTemplates.set(id, template);
    return template;
  }

  async updatePanelTemplate(id: number, updates: UpdatePanelTemplate): Promise<PanelTemplate | undefined> {
    const template = await this.getPanelTemplate(id);
    if (!template) return undefined;
    
    const updatedTemplate: PanelTemplate = { 
      ...template, 
      ...updates,
      updatedAt: new Date()
    };
    this.panelTemplates.set(id, updatedTemplate);
    return updatedTemplate;
  }

  async deletePanelTemplate(id: number): Promise<boolean> {
    // Also delete related fields and buttons
    Array.from(this.panelTemplateFields.values())
      .filter(field => field.templateId === id)
      .forEach(field => this.panelTemplateFields.delete(field.id));
    
    Array.from(this.panelTemplateButtons.values())
      .filter(button => button.templateId === id)
      .forEach(button => this.panelTemplateButtons.delete(button.id));
    
    return this.panelTemplates.delete(id);
  }

  async incrementTemplateUseCount(id: number): Promise<void> {
    const template = await this.getPanelTemplate(id);
    if (!template) return;
    
    const updatedTemplate: PanelTemplate = { 
      ...template,
      useCount: (template.useCount || 0) + 1,
      lastUsed: new Date()
    };
    this.panelTemplates.set(id, updatedTemplate);
  }
  
  // Panel Template Field operations
  async getPanelTemplateFields(templateId: number): Promise<PanelTemplateField[]> {
    return Array.from(this.panelTemplateFields.values())
      .filter(field => field.templateId === templateId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async createPanelTemplateField(insertField: InsertPanelTemplateField): Promise<PanelTemplateField> {
    const id = this.currentPanelTemplateFieldId++;
    const now = new Date();
    const field: PanelTemplateField = {
      id,
      templateId: insertField.templateId,
      name: insertField.name,
      value: insertField.value,
      inline: insertField.inline || false,
      sortOrder: insertField.sortOrder || 0,
      isEnabled: insertField.isEnabled ?? true,
      createdAt: now,
      updatedAt: now
    };
    this.panelTemplateFields.set(id, field);
    return field;
  }

  async updatePanelTemplateField(id: number, updates: UpdatePanelTemplateField): Promise<PanelTemplateField | undefined> {
    const field = this.panelTemplateFields.get(id);
    if (!field) return undefined;
    
    const updatedField: PanelTemplateField = { 
      ...field, 
      ...updates,
      updatedAt: new Date()
    };
    this.panelTemplateFields.set(id, updatedField);
    return updatedField;
  }

  async deletePanelTemplateField(id: number): Promise<boolean> {
    return this.panelTemplateFields.delete(id);
  }
  
  // Panel Template Button operations
  async getPanelTemplateButtons(templateId: number): Promise<PanelTemplateButton[]> {
    return Array.from(this.panelTemplateButtons.values())
      .filter(button => button.templateId === templateId)
      .sort((a, b) => {
        // Sort by row first, then position
        if (a.row !== b.row) {
          return (a.row || 1) - (b.row || 1);
        }
        return (a.position || 0) - (b.position || 0);
      });
  }

  async createPanelTemplateButton(insertButton: InsertPanelTemplateButton): Promise<PanelTemplateButton> {
    const id = this.currentPanelTemplateButtonId++;
    const now = new Date();
    const button: PanelTemplateButton = {
      id,
      templateId: insertButton.templateId,
      customId: insertButton.customId,
      label: insertButton.label,
      emoji: insertButton.emoji || null,
      buttonStyle: insertButton.buttonStyle || "Primary",
      url: insertButton.url || null,
      actionType: insertButton.actionType || "custom",
      actionData: insertButton.actionData || null,
      row: insertButton.row || 1,
      position: insertButton.position || 0,
      isEnabled: insertButton.isEnabled ?? true,
      requiresRole: insertButton.requiresRole || null,
      createdAt: now,
      updatedAt: now
    };
    this.panelTemplateButtons.set(id, button);
    return button;
  }

  async updatePanelTemplateButton(id: number, updates: UpdatePanelTemplateButton): Promise<PanelTemplateButton | undefined> {
    const button = this.panelTemplateButtons.get(id);
    if (!button) return undefined;
    
    const updatedButton: PanelTemplateButton = { 
      ...button, 
      ...updates,
      updatedAt: new Date()
    };
    this.panelTemplateButtons.set(id, updatedButton);
    return updatedButton;
  }

  async deletePanelTemplateButton(id: number): Promise<boolean> {
    return this.panelTemplateButtons.delete(id);
  }
  
  // Ticket resolution operations
  async getTicketResolutions(ticketId: number): Promise<TicketResolution[]> {
    return Array.from(this.ticketResolutions.values())
      .filter(resolution => resolution.ticketId === ticketId)
      .sort((a, b) => new Date(b.resolvedAt!).getTime() - new Date(a.resolvedAt!).getTime());
  }
  
  async getTicketResolution(id: number): Promise<TicketResolution | undefined> {
    return this.ticketResolutions.get(id);
  }
  
  async createTicketResolution(resolution: InsertTicketResolution): Promise<TicketResolution> {
    const id = this.currentResolutionId++;
    const now = new Date();
    const newResolution: TicketResolution = {
      id,
      ticketId: resolution.ticketId,
      resolutionType: resolution.resolutionType,
      resolutionNotes: resolution.resolutionNotes || null,
      actionTaken: resolution.actionTaken || null,
      resolvedBy: resolution.resolvedBy,
      resolvedByUsername: resolution.resolvedByUsername || null,
      resolvedAt: now,
      serverId: resolution.serverId || null
    };
    this.ticketResolutions.set(id, newResolution);
    return newResolution;
  }
  
  async updateTicketResolution(id: number, updates: Partial<InsertTicketResolution>): Promise<TicketResolution | undefined> {
    const resolution = this.ticketResolutions.get(id);
    if (!resolution) return undefined;
    
    const updatedResolution: TicketResolution = { 
      ...resolution, 
      ...updates,
      id: resolution.id,
      resolvedAt: resolution.resolvedAt
    };
    this.ticketResolutions.set(id, updatedResolution);
    return updatedResolution;
  }
  
  async getResolutionsByServer(serverId: string): Promise<TicketResolution[]> {
    return Array.from(this.ticketResolutions.values())
      .filter(resolution => resolution.serverId === serverId)
      .sort((a, b) => new Date(b.resolvedAt!).getTime() - new Date(a.resolvedAt!).getTime());
  }
  
  // Ticket audit log operations
  async getTicketAuditLogs(ticketId: number): Promise<TicketAuditLog[]> {
    return Array.from(this.ticketAuditLogs.values())
      .filter(log => log.ticketId === ticketId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }
  
  async createTicketAuditLog(log: InsertTicketAuditLog): Promise<TicketAuditLog> {
    const id = this.currentAuditLogId++;
    const now = new Date();
    const newLog: TicketAuditLog = {
      id,
      ticketId: log.ticketId,
      action: log.action,
      performedBy: log.performedBy,
      performedByUsername: log.performedByUsername || null,
      details: log.details || null,
      createdAt: now,
      serverId: log.serverId || null
    };
    this.ticketAuditLogs.set(id, newLog);
    return newLog;
  }
  
  async getAuditLogsByServer(serverId: string): Promise<TicketAuditLog[]> {
    return Array.from(this.ticketAuditLogs.values())
      .filter(log => log.serverId === serverId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }
  
  async getAuditLogsByUser(userId: string): Promise<TicketAuditLog[]> {
    return Array.from(this.ticketAuditLogs.values())
      .filter(log => log.performedBy === userId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }
  
  // Stub implementations for server role permissions
  async getRolePermissions(serverId: string): Promise<ServerRolePermission[]> {
    throw new Error("Method not implemented in MemStorage");
  }
  
  async getRolePermission(id: number): Promise<ServerRolePermission | undefined> {
    throw new Error("Method not implemented in MemStorage");
  }
  
  async addRolePermission(permission: InsertServerRolePermission): Promise<ServerRolePermission> {
    throw new Error("Method not implemented in MemStorage");
  }
  
  async updateRolePermission(id: number, updates: UpdateServerRolePermission): Promise<ServerRolePermission | undefined> {
    throw new Error("Method not implemented in MemStorage");
  }
  
  async deleteRolePermission(id: number): Promise<boolean> {
    throw new Error("Method not implemented in MemStorage");
  }
  
  // Thread mappings operations
  async getThreadMapping(threadId: string): Promise<ThreadMapping | null> {
    return this.threadMappings.get(threadId) || null;
  }
  
  async getThreadMappingByTicket(ticketId: number): Promise<ThreadMapping | null> {
    return Array.from(this.threadMappings.values())
      .find(mapping => mapping.ticketId === ticketId) || null;
  }
  
  async createThreadMapping(data: InsertThreadMapping): Promise<ThreadMapping> {
    const id = this.currentThreadMappingId++;
    const now = new Date();
    const mapping: ThreadMapping = {
      id,
      serverId: data.serverId,
      threadId: data.threadId,
      ticketId: data.ticketId,
      channelId: data.channelId,
      status: data.status || "active",
      syncEnabled: data.syncEnabled ?? true,
      lastSyncedAt: data.lastSyncedAt || null,
      createdAt: now,
      updatedAt: now
    };
    this.threadMappings.set(mapping.threadId, mapping);
    return mapping;
  }
  
  async updateThreadMapping(threadId: string, data: Partial<ThreadMapping>): Promise<ThreadMapping> {
    const mapping = this.threadMappings.get(threadId);
    if (!mapping) {
      throw new Error(`Thread mapping not found for threadId: ${threadId}`);
    }
    
    const updatedMapping: ThreadMapping = {
      ...mapping,
      ...data,
      updatedAt: new Date()
    };
    this.threadMappings.set(threadId, updatedMapping);
    return updatedMapping;
  }
  
  async deleteThreadMapping(threadId: string): Promise<void> {
    this.threadMappings.delete(threadId);
  }
  
  async getServerThreadMappings(serverId: string): Promise<ThreadMapping[]> {
    return Array.from(this.threadMappings.values())
      .filter(mapping => mapping.serverId === serverId)
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  }
  
  // Developer operations
  async getDevelopers(): Promise<Developer[]> {
    return Array.from(this.developers.values())
      .filter(dev => dev.isActive)
      .sort((a, b) => new Date(a.addedAt!).getTime() - new Date(b.addedAt!).getTime());
  }
  
  async getDeveloper(discordId: string): Promise<Developer | null> {
    return this.developers.get(discordId) || null;
  }
  
  async addDeveloper(data: InsertDeveloper): Promise<Developer> {
    const id = this.currentDeveloperId++;
    const now = new Date();
    const developer: Developer = {
      id,
      discordId: data.discordId,
      username: data.username,
      addedBy: data.addedBy || null,
      addedAt: now,
      isActive: data.isActive ?? true
    };
    this.developers.set(developer.discordId, developer);
    return developer;
  }
  
  async removeDeveloper(discordId: string): Promise<boolean> {
    const developer = this.developers.get(discordId);
    if (!developer) return false;
    
    developer.isActive = false;
    this.developers.set(discordId, developer);
    return true;
  }
  
  // Developer audit log operations
  async getDeveloperAuditLogs(developerId?: string): Promise<DeveloperAuditLog[]> {
    const logs = Array.from(this.developerAuditLogs.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    
    if (developerId) {
      return logs.filter(log => log.developerId === developerId);
    }
    return logs;
  }
  
  async createDeveloperAuditLog(log: InsertDeveloperAuditLog): Promise<DeveloperAuditLog> {
    const id = this.currentDeveloperAuditLogId++;
    const now = new Date();
    const auditLog: DeveloperAuditLog = {
      id,
      developerId: log.developerId,
      action: log.action,
      metadata: log.metadata || null,
      ipAddress: log.ipAddress || null,
      userAgent: log.userAgent || null,
      createdAt: now
    };
    
    this.developerAuditLogs.set(id, auditLog);
    return auditLog;
  }
}

export const storage = new MemStorage();
