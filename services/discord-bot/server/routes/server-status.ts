/**
 * Server Status API Routes
 * 
 * Provides real-time server status information including:
 * - Member count (total and online)
 * - Voice channels with active users
 * - Text channels list
 * - Discord server invite link
 * 
 * This is separate from bot health and guild/channel management endpoints.
 */

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import { getDiscordClient } from "../discord/bot";

export function registerServerStatusRoutes(app: Express) {
  /**
   * Get server status for a specific guild
   * 
   * @route GET /api/server-status/:serverId
   * @access Authenticated users with access to the server
   * @returns Server status including member count, channels, and invite link
   */
  app.get('/api/server-status/:serverId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      const user = req.user as any;

      // Verify user has access to this server
      const userConnectedServers: string[] = user.connectedServers || [];
      if (!userConnectedServers.includes(serverId) && !user.isAdmin) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }

      const client = getDiscordClient();
      if (!client || !client.isReady()) {
        return res.status(503).json({ message: 'Discord bot is not connected' });
      }

      // Fetch the guild
      const guild = client.guilds.cache.get(serverId);
      if (!guild) {
        return res.status(404).json({ message: 'Server not found or bot not present' });
      }

      // Ensure members are fetched (required for online count)
      try {
        await guild.members.fetch();
      } catch (error) {
        console.warn(`[ServerStatus] Could not fetch all members for guild ${serverId}:`, error);
      }

      // Get voice channels with active users
      const voiceChannels = guild.channels.cache
        .filter(channel => channel.type === 2) // Voice channels
        .map(channel => {
          const voiceChannel = channel as any;
          return {
            id: voiceChannel.id,
            name: voiceChannel.name,
            userCount: voiceChannel.members?.size || 0,
            userLimit: voiceChannel.userLimit || 0,
            position: voiceChannel.position || 0
          };
        })
        .sort((a, b) => a.position - b.position);

      // Get text channels
      const textChannels = guild.channels.cache
        .filter(channel => channel.type === 0) // Text channels
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: 'text',
          position: (channel as any).position || 0
        }))
        .sort((a, b) => a.position - b.position);

      // Count online members
      const onlineMembers = guild.members.cache.filter(member => 
        member.presence?.status === 'online' || 
        member.presence?.status === 'idle' || 
        member.presence?.status === 'dnd'
      ).size;

      // Get server invite link from environment or guild settings
      // Priority: Environment variable > Guild vanity URL > null
      let discordInviteUrl = process.env.DISCORD_SERVER_INVITE_URL || null;
      
      // If server has a vanity URL, use it
      if (!discordInviteUrl && guild.vanityURLCode) {
        discordInviteUrl = `https://discord.gg/${guild.vanityURLCode}`;
      }

      const serverStatus = {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ size: 128 }),
        memberCount: guild.memberCount,
        onlineMemberCount: onlineMembers,
        voiceChannels: voiceChannels,
        textChannels: textChannels,
        discordInviteUrl: discordInviteUrl
      };

      res.json(serverStatus);
    } catch (error) {
      console.error('[ServerStatus] Error fetching server status:', error);
      res.status(500).json({ message: 'Failed to fetch server status' });
    }
  });

  /**
   * Get server status for the first available server
   * Used when no specific server is selected
   * 
   * @route GET /api/server-status
   * @access Authenticated users
   * @returns Server status for first accessible server
   */
  app.get('/api/server-status', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userConnectedServers: string[] = user.connectedServers || [];

      if (userConnectedServers.length === 0) {
        return res.status(404).json({ message: 'No servers available' });
      }

      // Use the first available server
      const serverId = userConnectedServers[0];

      // Redirect to the specific server status endpoint
      req.params.serverId = serverId;
      return app._router.handle(req, res);
    } catch (error) {
      console.error('[ServerStatus] Error fetching default server status:', error);
      res.status(500).json({ message: 'Failed to fetch server status' });
    }
  });
}
