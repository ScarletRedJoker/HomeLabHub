import { Router, Request, Response } from "express";
import { dbStorage as storage } from "../database-storage";
import { z } from "zod";
import { isAuthenticated } from "../auth";

const router = Router();

// Validation schemas
const streamSettingsSchema = z.object({
  notificationChannelId: z.string(),
  customMessage: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
});

const trackedUserSchema = z.object({
  userId: z.string(),
  username: z.string().nullable().optional(),
});

// Helper function to check if user has access to server
async function userHasServerAccess(req: Request, serverId: string): Promise<boolean> {
  try {
    const user = req.user as any;
    if (!user) return false;

    let userAdminGuilds: any[] = [];
    
    if (user.adminGuilds) {
      if (Array.isArray(user.adminGuilds)) {
        userAdminGuilds = user.adminGuilds;
      } else if (typeof user.adminGuilds === 'string') {
        try {
          userAdminGuilds = JSON.parse(user.adminGuilds);
        } catch (error) {
          console.error('Failed to parse user admin guilds string:', error);
          return false;
        }
      }
    }
    
    // Check if user is admin in this guild
    const isUserAdmin = userAdminGuilds.some(guild => guild.id === serverId);
    return isUserAdmin;
  } catch (error) {
    console.error('Error checking server access:', error);
    return false;
  }
}

// GET stream notification settings for a server
router.get("/settings/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const settings = await storage.getStreamNotificationSettings(serverId);
    
    res.json(settings || {
      serverId,
      notificationChannelId: null,
      customMessage: null,
      isEnabled: false
    });
  } catch (error) {
    console.error("Failed to get stream notification settings:", error);
    res.status(500).json({ error: "Failed to get stream notification settings" });
  }
});

// POST/UPDATE stream notification settings for a server
router.post("/settings/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    // Validate request body
    const validatedData = streamSettingsSchema.parse(req.body);

    // Check if settings exist
    const existingSettings = await storage.getStreamNotificationSettings(serverId);

    let result;
    if (existingSettings) {
      // Update existing settings
      result = await storage.updateStreamNotificationSettings(serverId, validatedData);
    } else {
      // Create new settings
      result = await storage.createStreamNotificationSettings({
        serverId,
        ...validatedData,
        isEnabled: validatedData.isEnabled ?? true,
      });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Failed to save stream notification settings:", error);
    res.status(500).json({ error: "Failed to save stream notification settings" });
  }
});

// GET tracked users for a server
router.get("/tracked-users/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const trackedUsers = await storage.getStreamTrackedUsers(serverId);
    res.json(trackedUsers);
  } catch (error) {
    console.error("Failed to get tracked users:", error);
    res.status(500).json({ error: "Failed to get tracked users" });
  }
});

// POST add a tracked user
router.post("/tracked-users/:serverId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    // Validate request body
    const validatedData = trackedUserSchema.parse(req.body);

    // Check if user is already tracked
    const existingUsers = await storage.getStreamTrackedUsers(serverId);
    const alreadyTracked = existingUsers.some(u => u.userId === validatedData.userId);

    if (alreadyTracked) {
      return res.status(409).json({ error: "User is already being tracked" });
    }

    const result = await storage.addStreamTrackedUser({
      serverId,
      ...validatedData,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    console.error("Failed to add tracked user:", error);
    res.status(500).json({ error: "Failed to add tracked user" });
  }
});

// DELETE remove a tracked user
router.delete("/tracked-users/:serverId/:userId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serverId, userId } = req.params;

    // Check access
    const hasAccess = await userHasServerAccess(req, serverId);
    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have permission to access this server" });
    }

    const removed = await storage.removeStreamTrackedUser(serverId, userId);

    if (!removed) {
      return res.status(404).json({ error: "User not found in tracked list" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to remove tracked user:", error);
    res.status(500).json({ error: "Failed to remove tracked user" });
  }
});

export default router;
