import {
  Message,
  Guild,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  PermissionsBitField,
  ColorResolvable,
  CommandInteraction,
  ChannelType
} from 'discord.js';
import { eq, and, gt, lt, isNull, or } from 'drizzle-orm';
import { db } from '../db';
import {
  customCommands,
  commandCooldowns,
  commandVariables,
  commandAnalytics,
  type CustomCommand,
  type CommandVariable,
  type InsertCommandAnalytics
} from '../../shared/schema';

interface CachedCommand extends CustomCommand {
  aliasArray: string[];
  requiredRoleArray: string[];
  deniedRoleArray: string[];
  requiredChannelArray: string[];
  requiredPermArray: string[];
}

interface CommandContext {
  serverId: string;
  channelId: string;
  userId: string;
  username: string;
  member: GuildMember;
  guild: Guild;
  args: string[];
}

interface ExecutionResult {
  success: boolean;
  error?: string;
  responseTimeMs: number;
}

class CommandEngineService {
  private commandRegistry: Map<string, Map<string, CachedCommand>> = new Map();
  private triggerIndex: Map<string, Map<string, CachedCommand>> = new Map();
  private variableCache: Map<string, Map<string, string>> = new Map();
  private isInitialized = false;

  async loadCommands(serverId: string): Promise<void> {
    try {
      const commands = await db
        .select()
        .from(customCommands)
        .where(
          and(
            eq(customCommands.serverId, serverId),
            eq(customCommands.isEnabled, true),
            eq(customCommands.isDraft, false)
          )
        );

      const serverCommands = new Map<string, CachedCommand>();
      const serverTriggers = new Map<string, CachedCommand>();

      for (const cmd of commands) {
        const cached = this.parseCommand(cmd);
        serverCommands.set(cmd.trigger.toLowerCase(), cached);

        serverTriggers.set(cmd.trigger.toLowerCase(), cached);
        for (const alias of cached.aliasArray) {
          serverTriggers.set(alias.toLowerCase(), cached);
        }
      }

      this.commandRegistry.set(serverId, serverCommands);
      this.triggerIndex.set(serverId, serverTriggers);

      const variables = await db
        .select()
        .from(commandVariables)
        .where(eq(commandVariables.serverId, serverId));

      const varMap = new Map<string, string>();
      for (const v of variables) {
        varMap.set(v.name, v.value);
      }
      this.variableCache.set(serverId, varMap);

      console.log(`[CommandEngine] Loaded ${commands.length} commands for server ${serverId}`);
    } catch (error) {
      console.error(`[CommandEngine] Error loading commands for ${serverId}:`, error);
    }
  }

  async refreshCommands(serverId: string): Promise<void> {
    await this.loadCommands(serverId);
  }

  findCommand(serverId: string, trigger: string): CachedCommand | null {
    const serverTriggers = this.triggerIndex.get(serverId);
    if (!serverTriggers) return null;
    return serverTriggers.get(trigger.toLowerCase()) || null;
  }

  getCommands(serverId: string): CachedCommand[] {
    const serverCommands = this.commandRegistry.get(serverId);
    if (!serverCommands) return [];
    return Array.from(serverCommands.values());
  }

  async executeCommand(
    message: Message,
    command: CachedCommand,
    args: string[]
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (!message.guild || !message.member) {
      return { success: false, error: 'Guild or member not found', responseTimeMs: 0 };
    }

    const context: CommandContext = {
      serverId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      username: message.author.username,
      member: message.member as GuildMember,
      guild: message.guild,
      args
    };

    const permResult = this.checkPermissions(command, context);
    if (!permResult.allowed) {
      return {
        success: false,
        error: permResult.reason,
        responseTimeMs: Date.now() - startTime
      };
    }

    const cooldownResult = await this.checkCooldown(
      context.serverId,
      command.id,
      context.userId
    );

    if (cooldownResult.onCooldown) {
      try {
        const reply = await message.reply({
          content: `⏳ This command is on cooldown. Try again in ${cooldownResult.remainingSeconds} seconds.`,
          allowedMentions: { repliedUser: false }
        });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {}
      return {
        success: false,
        error: 'Command on cooldown',
        responseTimeMs: Date.now() - startTime
      };
    }

    try {
      if (command.deleteUserMessage) {
        await message.delete().catch(() => {});
      }

      const responseContent = await this.resolveVariables(
        command.response || '',
        context
      );

      let sentMessage: Message | null = null;

      if (!message.channel.isSendable()) {
        return {
          success: false,
          error: 'Cannot send messages to this channel',
          responseTimeMs: Date.now() - startTime
        };
      }

      if (command.embedJson) {
        const embed = await this.buildEmbed(command.embedJson, context);
        let content = command.mentionUser ? `<@${context.userId}>` : undefined;
        if (responseContent && responseContent.trim()) {
          content = content ? `${content} ${responseContent}` : responseContent;
        }

        sentMessage = await message.channel.send({
          content,
          embeds: [embed]
        });
      } else if (responseContent && responseContent.trim()) {
        const content = command.mentionUser
          ? `<@${context.userId}> ${responseContent}`
          : responseContent;

        sentMessage = await message.channel.send(content);
      }

      if (sentMessage && command.deleteResponseAfter && command.deleteResponseAfter > 0) {
        setTimeout(() => {
          sentMessage?.delete().catch(() => {});
        }, command.deleteResponseAfter * 1000);
      }

      if (command.cooldownSeconds && command.cooldownSeconds > 0) {
        await this.setCooldown(
          context.serverId,
          command.id,
          context.userId,
          command.cooldownSeconds
        );
      }

      if (command.globalCooldownSeconds && command.globalCooldownSeconds > 0) {
        await this.setCooldown(
          context.serverId,
          command.id,
          null,
          command.globalCooldownSeconds
        );
      }

      await this.trackAnalytics({
        serverId: context.serverId,
        commandId: command.id,
        commandName: command.trigger,
        userId: context.userId,
        channelId: context.channelId,
        success: true,
        responseTimeMs: Date.now() - startTime
      });

      await this.incrementUsageCount(context.serverId, command.trigger);

      return {
        success: true,
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.trackAnalytics({
        serverId: context.serverId,
        commandId: command.id,
        commandName: command.trigger,
        userId: context.userId,
        channelId: context.channelId,
        success: false,
        errorMessage,
        responseTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: errorMessage,
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  async executeSlashCommand(
    interaction: CommandInteraction,
    command: CachedCommand
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    if (!interaction.guild || !interaction.member) {
      return { success: false, error: 'Guild or member not found', responseTimeMs: 0 };
    }

    const context: CommandContext = {
      serverId: interaction.guild.id,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      username: interaction.user.username,
      member: interaction.member as GuildMember,
      guild: interaction.guild as Guild,
      args: []
    };

    const permResult = this.checkPermissions(command, context);
    if (!permResult.allowed) {
      await interaction.reply({
        content: `❌ ${permResult.reason}`,
        ephemeral: true
      });
      return {
        success: false,
        error: permResult.reason,
        responseTimeMs: Date.now() - startTime
      };
    }

    const cooldownResult = await this.checkCooldown(
      context.serverId,
      command.id,
      context.userId
    );

    if (cooldownResult.onCooldown) {
      await interaction.reply({
        content: `⏳ This command is on cooldown. Try again in ${cooldownResult.remainingSeconds} seconds.`,
        ephemeral: true
      });
      return {
        success: false,
        error: 'Command on cooldown',
        responseTimeMs: Date.now() - startTime
      };
    }

    try {
      const responseContent = await this.resolveVariables(
        command.response || '',
        context
      );

      const isEphemeral = command.ephemeral ?? false;

      if (command.embedJson) {
        const embed = await this.buildEmbed(command.embedJson, context);
        let content = command.mentionUser ? `<@${context.userId}>` : undefined;
        if (responseContent && responseContent.trim()) {
          content = content ? `${content} ${responseContent}` : responseContent;
        }

        await interaction.reply({
          content,
          embeds: [embed],
          ephemeral: isEphemeral
        });
      } else if (responseContent && responseContent.trim()) {
        const content = command.mentionUser
          ? `<@${context.userId}> ${responseContent}`
          : responseContent;

        await interaction.reply({
          content,
          ephemeral: isEphemeral
        });
      } else {
        await interaction.reply({
          content: 'Command executed.',
          ephemeral: true
        });
      }

      if (command.cooldownSeconds && command.cooldownSeconds > 0) {
        await this.setCooldown(
          context.serverId,
          command.id,
          context.userId,
          command.cooldownSeconds
        );
      }

      if (command.globalCooldownSeconds && command.globalCooldownSeconds > 0) {
        await this.setCooldown(
          context.serverId,
          command.id,
          null,
          command.globalCooldownSeconds
        );
      }

      await this.trackAnalytics({
        serverId: context.serverId,
        commandId: command.id,
        commandName: command.trigger,
        userId: context.userId,
        channelId: context.channelId,
        success: true,
        responseTimeMs: Date.now() - startTime
      });

      await this.incrementUsageCount(context.serverId, command.trigger);

      return {
        success: true,
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ An error occurred while executing this command.',
          ephemeral: true
        }).catch(() => {});
      }

      await this.trackAnalytics({
        serverId: context.serverId,
        commandId: command.id,
        commandName: command.trigger,
        userId: context.userId,
        channelId: context.channelId,
        success: false,
        errorMessage,
        responseTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: errorMessage,
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  async checkCooldown(
    serverId: string,
    commandId: number,
    userId: string
  ): Promise<{ onCooldown: boolean; remainingSeconds?: number }> {
    const now = new Date();

    try {
      const cooldowns = await db
        .select()
        .from(commandCooldowns)
        .where(
          and(
            eq(commandCooldowns.serverId, serverId),
            eq(commandCooldowns.commandId, commandId),
            gt(commandCooldowns.expiresAt, now),
            or(
              eq(commandCooldowns.userId, userId),
              isNull(commandCooldowns.userId)
            )
          )
        );

      if (cooldowns.length === 0) {
        return { onCooldown: false };
      }

      const latestCooldown = cooldowns.reduce((latest: typeof cooldowns[0], cd: typeof cooldowns[0]) =>
        cd.expiresAt > latest.expiresAt ? cd : latest
      );

      const remainingMs = latestCooldown.expiresAt.getTime() - now.getTime();
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      return { onCooldown: true, remainingSeconds };
    } catch (error) {
      console.error('[CommandEngine] Error checking cooldown:', error);
      return { onCooldown: false };
    }
  }

  async setCooldown(
    serverId: string,
    commandId: number,
    userId: string | null,
    seconds: number
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + seconds * 1000);

      await db.insert(commandCooldowns).values({
        serverId,
        commandId,
        userId,
        expiresAt
      });
    } catch (error) {
      console.error('[CommandEngine] Error setting cooldown:', error);
    }
  }

  async cleanupExpiredCooldowns(): Promise<number> {
    try {
      const now = new Date();
      await db
        .delete(commandCooldowns)
        .where(lt(commandCooldowns.expiresAt, now));
      return 0;
    } catch (error) {
      console.error('[CommandEngine] Error cleaning up cooldowns:', error);
      return 0;
    }
  }

  private parseCommand(cmd: CustomCommand): CachedCommand {
    return {
      ...cmd,
      aliasArray: this.parseJsonArray(cmd.aliases),
      requiredRoleArray: this.parseJsonArray(cmd.requiredRoleIds),
      deniedRoleArray: this.parseJsonArray(cmd.deniedRoleIds),
      requiredChannelArray: this.parseJsonArray(cmd.requiredChannelIds),
      requiredPermArray: this.parseJsonArray(cmd.requiredPermissions)
    };
  }

  private parseJsonArray(json: string | null): string[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private checkPermissions(
    command: CachedCommand,
    context: CommandContext
  ): { allowed: boolean; reason?: string } {
    if (command.requiredChannelArray.length > 0) {
      if (!command.requiredChannelArray.includes(context.channelId)) {
        return {
          allowed: false,
          reason: 'This command cannot be used in this channel.'
        };
      }
    }

    const memberRoles = context.member.roles.cache.map(r => r.id);

    if (command.deniedRoleArray.length > 0) {
      const hasDeniedRole = command.deniedRoleArray.some(roleId =>
        memberRoles.includes(roleId)
      );
      if (hasDeniedRole) {
        return {
          allowed: false,
          reason: 'You do not have permission to use this command.'
        };
      }
    }

    if (command.requiredRoleArray.length > 0) {
      const hasRequiredRole = command.requiredRoleArray.some(roleId =>
        memberRoles.includes(roleId)
      );
      if (!hasRequiredRole) {
        return {
          allowed: false,
          reason: 'You do not have the required role to use this command.'
        };
      }
    }

    if (command.requiredPermArray.length > 0) {
      for (const perm of command.requiredPermArray) {
        const permFlag = perm as keyof typeof PermissionsBitField.Flags;
        if (
          PermissionsBitField.Flags[permFlag] &&
          !context.member.permissions.has(PermissionsBitField.Flags[permFlag])
        ) {
          return {
            allowed: false,
            reason: `You need the ${perm} permission to use this command.`
          };
        }
      }
    }

    return { allowed: true };
  }

  private async resolveVariables(
    content: string,
    context: CommandContext
  ): Promise<string> {
    let result = content;

    result = result.replace(/{user}/g, `<@${context.userId}>`);
    result = result.replace(/{user\.mention}/g, `<@${context.userId}>`);
    result = result.replace(/{user\.id}/g, context.userId);
    result = result.replace(/{user\.name}/g, context.username);
    result = result.replace(/{user\.username}/g, context.username);
    result = result.replace(/{user\.tag}/g, context.member.user.tag);
    result = result.replace(/{user\.avatar}/g, context.member.user.displayAvatarURL());
    result = result.replace(/{user\.nickname}/g, context.member.displayName);

    result = result.replace(/{server}/g, context.guild.name);
    result = result.replace(/{server\.name}/g, context.guild.name);
    result = result.replace(/{server\.id}/g, context.guild.id);
    result = result.replace(/{server\.memberCount}/g, String(context.guild.memberCount));
    result = result.replace(/{server\.icon}/g, context.guild.iconURL() || '');

    const channel = context.guild.channels.cache.get(context.channelId);
    if (channel && channel.type === ChannelType.GuildText) {
      result = result.replace(/{channel}/g, `<#${context.channelId}>`);
      result = result.replace(/{channel\.name}/g, channel.name);
      result = result.replace(/{channel\.id}/g, context.channelId);
      result = result.replace(/{channel\.mention}/g, `<#${context.channelId}>`);
    }

    result = result.replace(/{args}/g, context.args.join(' '));
    result = result.replace(/{args\[(\d+)\]}/g, (_, index) => {
      const i = parseInt(index, 10);
      return context.args[i] || '';
    });

    result = result.replace(/{date}/g, new Date().toLocaleDateString());
    result = result.replace(/{time}/g, new Date().toLocaleTimeString());
    result = result.replace(/{datetime}/g, new Date().toLocaleString());

    result = result.replace(/{random:(\d+)-(\d+)}/g, (_, min, max) => {
      const minNum = parseInt(min, 10);
      const maxNum = parseInt(max, 10);
      return String(Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum);
    });

    const serverVars = this.variableCache.get(context.serverId);
    if (serverVars) {
      for (const [name, value] of serverVars) {
        result = result.replace(new RegExp(`{var:${name}}`, 'g'), value);
        result = result.replace(new RegExp(`{${name}}`, 'g'), value);
      }
    }

    return result;
  }

  private async buildEmbed(
    embedJson: string,
    context: CommandContext
  ): Promise<EmbedBuilder> {
    let embedData: any;
    try {
      embedData = JSON.parse(embedJson);
    } catch {
      return new EmbedBuilder()
        .setDescription('Error parsing embed configuration.')
        .setColor(0xff0000);
    }

    const embed = new EmbedBuilder();

    if (embedData.title) {
      embed.setTitle(await this.resolveVariables(embedData.title, context));
    }

    if (embedData.description) {
      embed.setDescription(await this.resolveVariables(embedData.description, context));
    }

    if (embedData.color) {
      const color = embedData.color.startsWith('#')
        ? parseInt(embedData.color.slice(1), 16)
        : embedData.color;
      embed.setColor(color as ColorResolvable);
    }

    if (embedData.url) {
      embed.setURL(embedData.url);
    }

    if (embedData.thumbnail) {
      const thumbnailUrl = await this.resolveVariables(embedData.thumbnail, context);
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    }

    if (embedData.image) {
      const imageUrl = await this.resolveVariables(embedData.image, context);
      if (imageUrl) embed.setImage(imageUrl);
    }

    if (embedData.author) {
      embed.setAuthor({
        name: await this.resolveVariables(embedData.author.name || '', context),
        iconURL: embedData.author.icon_url,
        url: embedData.author.url
      });
    }

    if (embedData.footer) {
      embed.setFooter({
        text: await this.resolveVariables(embedData.footer.text || '', context),
        iconURL: embedData.footer.icon_url
      });
    }

    if (embedData.timestamp) {
      embed.setTimestamp();
    }

    if (embedData.fields && Array.isArray(embedData.fields)) {
      for (const field of embedData.fields) {
        embed.addFields({
          name: await this.resolveVariables(field.name || 'Field', context),
          value: await this.resolveVariables(field.value || '', context),
          inline: field.inline ?? false
        });
      }
    }

    return embed;
  }

  private async trackAnalytics(data: InsertCommandAnalytics): Promise<void> {
    try {
      await db.insert(commandAnalytics).values(data);
    } catch (error) {
      console.error('[CommandEngine] Error tracking analytics:', error);
    }
  }

  private async incrementUsageCount(serverId: string, trigger: string): Promise<void> {
    try {
      await db
        .update(customCommands)
        .set({
          usageCount: db.raw`usage_count + 1` as any,
          lastUsedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(customCommands.serverId, serverId),
            eq(customCommands.trigger, trigger)
          )
        );

      const serverCommands = this.commandRegistry.get(serverId);
      if (serverCommands) {
        const cached = serverCommands.get(trigger.toLowerCase());
        if (cached) {
          cached.usageCount = (cached.usageCount || 0) + 1;
          cached.lastUsedAt = new Date();
        }
      }
    } catch (error) {
      console.error('[CommandEngine] Error incrementing usage count:', error);
    }
  }

  supportsCommandType(command: CachedCommand, type: 'prefix' | 'slash'): boolean {
    if (command.commandType === 'both') return true;
    return command.commandType === type;
  }

  isCommandHidden(command: CachedCommand): boolean {
    return command.isHidden;
  }

  getCommandsByCategory(serverId: string): Map<string, CachedCommand[]> {
    const result = new Map<string, CachedCommand[]>();
    const commands = this.getCommands(serverId);

    for (const cmd of commands) {
      if (cmd.isHidden) continue;
      const category = cmd.category || 'Custom';
      if (!result.has(category)) {
        result.set(category, []);
      }
      result.get(category)!.push(cmd);
    }

    return result;
  }
}

export const commandEngine = new CommandEngineService();
