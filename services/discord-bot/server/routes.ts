import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { dbStorage as storage } from "./database-storage";
import WebSocket, { WebSocketServer } from "ws";
import { z } from "zod";
import multer from "multer";
import { nanoid } from "nanoid";
import * as fs from "fs";
import * as path from "path";
import { 
  insertTicketSchema, 
  insertTicketMessageSchema, 
  insertTicketCategorySchema,
  insertServerSchema,
  insertBotSettingsSchema,
  ticketUpdateSchema,
  insertTicketPanelSettingsSchema,
  updateTicketPanelSettingsSchema,
  insertTicketPanelCategorySchema,
  updateTicketPanelCategorySchema,
  insertPanelTemplateSchema,
  updatePanelTemplateSchema,
  insertPanelTemplateFieldSchema,
  updatePanelTemplateFieldSchema,
  insertPanelTemplateButtonSchema,
  updatePanelTemplateButtonSchema,
  insertServerRolePermissionSchema,
  updateServerRolePermissionSchema
} from "@shared/schema";
import { calculateBotPermissions, generateDiscordInviteURL } from "../shared/discord-constants";
import { startBot } from "./discord/bot";
import { isAuthenticated, isAdmin } from "./auth";
import { fetchGuildChannels, sendTicketPanelToChannel, sendPanelTemplateToChannel, getBotGuilds, getDiscordClient, getChannelToTicketMap } from "./discord/bot";
import { syncDashboardMessageToThread, syncTicketStatusToThread } from "./discord/thread-sync";
import { createTicketThread } from "./discord/ticket-threads";
import { sendTicketNotificationToAdminChannel } from "./discord/commands";
import devRoutes from "./routes/dev-routes";
import homelabhubRoutes from "./routes/homelabhub-routes";
import streamNotificationsRoutes from "./routes/stream-notifications";
import { isDeveloperMiddleware } from "./middleware/developerAuth";

// Configure multer for embed image uploads
const EMBED_IMAGES_DIR = path.join(process.cwd(), 'attached_assets', 'embed-images');

// Ensure directory exists
if (!fs.existsSync(EMBED_IMAGES_DIR)) {
  fs.mkdirSync(EMBED_IMAGES_DIR, { recursive: true });
}

// Configure multer storage
const embedImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, EMBED_IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    // Get file extension from original filename
    const ext = path.extname(file.originalname);
    // Create unique filename with timestamp and nanoid
    const uniqueName = `${Date.now()}-${nanoid(10)}${ext}`;
    cb(null, uniqueName);
  }
});

// File filter to validate image types
const imageFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.`));
  }
};

// Configure multer upload with size limit (8MB for Discord embeds)
const uploadEmbedImage = multer({
  storage: embedImageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB in bytes
  }
});

interface SocketData {
  userId?: string;
  authorizedServers?: string[]; // Cached list of server IDs user has access to
}

// Helper function to check if a user has access to a server
// User must be an admin in the server AND the bot must be present
async function userHasServerAccess(user: any, serverId: string): Promise<boolean> {
  try {
    // Get user's admin guilds - already parsed as array in deserializeUser
    let userAdminGuilds: any[] = [];
    
    // Check if adminGuilds exists and handle both array and string formats
    if (user.adminGuilds) {
      if (Array.isArray(user.adminGuilds)) {
        // Already parsed as array in deserializeUser
        userAdminGuilds = user.adminGuilds;
      } else if (typeof user.adminGuilds === 'string') {
        // Fallback: parse if it's still a string (shouldn't happen normally)
        try {
          userAdminGuilds = JSON.parse(user.adminGuilds);
        } catch (error) {
          console.error('Failed to parse user admin guilds string:', error);
          return false;
        }
      }
    }
    
    console.log(`Checking access for user ${user.username} to server ${serverId}`);
    console.log(`User has ${userAdminGuilds.length} admin guilds`);
    
    // Check if user is admin in this guild
    const isUserAdmin = userAdminGuilds.some(guild => guild.id === serverId);
    if (!isUserAdmin) {
      console.log(`User is not admin in server ${serverId}`);
      return false;
    }
    
    // Check if bot is present in this guild
    const botGuilds = await getBotGuilds();
    const isBotPresent = botGuilds.some(guild => guild.id === serverId);
    
    if (!isBotPresent) {
      console.log(`Bot is not present in server ${serverId}`);
      return false;
    }
    
    console.log(`User has access to server ${serverId}`);
    return true;
  } catch (error) {
    console.error('Error checking server access:', error);
    return false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Create WebSocket server with a specific path to avoid conflict with Vite's HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Handle WebSocket connections with proper authentication
  wss.on('connection', (ws: WebSocket) => {
    const clientWithData = ws as WebSocket & { data?: SocketData };
    console.log('New WebSocket connection established');
    
    // Set up message handler for authentication
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'auth' && data.userId) {
          // Verify the user exists in our database and cache their authorized servers
          try {
            const user = await storage.getDiscordUser(data.userId);
            if (user) {
              // Parse and cache authorized servers at connection time
              const authorizedServers = user.connectedServers ? JSON.parse(user.connectedServers) : [];
              
              // Store user data with cached authorized servers list
              clientWithData.data = { 
                userId: data.userId,
                authorizedServers: authorizedServers
              };
              
              console.log(`WebSocket client authenticated as user ${data.userId} with access to ${authorizedServers.length} server(s)`);
              
              // Send confirmation
              ws.send(JSON.stringify({
                type: 'auth_success',
                message: 'Authenticated successfully'
              }));
            } else {
              console.log(`WebSocket authentication failed for user ${data.userId} - user not found`);
              ws.send(JSON.stringify({
                type: 'auth_error',
                message: 'Authentication failed'
              }));
              ws.close(1008, 'Authentication failed');
            }
          } catch (error) {
            console.error(`WebSocket authentication error for user ${data.userId}:`, error);
            ws.send(JSON.stringify({
              type: 'auth_error',
              message: 'Authentication error occurred'
            }));
            ws.close(1011, 'Authentication error');
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
    
    // Handle connection error
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connection established. Please authenticate.'
    }));
  });
  
  // Broadcast with server-scoped authorization using cached server lists
  const broadcast = async (data: any) => {
    const serverId = data.data?.serverId || data.serverId;
    
    // SECURITY: All broadcasts MUST include a serverId for proper authorization
    if (!serverId) {
      console.error(`[WebSocket] SECURITY WARNING: Broadcast event ${data.type} missing serverId - event NOT sent`);
      return; // Do not broadcast events without serverId
    }
    
    console.log(`[WebSocket] Broadcasting event: ${data.type}, serverId: ${serverId}`);
    
    const notification = {
      type: data.type,
      data: data.data,
      serverId: serverId,
      timestamp: new Date().toISOString()
    };
    
    // Only broadcast to authenticated clients with cached server access
    let broadcastCount = 0;
    let totalClients = 0;
    let deniedCount = 0;
    
    for (const client of wss.clients) {
      const clientWithData = client as WebSocket & { data?: SocketData };
      
      if (client.readyState === WebSocket.OPEN && clientWithData.data?.userId) {
        totalClients++;
        
        // Check cached authorized servers list (no DB lookup required)
        const authorizedServers = clientWithData.data.authorizedServers || [];
        
        if (authorizedServers.includes(serverId)) {
          try {
            client.send(JSON.stringify(notification));
            broadcastCount++;
          } catch (error) {
            console.error(`[WebSocket] Error sending to client:`, error);
            // Close connection on send error to prevent stuck clients
            client.close(1011, 'Send error');
          }
        } else {
          deniedCount++;
        }
      }
    }
    
    console.log(`[WebSocket] Event sent to ${broadcastCount}/${totalClients} clients (${deniedCount} denied access)`);
  };

  // Health check endpoint for Docker/monitoring
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'discord-bot',
    });
  });

  // Readiness check endpoint - verifies database connectivity
  app.get('/ready', async (req: Request, res: Response) => {
    try {
      // Check database connection
      await db.execute({ sql: 'SELECT 1' });
      res.json({ status: 'ready' });
    } catch (error: any) {
      res.status(503).json({ 
        status: 'not ready', 
        error: 'Database unavailable',
        message: error.message 
      });
    }
  });

  // Detailed bot health endpoint for dashboard
  app.get('/api/bot/health', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { getDiscordClient } = await import('./discord/bot');
      const client = getDiscordClient();
      
      if (!client) {
        return res.status(503).json({
          status: 'down',
          uptime: 0,
          latency: 0,
          guilds: 0,
          users: 0,
          memory: { used: 0, total: 0 }
        });
      }

      // Get memory usage
      const memUsage = process.memoryUsage();
      
      // Calculate total users across all guilds
      let totalUsers = 0;
      client.guilds.cache.forEach(guild => {
        totalUsers += guild.memberCount;
      });

      const health = {
        status: client.ws.ping > 200 ? 'degraded' : 'healthy',
        uptime: Math.floor(process.uptime()),
        latency: client.ws.ping,
        guilds: client.guilds.cache.size,
        users: totalUsers,
        memory: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal
        }
      };

      res.json(health);
    } catch (error) {
      console.error('Error fetching bot health:', error);
      res.status(500).json({ message: 'Failed to fetch bot health' });
    }
  });

  // Bot invite URL endpoint (public endpoint - no auth required)
  app.get('/api/bot/invite-url', async (req: Request, res: Response) => {
    try {
      const clientId = process.env.DISCORD_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ message: 'Discord client ID not configured' });
      }
      
      // Use centralized permission calculation
      const permissionsInteger = calculateBotPermissions();
      const inviteURL = generateDiscordInviteURL(clientId, permissionsInteger);
      
      res.json({ 
        inviteURL,
        permissions: permissionsInteger,
        clientId
      });
    } catch (error) {
      console.error('Error generating bot invite URL:', error);
      res.status(500).json({ message: 'Failed to generate bot invite URL' });
    }
  });

  // Embed image upload endpoint
  app.post('/api/uploads/embed-image', isAuthenticated, (req: Request, res: Response) => {
    uploadEmbedImage.single('image')(req, res, (err: any) => {
      // Handle multer errors
      if (err) {
        if (err instanceof multer.MulterError) {
          // Multer-specific errors
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
              success: false,
              message: 'File too large. Maximum size is 8MB for Discord embeds.' 
            });
          }
          return res.status(400).json({ 
            success: false,
            message: `Upload error: ${err.message}` 
          });
        } else if (err) {
          // Custom errors (like file type validation)
          return res.status(400).json({ 
            success: false,
            message: err.message 
          });
        }
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          message: 'No file uploaded. Please upload an image file.' 
        });
      }

      try {
        // Generate web-accessible URL path
        const filename = req.file.filename;
        const url = `/assets/embed-images/${filename}`;

        console.log(`Embed image uploaded successfully: ${filename}`);

        // Return success response with URL
        res.json({
          success: true,
          url: url
        });
      } catch (error) {
        console.error('Error processing uploaded file:', error);
        
        // Clean up the uploaded file if there was an error
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }
        }
        
        res.status(500).json({ 
          success: false,
          message: 'File system error occurred while processing the upload.' 
        });
      }
    });
  });

  // API routes
  app.get('/api/categories', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const categories = await storage.getAllTicketCategories();
      
      // If user is admin, return all categories
      if (user?.isAdmin) {
        return res.json(categories);
      }
      
      // If user has connected servers, filter by those
      if (user?.connectedServers?.length) {
        const filteredCategories = categories.filter(category => 
          user.connectedServers?.includes(category.serverId || '') || 
          !category.serverId // Include categories without a server ID (global categories)
        );
        return res.json(filteredCategories);
      }
      
      // If no connected servers, return categories without server ID (global categories)
      const globalCategories = categories.filter(category => !category.serverId);
      return res.json(globalCategories.length > 0 ? globalCategories : categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ message: 'Failed to fetch categories' });
    }
  });
  
  app.get('/api/categories/server/:serverId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Check if user has access to this server
      if (!user?.connectedServers?.includes(serverId)) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const categories = await storage.getTicketCategoriesByServerId(serverId);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories by server:', error);
      res.status(500).json({ message: 'Failed to fetch categories' });
    }
  });

  app.post('/api/categories', isAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = insertTicketCategorySchema.parse(req.body);
      const category = await storage.createTicketCategory(validatedData);
      res.status(201).json(category);
      broadcast({ type: 'CATEGORY_CREATED', data: category });
    } catch (error) {
      console.error('Error creating category:', error);
      res.status(400).json({ message: 'Invalid category data' });
    }
  });

  app.delete('/api/categories/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const categoryId = parseInt(req.params.id);
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID' });
      }

      const user = req.user as any;
      
      // Check if the category exists and belongs to a server the user has access to
      const category = await storage.getTicketCategory(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      // Check if user has access to this category's server
      if (category.serverId && !user?.connectedServers?.includes(category.serverId)) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }

      const deleted = await storage.deleteTicketCategory(categoryId);
      if (!deleted) {
        return res.status(404).json({ message: 'Category not found or already deleted' });
      }

      res.json({ message: 'Category deleted successfully' });
      broadcast({ type: 'CATEGORY_DELETED', data: { id: categoryId } });
    } catch (error) {
      console.error('Error deleting category:', error);
      res.status(500).json({ message: 'Failed to delete category' });
    }
  });

  app.post('/api/categories/reset/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Check if user has access to this server
      if (!user?.connectedServers?.includes(serverId)) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }

      // Delete all existing categories for this server
      await storage.deleteTicketCategoriesByServerId(serverId);

      // Create default categories
      const defaultCategories = await storage.createDefaultCategories(serverId);

      res.json({ 
        message: 'Categories reset to defaults successfully', 
        categories: defaultCategories 
      });
      broadcast({ type: 'CATEGORIES_RESET', data: { serverId, categories: defaultCategories } });
    } catch (error) {
      console.error('Error resetting categories:', error);
      res.status(500).json({ message: 'Failed to reset categories' });
    }
  });

  app.get('/api/tickets', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      
      // connectedServers is already parsed as an array in deserializeUser
      const userConnectedServers: string[] = user.connectedServers || [];
      
      console.log(`[Tickets API] User ${user.username} (${user.id}) requesting tickets`);
      console.log(`[Tickets API] User isAdmin: ${user.isAdmin}, connectedServers: ${JSON.stringify(userConnectedServers)}`);
      
      const allTickets = await storage.getAllTickets();
      console.log(`[Tickets API] Total tickets in database: ${allTickets.length}`);
      
      // Filter tickets based on user permissions
      const filteredTickets = allTickets.filter((ticket: any) => {
        // Admins can see tickets from their connected servers + their own tickets from any server
        if (user.isAdmin) {
          const canView = ticket.creatorId === user.id || 
                 (ticket.serverId && userConnectedServers.includes(ticket.serverId)) ||
                 !ticket.serverId; // Include tickets without server association
          if (!canView) {
            console.log(`[Tickets API] Filtering out ticket #${ticket.id} (serverId: ${ticket.serverId})`);
          }
          return canView;
        } else {
          // Non-admins can only see their own tickets
          return ticket.creatorId === user.id;
        }
      });
      
      console.log(`[Tickets API] Returning ${filteredTickets.length} filtered ticket(s) to user`);
      res.json(filteredTickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ message: 'Failed to fetch tickets' });
    }
  });
  
  app.get('/api/tickets/server/:serverId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const serverId = req.params.serverId;
      
      // connectedServers is already parsed as an array in deserializeUser
      const userConnectedServers: string[] = user.connectedServers || [];
      
      // Only admins with access to the server can view server-specific tickets
      if (!user.isAdmin || !userConnectedServers.includes(serverId)) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const tickets = await storage.getTicketsByServerId(serverId);
      res.json(tickets);
    } catch (error) {
      console.error('Error fetching tickets by server:', error);
      res.status(500).json({ message: 'Failed to fetch tickets' });
    }
  });

  app.get('/api/tickets/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: 'Invalid ticket ID' });
      }
      
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      
      // Check if user has access to this ticket
      // connectedServers is already parsed as an array in deserializeUser
      const userConnectedServers: string[] = user.connectedServers || [];
      
      // Allow access if user is creator or admin with server access
      const hasAccess = ticket.creatorId === user.id || 
                       (user.isAdmin && ticket.serverId && userConnectedServers.includes(ticket.serverId)) ||
                       (user.isAdmin && !ticket.serverId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this ticket' });
      }
      
      res.json(ticket);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      res.status(500).json({ message: 'Failed to fetch ticket' });
    }
  });

  app.post('/api/tickets', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const validatedData = insertTicketSchema.parse(req.body);
      
      // Override creatorId with authenticated user (prevent spoofing)
      validatedData.creatorId = user.id;
      
      // For admin users, require server selection
      if (user.isAdmin && !validatedData.serverId) {
        return res.status(400).json({ 
          message: 'Server selection is required for administrators when creating tickets' 
        });
      }
      
      // Validate that user can create tickets for the specified server
      if (validatedData.serverId) {
        // connectedServers is already parsed as an array in deserializeUser
        const userConnectedServers: string[] = user.connectedServers || [];
        
        // Check if user has access to this server (is admin and server is connected)
        if (!user.isAdmin || !userConnectedServers.includes(validatedData.serverId)) {
          return res.status(403).json({ 
            message: 'You do not have permission to create tickets for this server' 
          });
        }
      }
      
      const ticket = await storage.createTicket(validatedData);
      
      // Create Discord thread and send admin notification for dashboard-created tickets
      let discordThreadCreated = false;
      let discordError: string | null = null;
      
      if (ticket.serverId) {
        try {
          const client = getDiscordClient();
          const channelToTicketMap = getChannelToTicketMap();
          
          if (!client) {
            discordError = 'Discord bot not connected';
            throw new Error(discordError);
          }
          
          // Get category for thread embed
          const categoryResult = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
          const category = categoryResult || null;
          
          // Get creator's Discord info
          const creator = await storage.getDiscordUser(ticket.creatorId);
          
          if (!creator) {
            discordError = 'Ticket creator must have a Discord account linked to create Discord threads';
            throw new Error(discordError);
          }
          
          // Create Discord thread with comprehensive embed and action buttons
          const threadId = await createTicketThread({
            storage,
            client,
            ticket,
            category,
            serverId: ticket.serverId,
            creatorDiscordId: creator.id,
            creatorUsername: creator.username,
            channelToTicketMap
          });
          
          if (!threadId) {
            discordError = 'Discord admin notification channel not configured. Please configure it in Settings → Server Setup → Channels.';
            throw new Error(discordError);
          }
          
          discordThreadCreated = true;
          console.log(`[Dashboard Ticket] ✅ Thread created for ticket #${ticket.id}`);
          
          // Send admin notification
          const guild = client.guilds.cache.get(ticket.serverId);
          if (guild && category) {
            // Get Discord User object for creator
            const discordUser = await guild.members.fetch(creator.id).then(m => m.user).catch(() => null);
            if (discordUser) {
              await sendTicketNotificationToAdminChannel(
                ticket.serverId,
                guild,
                storage,
                ticket,
                category,
                'created',
                discordUser
              );
              console.log(`[Dashboard Ticket] ✅ Admin notification sent for ticket #${ticket.id}`);
            }
          }
        } catch (err) {
          // Log the error
          console.error('[Dashboard Ticket] Error creating Discord thread/notification:', err);
          discordError = err instanceof Error ? err.message : 'Unknown Discord integration error';
        }
      }
      
      // Include Discord thread status in response
      const response = {
        ...ticket,
        discord: {
          threadCreated: discordThreadCreated,
          error: discordError
        }
      };
      
      res.status(201).json(response);
      broadcast({ type: 'TICKET_CREATED', data: ticket });
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(400).json({ message: 'Invalid ticket data' });
    }
  });

  app.patch('/api/tickets/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: 'Invalid ticket ID' });
      }
      
      // First, get the ticket to check permissions
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      
      // Check if user has write access to this ticket
      // connectedServers is already parsed as an array in deserializeUser
      const userConnectedServers: string[] = user.connectedServers || [];
      
      const hasWriteAccess = ticket.creatorId === user.id || 
                            (user.isAdmin && ticket.serverId && userConnectedServers.includes(ticket.serverId)) ||
                            (user.isAdmin && !ticket.serverId);
      
      if (!hasWriteAccess) {
        return res.status(403).json({ message: 'Access denied to modify this ticket' });
      }
      
      const validatedData = ticketUpdateSchema.parse(req.body);
      
      const updatedTicket = await storage.updateTicket(ticketId, validatedData);
      if (!updatedTicket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      
      // Sync ticket status to Discord thread if status was changed
      if (validatedData.status && ticket.serverId) {
        try {
          const client = getDiscordClient();
          if (client) {
            const botSettings = await storage.getBotSettings(ticket.serverId);
            if (botSettings?.threadBidirectionalSync) {
              await syncTicketStatusToThread(
                { storage, client, broadcast },
                ticketId,
                validatedData.status
              );
              console.log(`[Thread Sync] Synced ticket status to Discord thread for ticket ${ticketId}`);
            }
          }
        } catch (syncError) {
          // Log error but don't fail the request
          console.error('[Thread Sync] Error syncing ticket status to Discord thread:', syncError);
        }
      }
      
      res.json(updatedTicket);
      broadcast({ type: 'TICKET_UPDATED', data: updatedTicket });
    } catch (error) {
      console.error('Error updating ticket:', error);
      res.status(400).json({ message: 'Invalid ticket data' });
    }
  });

  app.delete('/api/tickets/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: 'Invalid ticket ID' });
      }
      
      // First, get the ticket to check permissions
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      
      // Only admins can delete tickets
      // connectedServers is already parsed as an array in deserializeUser
      const userConnectedServers: string[] = user.connectedServers || [];
      
      const isAdmin = user.isAdmin && ticket.serverId && userConnectedServers.includes(ticket.serverId);
      
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only server administrators can delete tickets' });
      }
      
      // Create audit log before deletion
      try {
        await storage.createTicketAuditLog({
          ticketId,
          action: 'deleted',
          performedBy: user.id,
          performedByUsername: user.username || user.discordUsername || 'Unknown',
          details: JSON.stringify({ deletedAt: new Date().toISOString() }),
          serverId: ticket.serverId || undefined
        });
      } catch (auditError) {
        console.error('Error creating audit log for ticket deletion:', auditError);
      }
      
      const success = await storage.deleteTicket(ticketId);
      if (!success) {
        return res.status(500).json({ message: 'Failed to delete ticket' });
      }
      
      res.json({ message: 'Ticket deleted successfully' });
      broadcast({ 
        type: 'TICKET_DELETED', 
        data: { id: ticketId, serverId: ticket.serverId } 
      });
    } catch (error) {
      console.error('Error deleting ticket:', error);
      res.status(500).json({ message: 'Failed to delete ticket' });
    }
  });

  app.get('/api/tickets/:id/messages', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: 'Invalid ticket ID' });
      }
      
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      
      // Check if user has access to this ticket's messages
      // connectedServers is already parsed as an array in deserializeUser
      const userConnectedServers: string[] = user.connectedServers || [];
      
      const hasAccess = ticket.creatorId === user.id || 
                       (user.isAdmin && ticket.serverId && userConnectedServers.includes(ticket.serverId)) ||
                       (user.isAdmin && !ticket.serverId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this ticket messages' });
      }
      
      const messages = await storage.getTicketMessages(ticketId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching ticket messages:', error);
      res.status(500).json({ message: 'Failed to fetch ticket messages' });
    }
  });

  app.post('/api/tickets/:id/messages', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: 'Invalid ticket ID' });
      }
      
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }
      
      // Check if user has access to post messages to this ticket
      // connectedServers is already parsed as an array in deserializeUser
      const userConnectedServers: string[] = user.connectedServers || [];
      
      const hasAccess = ticket.creatorId === user.id || 
                       (user.isAdmin && ticket.serverId && userConnectedServers.includes(ticket.serverId)) ||
                       (user.isAdmin && !ticket.serverId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to post messages to this ticket' });
      }
      
      const messageData = {
        ...req.body,
        ticketId,
        senderId: user.id // Override senderId to prevent spoofing
      };
      
      const validatedData = insertTicketMessageSchema.parse(messageData);
      const message = await storage.createTicketMessage(validatedData);
      
      // Sync message to Discord thread if bidirectional sync is enabled
      try {
        const client = getDiscordClient();
        if (client && ticket.serverId) {
          const botSettings = await storage.getBotSettings(ticket.serverId);
          if (botSettings?.threadBidirectionalSync) {
            await syncDashboardMessageToThread(
              { storage, client, broadcast },
              ticketId,
              validatedData.content,
              validatedData.senderUsername || user.username
            );
            console.log(`[Thread Sync] Synced dashboard message to Discord thread for ticket ${ticketId}`);
          }
        }
      } catch (syncError) {
        // Log error but don't fail the request
        console.error('[Thread Sync] Error syncing message to Discord thread:', syncError);
      }
      
      res.status(201).json(message);
      broadcast({ 
        type: 'MESSAGE_CREATED', 
        data: { ticketId, message } 
      });
    } catch (error) {
      console.error('Error creating ticket message:', error);
      res.status(400).json({ message: 'Invalid message data' });
    }
  });

  // Ticket resolution routes
  app.get('/api/tickets/:id/resolutions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id);
      const resolutions = await storage.getTicketResolutions(ticketId);
      res.json(resolutions);
    } catch (error) {
      console.error('Error fetching ticket resolutions:', error);
      res.status(500).json({ message: 'Failed to fetch ticket resolutions' });
    }
  });
  
  app.post('/api/tickets/:id/resolutions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id);
      const user = req.user as any;
      
      const resolutionData = {
        ...req.body,
        ticketId,
        resolvedBy: user.id,
        resolvedByUsername: user.username
      };
      
      const { insertTicketResolutionSchema } = await import('@shared/schema');
      const validatedData = insertTicketResolutionSchema.parse(resolutionData);
      const resolution = await storage.createTicketResolution(validatedData);
      
      // Update ticket status if provided
      if (req.body.updateStatus) {
        await storage.updateTicket(ticketId, { status: req.body.updateStatus });
      }
      
      // Create audit log entry
      await storage.createTicketAuditLog({
        ticketId,
        action: 'resolved',
        performedBy: user.id,
        performedByUsername: user.username,
        details: JSON.stringify({
          resolutionType: resolution.resolutionType,
          notes: resolution.resolutionNotes
        }),
        serverId: req.body.serverId
      });
      
      res.status(201).json(resolution);
      broadcast({ type: 'TICKET_RESOLVED', data: resolution });
    } catch (error) {
      console.error('Error creating ticket resolution:', error);
      res.status(400).json({ message: 'Invalid resolution data' });
    }
  });
  
  // Ticket audit log routes
  app.get('/api/tickets/:id/audit-logs', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id);
      const logs = await storage.getTicketAuditLogs(ticketId);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ message: 'Failed to fetch audit logs' });
    }
  });
  
  app.post('/api/tickets/:id/audit-logs', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id);
      const user = req.user as any;
      
      const logData = {
        ...req.body,
        ticketId,
        performedBy: user.id,
        performedByUsername: user.username
      };
      
      const { insertTicketAuditLogSchema } = await import('@shared/schema');
      const validatedData = insertTicketAuditLogSchema.parse(logData);
      const log = await storage.createTicketAuditLog(validatedData);
      
      res.status(201).json(log);
    } catch (error) {
      console.error('Error creating audit log:', error);
      res.status(400).json({ message: 'Invalid audit log data' });
    }
  });

  // Export/Import tickets
  app.get('/api/tickets/export/:serverId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const serverId = req.params.serverId;

      // Verify user has access to this server
      if (!user.connectedServers || !user.connectedServers.includes(serverId)) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }

      // Fetch all tickets for this server
      const tickets = await storage.getTicketsByServerId(serverId);
      
      // Fetch all ticket-related data
      const exportData: any = {
        exportDate: new Date().toISOString(),
        serverId,
        tickets: [],
        categories: await storage.getTicketCategoriesByServerId(serverId),
      };

      // For each ticket, fetch messages, resolutions, and audit logs
      for (const ticket of tickets) {
        const messages = await storage.getTicketMessages(ticket.id);
        const resolutions = await storage.getTicketResolutions(ticket.id);
        const auditLogs = await storage.getTicketAuditLogs(ticket.id);

        exportData.tickets.push({
          ...ticket,
          messages,
          resolutions,
          auditLogs
        });
      }

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="tickets-export-${serverId}-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting tickets:', error);
      res.status(500).json({ message: 'Failed to export tickets' });
    }
  });

  app.post('/api/tickets/import/:serverId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const serverId = req.params.serverId;
      const importData = req.body;

      // Verify user has admin access to this server
      if (!user.isAdmin) {
        return res.status(403).json({ message: 'Admin access required for import' });
      }

      if (!user.connectedServers || !user.connectedServers.includes(serverId)) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }

      // Validate import data structure
      if (!importData.tickets || !Array.isArray(importData.tickets)) {
        return res.status(400).json({ message: 'Invalid import data format' });
      }

      const results = {
        imported: 0,
        failed: 0,
        errors: [] as string[]
      };

      // Build category name to new ID mapping
      const categoryIdMap = new Map<number, number>(); // old ID -> new ID
      const categoryNameMap = new Map<string, number>(); // name -> new ID

      // Import categories first (if they don't already exist)
      if (importData.categories && Array.isArray(importData.categories)) {
        for (const category of importData.categories) {
          try {
            // Check if category already exists
            const existingCategories = await storage.getTicketCategoriesByServerId(serverId);
            const existingCategory = existingCategories.find((c: any) => c.name === category.name);
            
            if (existingCategory) {
              // Map old ID to existing ID
              categoryIdMap.set(category.id, existingCategory.id);
              categoryNameMap.set(category.name, existingCategory.id);
            } else {
              // Create new category
              const newCategory = await storage.createTicketCategory({
                name: category.name,
                emoji: category.emoji || '🎫',
                color: category.color || '#5865F2',
                serverId
              });
              // Map old ID to new ID
              categoryIdMap.set(category.id, newCategory.id);
              categoryNameMap.set(category.name, newCategory.id);
            }
          } catch (error) {
            console.error('Error importing category:', error);
          }
        }
      }

      // Import tickets
      for (const ticketData of importData.tickets) {
        try {
          // Create ticket (without id to avoid conflicts)
          const { id, messages, resolutions, auditLogs, ...ticketInfo } = ticketData;
          
          // Remap category ID if it exists
          if (ticketInfo.categoryId && categoryIdMap.has(ticketInfo.categoryId)) {
            ticketInfo.categoryId = categoryIdMap.get(ticketInfo.categoryId);
          }
          
          const newTicket = await storage.createTicket({
            ...ticketInfo,
            serverId, // Ensure correct serverId
          });

          // Import messages
          if (messages && Array.isArray(messages)) {
            for (const message of messages) {
              await storage.createTicketMessage({
                ticketId: newTicket.id,
                senderId: message.senderId,
                content: message.content,
                senderUsername: message.senderUsername
              });
            }
          }

          // Import resolutions
          if (resolutions && Array.isArray(resolutions)) {
            for (const resolution of resolutions) {
              await storage.createTicketResolution({
                ticketId: newTicket.id,
                resolutionType: resolution.resolutionType,
                resolutionNotes: resolution.resolutionNotes,
                actionTaken: resolution.actionTaken,
                resolvedBy: resolution.resolvedBy,
                resolvedByUsername: resolution.resolvedByUsername,
                serverId
              });
            }
          }

          // Import audit logs
          if (auditLogs && Array.isArray(auditLogs)) {
            for (const log of auditLogs) {
              await storage.createTicketAuditLog({
                ticketId: newTicket.id,
                action: log.action,
                performedBy: log.performedBy,
                performedByUsername: log.performedByUsername,
                details: log.details,
                serverId
              });
            }
          }

          results.imported++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Failed to import ticket: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error('Error importing ticket:', error);
        }
      }

      res.json(results);
      
      // Broadcast update
      broadcast({ 
        type: 'TICKETS_IMPORTED', 
        data: { serverId, imported: results.imported } 
      });
    } catch (error) {
      console.error('Error importing tickets:', error);
      res.status(500).json({ message: 'Failed to import tickets' });
    }
  });

  // Server routes
  app.get('/api/servers', isAdmin, async (_req: Request, res: Response) => {
    try {
      const servers = await storage.getAllServers();
      res.json(servers);
    } catch (error) {
      console.error('Error fetching servers:', error);
      res.status(500).json({ message: 'Failed to fetch servers' });
    }
  });

  app.get('/api/servers/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      const server = await storage.getServer(serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }
      res.json(server);
    } catch (error) {
      console.error('Error fetching server:', error);
      res.status(500).json({ message: 'Failed to fetch server' });
    }
  });

  app.post('/api/servers', isAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = insertServerSchema.parse(req.body);
      const server = await storage.createServer(validatedData);
      res.status(201).json(server);
    } catch (error) {
      console.error('Error creating server:', error);
      res.status(400).json({ message: 'Invalid server data' });
    }
  });

  app.patch('/api/servers/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.id;
      const updateSchema = insertServerSchema.partial();
      const validatedData = updateSchema.parse(req.body);
      
      const updatedServer = await storage.updateServer(serverId, validatedData);
      if (!updatedServer) {
        return res.status(404).json({ message: 'Server not found' });
      }
      
      res.json(updatedServer);
    } catch (error) {
      console.error('Error updating server:', error);
      res.status(400).json({ message: 'Invalid server data' });
    }
  });

  // Bot settings routes
  app.get('/api/bot-settings/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const settings = await storage.getBotSettings(serverId);
      if (!settings) {
        return res.status(404).json({ message: 'Bot settings not found' });
      }
      res.json(settings);
    } catch (error) {
      console.error('Error fetching bot settings:', error);
      res.status(500).json({ message: 'Failed to fetch bot settings' });
    }
  });

  app.post('/api/bot-settings', isAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = insertBotSettingsSchema.parse(req.body);
      const settings = await storage.createBotSettings(validatedData);
      
      // Create default categories for new server
      try {
        const existingCategories = await storage.getTicketCategoriesByServerId(validatedData.serverId);
        if (existingCategories.length === 0) {
          await storage.createDefaultCategories(validatedData.serverId);
          console.log(`Created default categories for server ${validatedData.serverId}`);
        }
      } catch (categoryError) {
        console.error('Error creating default categories:', categoryError);
        // Don't fail the whole request if categories fail
      }
      
      res.status(201).json(settings);
    } catch (error) {
      console.error('Error creating bot settings:', error);
      res.status(400).json({ message: 'Invalid bot settings data' });
    }
  });

  app.patch('/api/bot-settings/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const updateSchema = insertBotSettingsSchema.partial();
      const validatedData = updateSchema.parse(req.body);
      
      const updatedSettings = await storage.updateBotSettings(serverId, validatedData);
      if (!updatedSettings) {
        return res.status(404).json({ message: 'Bot settings not found' });
      }
      
      // If botNickname was updated, apply it to Discord
      if ('botNickname' in validatedData) {
        try {
          const { setBotNickname } = await import('./discord/bot');
          const result = await setBotNickname(serverId, validatedData.botNickname || null);
          if (!result.success) {
            console.warn(`Failed to set bot nickname: ${result.message}`);
            // Don't fail the whole request, just log the warning
          } else {
            console.log(`Bot nickname updated successfully: ${result.message}`);
          }
        } catch (nicknameError) {
          console.error('Error setting bot nickname:', nicknameError);
          // Don't fail the whole request
        }
      }
      
      res.json(updatedSettings);
    } catch (error) {
      console.error('Error updating bot settings:', error);
      res.status(400).json({ message: 'Invalid bot settings data' });
    }
  });

  // Discord server auto-population route
  app.get('/api/discord/server-info/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const { getDiscordClient } = await import('./discord/bot');
      const client = getDiscordClient();
      
      if (!client || !client.guilds) {
        return res.status(503).json({ message: 'Discord bot not available' });
      }

      const guild = client.guilds.cache.get(serverId);
      if (!guild) {
        return res.status(404).json({ message: 'Server not found or bot not in server' });
      }

      // Fetch roles (excluding @everyone and bot roles)
      const roles = guild.roles.cache
        .filter(role => role.name !== '@everyone' && !role.managed)
        .map(role => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        }))
        .sort((a, b) => b.position - a.position);

      // Fetch text channels
      const channels = guild.channels.cache
        .filter(channel => channel.type === 0) // Text channels
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type, // Include type for client-side verification
          category: channel.parent?.name || null
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        server: {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL(),
          memberCount: guild.memberCount
        },
        roles,
        channels
      });
    } catch (error) {
      console.error('Error fetching Discord server info:', error);
      res.status(500).json({ message: 'Failed to fetch server information' });
    }
  });

  // Discord voice channels endpoint
  app.get('/api/discord/:serverId/voice-channels', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const { getDiscordClient } = await import('./discord/bot');
      const client = getDiscordClient();
      
      if (!client || !client.guilds) {
        return res.status(503).json({ message: 'Discord bot not available' });
      }

      const guild = client.guilds.cache.get(serverId);
      if (!guild) {
        return res.status(404).json({ message: 'Server not found or bot not in server' });
      }

      // Fetch voice channels (type === 2)
      const voiceChannels = guild.channels.cache
        .filter(channel => channel.type === 2) // Voice channels
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          category: channel.parent?.name || null
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json(voiceChannels);
    } catch (error) {
      console.error('Error fetching Discord voice channels:', error);
      res.status(500).json({ message: 'Failed to fetch voice channels' });
    }
  });

  // Discord user info endpoint
  app.get('/api/discord/users/:userId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const guildId = req.query.guildId as string;
      
      const discordUser = await storage.getDiscordUser(userId);
      
      if (!discordUser) {
        // Try to fetch user from Discord API if not in our database
        const { fetchDiscordUser } = await import('./discord/bot');
        const discordApiUser = await fetchDiscordUser(userId);
        
        if (!discordApiUser) {
          return res.status(404).json({ message: 'Discord user not found' });
        }
        
        // Return basic Discord API data
        return res.json({
          id: discordApiUser.id,
          username: discordApiUser.username,
          discriminator: discordApiUser.discriminator,
          displayName: discordApiUser.displayName,
          avatar: discordApiUser.avatar,
          source: 'discord_api'
        });
      }

      // If we have guild context, try to fetch enhanced member data
      if (guildId) {
        const { fetchGuildMember } = await import('./discord/bot');
        const memberData = await fetchGuildMember(guildId, userId);
        
        if (memberData) {
          return res.json({
            id: memberData.id,
            username: memberData.username,
            discriminator: memberData.discriminator,
            displayName: memberData.displayName,
            nickname: memberData.nickname,
            avatar: memberData.avatar,
            guildAvatar: memberData.guildAvatar,
            roles: memberData.roles,
            source: 'guild_member'
          });
        }
      }

      // Fallback to stored user data with potential Discord API enhancement
      const { fetchDiscordUser } = await import('./discord/bot');
      const discordApiUser = await fetchDiscordUser(userId);
      
      if (discordApiUser) {
        // Return enhanced data combining stored and API data
        return res.json({
          id: discordUser.id,
          username: discordApiUser.username,
          discriminator: discordApiUser.discriminator,
          displayName: discordApiUser.displayName,
          avatar: discordApiUser.avatar,
          source: 'enhanced'
        });
      }

      // Return basic stored user information as fallback
      res.json({
        id: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        displayName: discordUser.username, // Fallback to username as display name
        avatar: discordUser.avatar,
        source: 'database'
      });
    } catch (error) {
      console.error('Error fetching Discord user:', error);
      res.status(500).json({ message: 'Failed to fetch Discord user' });
    }
  });

  // Admin-specific routes
  app.get('/api/admin/stats', isAdmin, async (_req: Request, res: Response) => {
    try {
      const tickets = await storage.getAllTickets();
      const categories = await storage.getAllTicketCategories();
      const discordUsers = await storage.getAllDiscordUsers();
      
      const openTickets = tickets.filter(ticket => ticket.status === 'open').length;
      const closedTickets = tickets.filter(ticket => ticket.status === 'closed').length;
      const pendingTickets = tickets.filter(ticket => ticket.status === 'pending').length;
      
      const stats = {
        ticketCounts: {
          total: tickets.length,
          open: openTickets,
          closed: closedTickets,
          pending: pendingTickets
        },
        categoryStats: categories.map(category => {
          const categoryTickets = tickets.filter(ticket => ticket.categoryId === category.id);
          return {
            id: category.id,
            name: category.name,
            count: categoryTickets.length,
            openCount: categoryTickets.filter(ticket => ticket.status === 'open').length
          };
        }),
        userStats: {
          totalUsers: discordUsers.length,
          adminUsers: discordUsers.filter(user => user.isAdmin).length
        }
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      res.status(500).json({ message: 'Failed to fetch admin stats' });
    }
  });

  /**
   * Get Admin Users Endpoint
   * 
   * This endpoint retrieves all Discord users marked as administrators in the system.
   * It's specifically designed to provide a simple, reliable data source for the staff
   * assignment feature in the ticket management system.
   * 
   * Why this endpoint is needed:
   * - Provides a clean, dedicated API for fetching admin users
   * - Works reliably on fresh systems where no tickets have been assigned yet
   * - Returns only the essential user data needed for assignment dropdowns
   * - More efficient than fetching all tickets and extracting assignees
   * 
   * Security:
   * - Protected by isAdmin middleware - only administrators can access
   * - Returns only basic, non-sensitive user information
   * - Filters users by isAdmin flag in the database
   * 
   * Response format:
   * Returns an array of admin user objects with the following fields:
   * - id: Discord user ID (used for assignment)
   * - username: Discord username
   * - discriminator: Discord discriminator (e.g., #1234)
   * - avatar: Discord avatar hash (for displaying user avatars)
   * 
   * @route GET /api/admin/users
   * @access Admin only
   * @returns {Array} Array of admin user objects with basic info
   */
  app.get('/api/admin/users', isAdmin, async (req: Request, res: Response) => {
    try {
      // Fetch all Discord users from the database
      const allUsers = await storage.getAllDiscordUsers();
      
      // Filter to only include users with admin privileges
      // This ensures we only show staff members who can be assigned to tickets
      const adminUsers = allUsers.filter(user => user.isAdmin);
      
      // Map to return only the essential fields needed for the assignment dropdown
      // This reduces payload size and ensures we don't leak unnecessary user data
      const adminList = adminUsers.map(user => ({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar
      }));
      
      console.log(`[Admin Users API] Returning ${adminList.length} admin user(s)`);
      res.json(adminList);
    } catch (error) {
      console.error('Error fetching admin users:', error);
      res.status(500).json({ message: 'Failed to fetch admin users' });
    }
  });

  // Discord channel management endpoints
  app.get('/api/discord/channels', isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      console.log(`Fetching Discord channels for user ${user.id} (${user.username})`);
      
      // Get user's admin guilds (already parsed in deserializeUser)
      const userAdminGuilds: any[] = user.adminGuilds || [];
      if (userAdminGuilds.length > 0) {
        console.log(`User ${user.id} has admin permissions in ${userAdminGuilds.length} servers:`, 
          userAdminGuilds.map(g => `${g.name} (${g.id})`));
      } else {
        console.log(`User ${user.id} has no admin guilds data`);
      }
      
      // Get bot guilds information
      const botGuilds = await getBotGuilds();
      console.log(`Bot is present in ${botGuilds.length} servers:`, 
        botGuilds.map(g => `${g.name} (${g.id})`));
      
      // Find intersection: servers where user is admin AND bot is present
      const accessibleGuilds = botGuilds.filter(botGuild => 
        userAdminGuilds.some(userGuild => userGuild.id === botGuild.id)
      );
      
      console.log(`Accessible servers for user ${user.id}: ${accessibleGuilds.length} servers where user is admin AND bot is present:`,
        accessibleGuilds.map(g => `${g.name} (${g.id})`));
      
      // Fetch channels for each accessible guild
      const serversWithChannels = await Promise.all(
        accessibleGuilds.map(async (guild) => {
          const channels = await fetchGuildChannels(guild.id);
          return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            memberCount: guild.memberCount,
            permissions: guild.permissions,
            channels: channels || []
          };
        })
      );
      
      res.json({
        servers: serversWithChannels,
        totalChannels: serversWithChannels.reduce((total, server) => total + server.channels.length, 0)
      });
    } catch (error) {
      console.error('Error fetching Discord channels:', error);
      res.status(500).json({ message: 'Failed to fetch Discord channels' });
    }
  });
  
  app.post('/api/discord/send-ticket-panel', isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { channelId, guildId } = req.body;
      
      if (!channelId || !guildId) {
        return res.status(400).json({ message: 'Channel ID and Guild ID are required' });
      }
      
      // Verify user has access to this guild (user is admin AND bot is present)
      // adminGuilds is already parsed in deserializeUser
      const userAdminGuilds: any[] = user.adminGuilds || [];
      
      // Check if user is admin in this guild
      const isUserAdmin = userAdminGuilds.some(guild => guild.id === guildId);
      if (!isUserAdmin) {
        return res.status(403).json({ message: 'You must be an admin in this server' });
      }
      
      // Check if bot is present in this guild
      const botGuilds = await getBotGuilds();
      const isBotPresent = botGuilds.some(guild => guild.id === guildId);
      if (!isBotPresent) {
        return res.status(403).json({ message: 'Bot is not present in this server' });
      }
      
      // Validate input
      const schema = z.object({
        channelId: z.string().min(1),
        guildId: z.string().min(1)
      });
      
      const validatedData = schema.parse({ channelId, guildId });
      
      // Send ticket panel to the specified channel
      const result = await sendTicketPanelToChannel(validatedData.channelId, validatedData.guildId, storage);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Ticket panel sent successfully',
          messageId: result.messageId
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error || 'Failed to send ticket panel'
        });
      }
    } catch (error) {
      console.error('Error sending ticket panel:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid request data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to send ticket panel' });
      }
    }
  });

  // Panel Settings Endpoints
  app.get('/api/panel-settings/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      let settings = await storage.getTicketPanelSettings(serverId);
      
      // Create default settings if none exist
      if (!settings) {
        settings = await storage.createTicketPanelSettings({ serverId });
        // Also create default categories
        await storage.resetTicketPanelSettings(serverId);
        settings = await storage.getTicketPanelSettings(serverId);
      }
      
      res.json(settings);
    } catch (error) {
      console.error('Error fetching panel settings:', error);
      res.status(500).json({ message: 'Failed to fetch panel settings' });
    }
  });

  app.put('/api/panel-settings/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const validatedData = updateTicketPanelSettingsSchema.parse(req.body);
      
      // Ensure settings exist
      let settings = await storage.getTicketPanelSettings(serverId);
      if (!settings) {
        settings = await storage.createTicketPanelSettings({ serverId });
      }
      
      const updatedSettings = await storage.updateTicketPanelSettings(serverId, validatedData);
      if (!updatedSettings) {
        return res.status(404).json({ message: 'Panel settings not found' });
      }
      
      res.json(updatedSettings);
    } catch (error) {
      console.error('Error updating panel settings:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid panel settings data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to update panel settings' });
      }
    }
  });

  app.post('/api/panel-settings/:serverId/reset', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      // Reset to default settings (this also creates default categories)
      const defaultSettings = await storage.resetTicketPanelSettings(serverId);
      
      res.json({
        settings: defaultSettings,
        message: 'Panel settings reset to defaults successfully'
      });
    } catch (error) {
      console.error('Error resetting panel settings:', error);
      res.status(500).json({ message: 'Failed to reset panel settings' });
    }
  });

  // Category Management Endpoints
  app.get('/api/panel-categories/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const categories = await storage.getTicketPanelCategories(serverId);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching panel categories:', error);
      res.status(500).json({ message: 'Failed to fetch panel categories' });
    }
  });

  app.post('/api/panel-categories/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const categoryData = { ...req.body, serverId };
      const validatedData = insertTicketPanelCategorySchema.parse(categoryData);
      
      const category = await storage.createTicketPanelCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      console.error('Error creating panel category:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid category data', errors: error.errors });
      } else if (error instanceof Error && error.message === 'Maximum of 25 categories allowed per server') {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: 'Failed to create category' });
      }
    }
  });

  app.put('/api/panel-categories/:serverId/:categoryId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const categoryId = parseInt(req.params.categoryId);
      const user = req.user as any;
      
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID' });
      }
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      // Verify category belongs to this server
      const existingCategory = await storage.getTicketPanelCategory(categoryId);
      if (!existingCategory || existingCategory.serverId !== serverId) {
        return res.status(404).json({ message: 'Category not found or access denied' });
      }
      
      const validatedData = updateTicketPanelCategorySchema.parse(req.body);
      
      const updatedCategory = await storage.updateTicketPanelCategory(categoryId, validatedData);
      if (!updatedCategory) {
        return res.status(404).json({ message: 'Category not found' });
      }
      
      res.json(updatedCategory);
    } catch (error) {
      console.error('Error updating panel category:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid category data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to update category' });
      }
    }
  });

  app.delete('/api/panel-categories/:serverId/:categoryId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const categoryId = parseInt(req.params.categoryId);
      const user = req.user as any;
      
      if (isNaN(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID' });
      }
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      // Verify category belongs to this server
      const existingCategory = await storage.getTicketPanelCategory(categoryId);
      if (!existingCategory || existingCategory.serverId !== serverId) {
        return res.status(404).json({ message: 'Category not found or access denied' });
      }
      
      const deleted = await storage.deleteTicketPanelCategory(categoryId);
      if (!deleted) {
        return res.status(404).json({ message: 'Category not found' });
      }
      
      res.json({ message: 'Category deleted successfully' });
    } catch (error) {
      console.error('Error deleting panel category:', error);
      res.status(500).json({ message: 'Failed to delete category' });
    }
  });

  app.put('/api/panel-categories/:serverId/reorder', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      // Validate the reorder data
      const reorderSchema = z.object({
        categories: z.array(z.object({
          id: z.number(),
          sortOrder: z.number()
        }))
      });
      
      const { categories } = reorderSchema.parse(req.body);
      
      // Verify all categories belong to this server
      for (const { id } of categories) {
        const category = await storage.getTicketPanelCategory(id);
        if (!category || category.serverId !== serverId) {
          return res.status(400).json({ 
            message: `Category ${id} not found or does not belong to this server` 
          });
        }
      }
      
      const reorderedCategories = await storage.reorderTicketPanelCategories(serverId, categories);
      res.json(reorderedCategories);
    } catch (error) {
      console.error('Error reordering panel categories:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid reorder data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to reorder categories' });
      }
    }
  });

  // Panel Templates API Endpoints
  
  // GET all panel templates for all servers the user has access to
  app.get('/api/panel-templates', isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      
      // Get user's admin guilds
      let userAdminGuilds: any[] = [];
      
      if (user.adminGuilds) {
        if (Array.isArray(user.adminGuilds)) {
          userAdminGuilds = user.adminGuilds;
        } else if (typeof user.adminGuilds === 'string') {
          try {
            userAdminGuilds = JSON.parse(user.adminGuilds);
          } catch (error) {
            console.error('Failed to parse user admin guilds:', error);
            return res.json([]);
          }
        }
      }
      
      // Get bot guilds
      const botGuilds = await getBotGuilds();
      
      // Find servers where user is admin AND bot is present
      const accessibleServerIds = userAdminGuilds
        .filter(userGuild => botGuilds.some(botGuild => botGuild.id === userGuild.id))
        .map(guild => guild.id);
      
      if (accessibleServerIds.length === 0) {
        return res.json([]);
      }
      
      // Fetch all templates for accessible servers
      const allTemplates: any[] = [];
      for (const serverId of accessibleServerIds) {
        const templates = await storage.getPanelTemplates(serverId);
        
        // Get fields and buttons for each template
        for (const template of templates) {
          const fields = await storage.getPanelTemplateFields(template.id);
          const buttons = await storage.getPanelTemplateButtons(template.id);
          
          allTemplates.push({
            ...template,
            serverId, // Ensure serverId is included for client-side use
            fields: fields.filter((f: any) => f.isEnabled),
            buttons: buttons.filter((b: any) => b.isEnabled)
          });
        }
      }
      
      return res.json(allTemplates);
    } catch (error) {
      console.error('Error fetching all panel templates:', error);
      return res.status(500).json({ message: 'Failed to fetch templates' });
    }
  });
  
  app.get('/api/panel-templates/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const templates = await storage.getPanelTemplates(serverId);
      
      // For each template, also fetch its fields and buttons
      const templatesWithDetails = await Promise.all(templates.map(async (template) => {
        const fields = await storage.getPanelTemplateFields(template.id);
        const buttons = await storage.getPanelTemplateButtons(template.id);
        return { ...template, fields, buttons };
      }));
      
      res.json(templatesWithDetails);
    } catch (error) {
      console.error('Error fetching panel templates:', error);
      res.status(500).json({ message: 'Failed to fetch panel templates' });
    }
  });
  
  app.get('/api/panel-templates/:serverId/:templateId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const templateId = parseInt(req.params.templateId);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const template = await storage.getPanelTemplate(templateId);
      if (!template || template.serverId !== serverId) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      const fields = await storage.getPanelTemplateFields(templateId);
      const buttons = await storage.getPanelTemplateButtons(templateId);
      
      res.json({ ...template, fields, buttons });
    } catch (error) {
      console.error('Error fetching panel template:', error);
      res.status(500).json({ message: 'Failed to fetch panel template' });
    }
  });
  
  app.post('/api/panel-templates/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const { template: templateData, fields = [], buttons = [] } = req.body;
      
      const validatedTemplate = insertPanelTemplateSchema.parse({ ...templateData, serverId });
      const createdTemplate = await storage.createPanelTemplate(validatedTemplate);
      
      // Create fields
      const createdFields = await Promise.all(
        fields.map((field: any) => storage.createPanelTemplateField({
          ...field,
          templateId: createdTemplate.id
        }))
      );
      
      // Create buttons
      const createdButtons = await Promise.all(
        buttons.map((button: any) => storage.createPanelTemplateButton({
          ...button,
          templateId: createdTemplate.id
        }))
      );
      
      res.status(201).json({ 
        ...createdTemplate, 
        fields: createdFields, 
        buttons: createdButtons 
      });
    } catch (error) {
      console.error('Error creating panel template:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid template data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to create panel template' });
      }
    }
  });
  
  app.put('/api/panel-templates/:serverId/:templateId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const templateId = parseInt(req.params.templateId);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      // Verify template belongs to this server
      const existingTemplate = await storage.getPanelTemplate(templateId);
      if (!existingTemplate || existingTemplate.serverId !== serverId) {
        return res.status(404).json({ message: 'Template not found or access denied' });
      }
      
      const { template: templateData, fields = [], buttons = [] } = req.body;
      
      const validatedTemplate = updatePanelTemplateSchema.parse(templateData);
      const updatedTemplate = await storage.updatePanelTemplate(templateId, validatedTemplate);
      
      // Handle fields: delete existing and recreate
      const existingFields = await storage.getPanelTemplateFields(templateId);
      await Promise.all(existingFields.map(field => storage.deletePanelTemplateField(field.id)));
      
      const createdFields = await Promise.all(
        fields.map((field: any) => storage.createPanelTemplateField({
          ...field,
          templateId
        }))
      );
      
      // Handle buttons: delete existing and recreate
      const existingButtons = await storage.getPanelTemplateButtons(templateId);
      await Promise.all(existingButtons.map(button => storage.deletePanelTemplateButton(button.id)));
      
      const createdButtons = await Promise.all(
        buttons.map((button: any) => storage.createPanelTemplateButton({
          ...button,
          templateId
        }))
      );
      
      res.json({ 
        ...updatedTemplate, 
        fields: createdFields, 
        buttons: createdButtons 
      });
    } catch (error) {
      console.error('Error updating panel template:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid template data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to update panel template' });
      }
    }
  });
  
  app.delete('/api/panel-templates/:serverId/:templateId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const templateId = parseInt(req.params.templateId);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      // Verify template belongs to this server
      const existingTemplate = await storage.getPanelTemplate(templateId);
      if (!existingTemplate || existingTemplate.serverId !== serverId) {
        return res.status(404).json({ message: 'Template not found or access denied' });
      }
      
      const deleted = await storage.deletePanelTemplate(templateId);
      if (!deleted) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      res.json({ message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Error deleting panel template:', error);
      res.status(500).json({ message: 'Failed to delete template' });
    }
  });
  
  // Send panel template to Discord channel
  app.post('/api/discord/send-panel-template', isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { channelId, guildId, templateId } = req.body;
      
      if (!channelId || !guildId || !templateId) {
        return res.status(400).json({ message: 'Channel ID, Guild ID, and Template ID are required' });
      }
      
      // Verify user has access to this guild
      const userAdminGuilds: any[] = user.adminGuilds || [];
      
      const isUserAdmin = userAdminGuilds.some(guild => guild.id === guildId);
      if (!isUserAdmin) {
        return res.status(403).json({ message: 'You must be an admin in this server' });
      }
      
      // Check if bot is present in this guild
      const botGuilds = await getBotGuilds();
      const isBotPresent = botGuilds.some(guild => guild.id === guildId);
      if (!isBotPresent) {
        return res.status(403).json({ message: 'Bot is not present in this server' });
      }
      
      // Get the template
      const template = await storage.getPanelTemplate(parseInt(templateId));
      if (!template || template.serverId !== guildId) {
        return res.status(404).json({ message: 'Template not found or access denied' });
      }
      
      // Increment use count
      await storage.incrementTemplateUseCount(template.id);
      
      // If it's a ticket panel, use the existing function
      if (template.isTicketPanel) {
        const result = await sendTicketPanelToChannel(channelId, guildId, storage);
        
        if (result.success) {
          res.json({
            success: true,
            message: 'Panel sent successfully',
            messageId: result.messageId
          });
        } else {
          res.status(400).json({
            success: false,
            message: result.error || 'Failed to send panel'
          });
        }
      } else {
        // Send custom panel template
        const fields = await storage.getPanelTemplateFields(template.id);
        const buttons = await storage.getPanelTemplateButtons(template.id);
        
        const result = await sendPanelTemplateToChannel(channelId, guildId, template, fields, buttons);
        
        if (result.success) {
          res.json({
            success: true,
            message: 'Panel template sent successfully',
            messageId: result.messageId
          });
        } else {
          res.status(400).json({
            success: false,
            message: result.error || 'Failed to send panel template'
          });
        }
      }
    } catch (error) {
      console.error('Error sending panel template:', error);
      res.status(500).json({ message: 'Failed to send panel template' });
    }
  });

  // Template API Routes (CRUD operations)
  
  // GET /api/templates/:serverId - Get all templates for a server
  app.get('/api/templates/:serverId', isAdmin, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const templates = await storage.getPanelTemplates(serverId);
      res.json(templates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ message: 'Failed to fetch templates' });
    }
  });
  
  // GET /api/templates/detail/:id - Get single template with all fields and buttons
  app.get('/api/templates/detail/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      const template = await storage.getPanelTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      // Verify user has access to this template's server
      const hasAccess = await userHasServerAccess(user, template.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      // Fetch fields and buttons
      const fields = await storage.getPanelTemplateFields(templateId);
      const buttons = await storage.getPanelTemplateButtons(templateId);
      
      res.json({ ...template, fields, buttons });
    } catch (error) {
      console.error('Error fetching template details:', error);
      res.status(500).json({ message: 'Failed to fetch template details' });
    }
  });
  
  // POST /api/templates - Create new template
  app.post('/api/templates', isAdmin, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { serverId, ...templateData } = req.body;
      
      if (!serverId) {
        return res.status(400).json({ message: 'Server ID is required' });
      }
      
      // Verify user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const validatedTemplate = insertPanelTemplateSchema.parse({ ...templateData, serverId });
      const createdTemplate = await storage.createPanelTemplate(validatedTemplate);
      
      res.status(201).json(createdTemplate);
    } catch (error) {
      console.error('Error creating template:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid template data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to create template' });
      }
    }
  });
  
  // PATCH /api/templates/:id - Update template
  app.patch('/api/templates/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify template exists and user has access
      const existingTemplate = await storage.getPanelTemplate(templateId);
      if (!existingTemplate) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      const hasAccess = await userHasServerAccess(user, existingTemplate.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      const validatedData = updatePanelTemplateSchema.parse(req.body);
      const updatedTemplate = await storage.updatePanelTemplate(templateId, validatedData);
      
      if (!updatedTemplate) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      res.json(updatedTemplate);
    } catch (error) {
      console.error('Error updating template:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid template data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to update template' });
      }
    }
  });
  
  // DELETE /api/templates/:id - Delete template
  app.delete('/api/templates/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify template exists and user has access
      const existingTemplate = await storage.getPanelTemplate(templateId);
      if (!existingTemplate) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      const hasAccess = await userHasServerAccess(user, existingTemplate.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      const deleted = await storage.deletePanelTemplate(templateId);
      if (!deleted) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      res.json({ message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Error deleting template:', error);
      res.status(500).json({ message: 'Failed to delete template' });
    }
  });
  
  // POST /api/templates/:id/duplicate - Duplicate template with all fields and buttons
  app.post('/api/templates/:id/duplicate', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Get the original template
      const originalTemplate = await storage.getPanelTemplate(templateId);
      if (!originalTemplate) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      // Verify user has access to this template's server
      const hasAccess = await userHasServerAccess(user, originalTemplate.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      // Get all fields and buttons
      const originalFields = await storage.getPanelTemplateFields(templateId);
      const originalButtons = await storage.getPanelTemplateButtons(templateId);
      
      // Create duplicate template with modified name
      const duplicateTemplateData = {
        serverId: originalTemplate.serverId,
        name: `${originalTemplate.name} (Copy)`,
        description: originalTemplate.description,
        type: originalTemplate.type,
        embedTitle: originalTemplate.embedTitle,
        embedDescription: originalTemplate.embedDescription,
        embedColor: originalTemplate.embedColor,
        embedUrl: originalTemplate.embedUrl,
        authorName: originalTemplate.authorName,
        authorIconUrl: originalTemplate.authorIconUrl,
        authorUrl: originalTemplate.authorUrl,
        thumbnailUrl: originalTemplate.thumbnailUrl,
        imageUrl: originalTemplate.imageUrl,
        footerText: originalTemplate.footerText,
        footerIconUrl: originalTemplate.footerIconUrl,
        showTimestamp: originalTemplate.showTimestamp,
        isEnabled: originalTemplate.isEnabled,
        isTicketPanel: originalTemplate.isTicketPanel
      };
      
      const duplicatedTemplate = await storage.createPanelTemplate(duplicateTemplateData);
      
      // Duplicate all fields
      const duplicatedFields = await Promise.all(
        originalFields.map((field) => 
          storage.createPanelTemplateField({
            templateId: duplicatedTemplate.id,
            name: field.name,
            value: field.value,
            inline: field.inline,
            sortOrder: field.sortOrder,
            isEnabled: field.isEnabled
          })
        )
      );
      
      // Duplicate all buttons
      const duplicatedButtons = await Promise.all(
        originalButtons.map((button) => 
          storage.createPanelTemplateButton({
            templateId: duplicatedTemplate.id,
            customId: button.customId,
            label: button.label,
            emoji: button.emoji,
            buttonStyle: button.buttonStyle,
            url: button.url,
            actionType: button.actionType,
            actionData: button.actionData,
            row: button.row,
            position: button.position,
            isEnabled: button.isEnabled,
            requiresRole: button.requiresRole
          })
        )
      );
      
      res.status(201).json({ 
        ...duplicatedTemplate, 
        fields: duplicatedFields, 
        buttons: duplicatedButtons 
      });
    } catch (error) {
      console.error('Error duplicating template:', error);
      res.status(500).json({ message: 'Failed to duplicate template' });
    }
  });
  
  // POST /api/templates/:id/deploy - Deploy template to a Discord channel
  app.post('/api/templates/:id/deploy', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const user = req.user as any;
      const { channelId } = req.body;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      if (!channelId) {
        return res.status(400).json({ message: 'Channel ID is required' });
      }
      
      // Get the template
      const template = await storage.getPanelTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      // Verify user has access to this template's server
      const hasAccess = await userHasServerAccess(user, template.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      // Get fields and buttons
      const fields = await storage.getPanelTemplateFields(templateId);
      const buttons = await storage.getPanelTemplateButtons(templateId);
      
      // Send template to channel
      const result = await sendPanelTemplateToChannel(channelId, template.serverId, template, fields, buttons);
      
      if (result.success) {
        // Increment use count
        await storage.incrementTemplateUseCount(templateId);
        
        res.json({
          success: true,
          message: 'Template deployed successfully',
          messageId: result.messageId
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error || 'Failed to deploy template'
        });
      }
    } catch (error) {
      console.error('Error deploying template:', error);
      res.status(500).json({ message: 'Failed to deploy template' });
    }
  });
  
  // Template Field Operations
  
  // GET /api/templates/:templateId/fields - Get all fields for a template
  app.get('/api/templates/:templateId/fields', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify template exists and user has access
      const template = await storage.getPanelTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      const hasAccess = await userHasServerAccess(user, template.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      const fields = await storage.getPanelTemplateFields(templateId);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching template fields:', error);
      res.status(500).json({ message: 'Failed to fetch template fields' });
    }
  });
  
  // POST /api/templates/:templateId/fields - Add field to template
  app.post('/api/templates/:templateId/fields', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify template exists and user has access
      const template = await storage.getPanelTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      const hasAccess = await userHasServerAccess(user, template.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      const validatedField = insertPanelTemplateFieldSchema.parse({ 
        ...req.body, 
        templateId 
      });
      const createdField = await storage.createPanelTemplateField(validatedField);
      
      res.status(201).json(createdField);
    } catch (error) {
      console.error('Error creating template field:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid field data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to create template field' });
      }
    }
  });
  
  // PATCH /api/template-fields/:id - Update field
  app.patch('/api/template-fields/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const fieldId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(fieldId)) {
        return res.status(400).json({ message: 'Invalid field ID' });
      }
      
      // Get the field to check template access
      const fields = await storage.getPanelTemplateFields(0); // This won't work, need to get field first
      // Since we don't have a getPanelTemplateField method, we need to get the template first
      // Let's validate the data and try to update, the storage layer will handle not found
      
      const validatedData = updatePanelTemplateFieldSchema.parse(req.body);
      const updatedField = await storage.updatePanelTemplateField(fieldId, validatedData);
      
      if (!updatedField) {
        return res.status(404).json({ message: 'Field not found' });
      }
      
      // Verify user has access to the template this field belongs to
      const template = await storage.getPanelTemplate(updatedField.templateId);
      if (template) {
        const hasAccess = await userHasServerAccess(user, template.serverId);
        if (!hasAccess) {
          return res.status(403).json({ message: 'Access denied to this field' });
        }
      }
      
      res.json(updatedField);
    } catch (error) {
      console.error('Error updating template field:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid field data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to update template field' });
      }
    }
  });
  
  // DELETE /api/template-fields/:id - Delete field
  app.delete('/api/template-fields/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const fieldId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(fieldId)) {
        return res.status(400).json({ message: 'Invalid field ID' });
      }
      
      const deleted = await storage.deletePanelTemplateField(fieldId);
      if (!deleted) {
        return res.status(404).json({ message: 'Field not found' });
      }
      
      res.json({ message: 'Field deleted successfully' });
    } catch (error) {
      console.error('Error deleting template field:', error);
      res.status(500).json({ message: 'Failed to delete template field' });
    }
  });
  
  // Template Button Operations
  
  // GET /api/templates/:templateId/buttons - Get all buttons for a template
  app.get('/api/templates/:templateId/buttons', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify template exists and user has access
      const template = await storage.getPanelTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      const hasAccess = await userHasServerAccess(user, template.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      const buttons = await storage.getPanelTemplateButtons(templateId);
      res.json(buttons);
    } catch (error) {
      console.error('Error fetching template buttons:', error);
      res.status(500).json({ message: 'Failed to fetch template buttons' });
    }
  });
  
  // POST /api/templates/:templateId/buttons - Add button to template
  app.post('/api/templates/:templateId/buttons', isAdmin, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const user = req.user as any;
      
      if (isNaN(templateId)) {
        return res.status(400).json({ message: 'Invalid template ID' });
      }
      
      // Verify template exists and user has access
      const template = await storage.getPanelTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      
      const hasAccess = await userHasServerAccess(user, template.serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this template' });
      }
      
      const validatedButton = insertPanelTemplateButtonSchema.parse({ 
        ...req.body, 
        templateId 
      });
      const createdButton = await storage.createPanelTemplateButton(validatedButton);
      
      res.status(201).json(createdButton);
    } catch (error) {
      console.error('Error creating template button:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid button data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to create template button' });
      }
    }
  });
  
  // PATCH /api/template-buttons/:id - Update button
  app.patch('/api/template-buttons/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const buttonId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(buttonId)) {
        return res.status(400).json({ message: 'Invalid button ID' });
      }
      
      const validatedData = updatePanelTemplateButtonSchema.parse(req.body);
      const updatedButton = await storage.updatePanelTemplateButton(buttonId, validatedData);
      
      if (!updatedButton) {
        return res.status(404).json({ message: 'Button not found' });
      }
      
      // Verify user has access to the template this button belongs to
      const template = await storage.getPanelTemplate(updatedButton.templateId);
      if (template) {
        const hasAccess = await userHasServerAccess(user, template.serverId);
        if (!hasAccess) {
          return res.status(403).json({ message: 'Access denied to this button' });
        }
      }
      
      res.json(updatedButton);
    } catch (error) {
      console.error('Error updating template button:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid button data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to update template button' });
      }
    }
  });
  
  // DELETE /api/template-buttons/:id - Delete button
  app.delete('/api/template-buttons/:id', isAdmin, async (req: Request, res: Response) => {
    try {
      const buttonId = parseInt(req.params.id);
      const user = req.user as any;
      
      if (isNaN(buttonId)) {
        return res.status(400).json({ message: 'Invalid button ID' });
      }
      
      const deleted = await storage.deletePanelTemplateButton(buttonId);
      if (!deleted) {
        return res.status(404).json({ message: 'Button not found' });
      }
      
      res.json({ message: 'Button deleted successfully' });
    } catch (error) {
      console.error('Error deleting template button:', error);
      res.status(500).json({ message: 'Failed to delete template button' });
    }
  });

  // ========================================
  // PHASE 2: Permission System API
  // ========================================

  // GET /api/accessible-servers - Get servers user has access to
  app.get('/api/accessible-servers', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      
      // Get user's admin guilds
      let userAdminGuilds: any[] = [];
      if (user.adminGuilds) {
        if (Array.isArray(user.adminGuilds)) {
          userAdminGuilds = user.adminGuilds;
        } else if (typeof user.adminGuilds === 'string') {
          try {
            userAdminGuilds = JSON.parse(user.adminGuilds);
          } catch (error) {
            console.error('Failed to parse user admin guilds:', error);
          }
        }
      }
      
      // Get bot guilds
      const botGuilds = await getBotGuilds();
      
      // Filter to only servers where user is admin AND bot is present
      const accessibleServers = userAdminGuilds
        .filter(guild => botGuilds.some(botGuild => botGuild.id === guild.id))
        .map(guild => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          userPermissions: {
            canManageSettings: true,
            canViewTickets: true,
            canManageTickets: true
          }
        }));
      
      res.json(accessibleServers);
    } catch (error) {
      console.error('Error fetching accessible servers:', error);
      res.status(500).json({ message: 'Failed to fetch accessible servers' });
    }
  });

  // GET /api/servers/:serverId/role-permissions - List all role permissions for server
  app.get('/api/servers/:serverId/role-permissions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const serverId = req.params.serverId;
      
      // Check if user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const permissions = await storage.getRolePermissions(serverId);
      res.json(permissions);
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      res.status(500).json({ message: 'Failed to fetch role permissions' });
    }
  });

  // POST /api/servers/:serverId/role-permissions - Add new role permission
  app.post('/api/servers/:serverId/role-permissions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const serverId = req.params.serverId;
      
      // Check if user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const validatedData = insertServerRolePermissionSchema.parse({
        ...req.body,
        serverId
      });
      
      const permission = await storage.addRolePermission(validatedData);
      res.status(201).json(permission);
    } catch (error) {
      console.error('Error adding role permission:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid permission data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to add role permission' });
      }
    }
  });

  // PATCH /api/servers/:serverId/role-permissions/:id - Update role permission
  app.patch('/api/servers/:serverId/role-permissions/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const serverId = req.params.serverId;
      const permissionId = parseInt(req.params.id);
      
      if (isNaN(permissionId)) {
        return res.status(400).json({ message: 'Invalid permission ID' });
      }
      
      // Check if user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const validatedData = updateServerRolePermissionSchema.parse(req.body);
      const updatedPermission = await storage.updateRolePermission(permissionId, validatedData);
      
      if (!updatedPermission) {
        return res.status(404).json({ message: 'Permission not found' });
      }
      
      res.json(updatedPermission);
    } catch (error) {
      console.error('Error updating role permission:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid permission data', errors: error.errors });
      } else {
        res.status(500).json({ message: 'Failed to update role permission' });
      }
    }
  });

  // DELETE /api/servers/:serverId/role-permissions/:id - Remove role permission
  app.delete('/api/servers/:serverId/role-permissions/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const serverId = req.params.serverId;
      const permissionId = parseInt(req.params.id);
      
      if (isNaN(permissionId)) {
        return res.status(400).json({ message: 'Invalid permission ID' });
      }
      
      // Check if user has access to this server
      const hasAccess = await userHasServerAccess(user, serverId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }
      
      const deleted = await storage.deleteRolePermission(permissionId);
      if (!deleted) {
        return res.status(404).json({ message: 'Permission not found' });
      }
      
      res.json({ message: 'Permission deleted successfully' });
    } catch (error) {
      console.error('Error deleting role permission:', error);
      res.status(500).json({ message: 'Failed to delete role permission' });
    }
  });

  // Mount developer routes with authentication and developer middleware
  app.use('/api/dev', isAuthenticated, isDeveloperMiddleware, devRoutes);

  // Mount homelabhub orchestration routes (no auth - internal Docker network only)
  app.use('/api/homelabhub', homelabhubRoutes);

  // Mount stream notifications routes
  app.use('/api/stream-notifications', streamNotificationsRoutes);

  // Start the Discord bot
  try {
    if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_APP_ID) {
      console.log('Attempting to start Discord bot...');
      await startBot(storage, broadcast);
    } else {
      const missing = [];
      if (!process.env.DISCORD_BOT_TOKEN) missing.push('DISCORD_BOT_TOKEN');
      if (!process.env.DISCORD_APP_ID) missing.push('DISCORD_APP_ID');
      console.warn(`Some Discord configuration values are missing: ${missing.join(', ')}. Discord bot functionality will be disabled.`);
    }
  } catch (error) {
    console.error('Failed to start Discord bot:', error);
    console.warn('The application will continue to run without Discord bot integration. You can still use the web dashboard.');
  }

  return httpServer;
}
