/**
 * Discord bot permissions constants
 * Based on Discord's permission bit flags
 * This file centralizes all Discord-related constants to avoid drift between client and server
 */
export const DISCORD_PERMISSIONS = {
  VIEW_CHANNELS: 1024,              // 0x400
  SEND_MESSAGES: 2048,              // 0x800  
  EMBED_LINKS: 16384,               // 0x4000
  READ_MESSAGE_HISTORY: 65536,      // 0x10000
  MANAGE_MESSAGES: 8192,            // 0x2000
  USE_APPLICATION_COMMANDS: 2147483648,  // 0x80000000
  MANAGE_CHANNELS: 16,              // 0x10
  MANAGE_ROLES: 268435456,          // 0x10000000
  CONNECT: 1048576,                 // 0x100000
  SPEAK: 2097152,                   // 0x200000
  ADD_REACTIONS: 64,                // 0x40
  ATTACH_FILES: 32768               // 0x8000
} as const;

/**
 * Calculate the required permissions integer for the Discord bot
 * Includes: View Channels, Send Messages, Embed Links, Read Message History, Manage Messages, 
 * Use Application Commands, Manage Channels, Manage Roles, Connect, Speak, Add Reactions, Attach Files
 */
export function calculateBotPermissions(): number {
  return DISCORD_PERMISSIONS.VIEW_CHANNELS +
         DISCORD_PERMISSIONS.SEND_MESSAGES +
         DISCORD_PERMISSIONS.EMBED_LINKS +
         DISCORD_PERMISSIONS.READ_MESSAGE_HISTORY +
         DISCORD_PERMISSIONS.MANAGE_MESSAGES +
         DISCORD_PERMISSIONS.USE_APPLICATION_COMMANDS +
         DISCORD_PERMISSIONS.MANAGE_CHANNELS +
         DISCORD_PERMISSIONS.MANAGE_ROLES +
         DISCORD_PERMISSIONS.CONNECT +
         DISCORD_PERMISSIONS.SPEAK +
         DISCORD_PERMISSIONS.ADD_REACTIONS +
         DISCORD_PERMISSIONS.ATTACH_FILES;
}

/**
 * Generate a Discord OAuth2 invite URL for the bot
 * @param clientId - The Discord application/bot client ID
 * @param permissions - Optional custom permissions integer (defaults to calculated bot permissions)
 * @returns The complete Discord invite URL
 */
export function generateDiscordInviteURL(clientId: string, permissions?: number): string {
  const permissionsInteger = permissions ?? calculateBotPermissions();
  const baseURL = 'https://discord.com/api/oauth2/authorize';
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: permissionsInteger.toString(),
    scope: 'bot applications.commands'
  });
  
  return `${baseURL}?${params.toString()}`;
}