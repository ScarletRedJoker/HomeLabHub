import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  Collection
} from 'discord.js';
import { IStorage } from '../../../storage';
import { featureRegistry, FEATURE_CATEGORIES, FeatureCategory } from '../../../services/featureRegistry';
import { guildIdentityService } from '../../../services/guildIdentityService';
import { dbStorage } from '../../../database-storage';

interface CommandContext {
  storage: IStorage;
  broadcast: (data: any) => void;
}

interface Command {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder['addSubcommandGroup']>;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
}

const configCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup(group =>
      group
        .setName('identity')
        .setDescription('Customize how the bot appears in this server')
        .addSubcommand(sub =>
          sub
            .setName('nickname')
            .setDescription('Set a custom nickname for the bot in this server')
            .addStringOption(opt =>
              opt
                .setName('name')
                .setDescription('The nickname to use (leave empty to reset)')
                .setRequired(false)
                .setMaxLength(32)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('view')
            .setDescription('View the current bot identity settings')
        )
    )
    .addSubcommandGroup(group =>
      group
        .setName('features')
        .setDescription('Enable or disable bot features')
        .addSubcommand(sub =>
          sub
            .setName('list')
            .setDescription('View all available features and their status')
        )
        .addSubcommand(sub =>
          sub
            .setName('enable')
            .setDescription('Enable a feature')
            .addStringOption(opt =>
              opt
                .setName('feature')
                .setDescription('The feature to enable')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('disable')
            .setDescription('Disable a feature')
            .addStringOption(opt =>
              opt
                .setName('feature')
                .setDescription('The feature to disable')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('overview')
        .setDescription('View a summary of all bot configuration')
    ),

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const { storage } = context;
    const guildId = interaction.guildId;
    
    if (!guildId) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }

    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommandGroup === 'identity') {
        if (subcommand === 'nickname') {
          await handleNicknameCommand(interaction, guildId);
        } else if (subcommand === 'view') {
          await handleIdentityViewCommand(interaction, guildId);
        }
      } else if (subcommandGroup === 'features') {
        if (subcommand === 'list') {
          await handleFeaturesListCommand(interaction, guildId, storage);
        } else if (subcommand === 'enable') {
          await handleFeatureToggleCommand(interaction, guildId, storage, true);
        } else if (subcommand === 'disable') {
          await handleFeatureToggleCommand(interaction, guildId, storage, false);
        }
      } else if (subcommand === 'overview') {
        await handleOverviewCommand(interaction, guildId, storage);
      }
    } catch (error) {
      console.error('[Config] Command error:', error);
      const content = '❌ An error occurred while processing your request.';
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    }
  }
};

async function handleNicknameCommand(interaction: ChatInputCommandInteraction, guildId: string) {
  const nickname = interaction.options.getString('name') || null;
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    await guildIdentityService.updateNickname(guildId, nickname);
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Bot Nickname Updated')
      .setColor(0x00ff00)
      .setDescription(nickname 
        ? `The bot will now appear as **${nickname}** in this server.`
        : 'The bot nickname has been reset to default.'
      )
      .setFooter({ text: 'Changes may take a moment to sync' })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Failed to Update Nickname')
      .setColor(0xff0000)
      .setDescription(error.message || 'An unknown error occurred.')
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleIdentityViewCommand(interaction: ChatInputCommandInteraction, guildId: string) {
  await interaction.deferReply({ ephemeral: true });
  
  const profile = await guildIdentityService.getProfile(guildId);
  const botMember = interaction.guild?.members.me;
  
  const embed = new EmbedBuilder()
    .setTitle('🤖 Bot Identity Settings')
    .setColor(0x5865f2)
    .addFields(
      {
        name: '📝 Custom Nickname',
        value: profile?.nickname || '*Using default name*',
        inline: true
      },
      {
        name: '🖼️ Custom Avatar',
        value: profile?.avatarUrl ? '✅ Set' : '*Using default avatar*',
        inline: true
      },
      {
        name: '🔄 Auto-Sync',
        value: profile?.autoSyncEnabled !== false ? '✅ Enabled' : '❌ Disabled',
        inline: true
      },
      {
        name: '📊 Current Display',
        value: botMember?.displayName || 'Unknown',
        inline: true
      }
    )
    .setFooter({ text: 'Use /config identity nickname to change' })
    .setTimestamp();
  
  if (profile?.avatarUrl) {
    embed.setThumbnail(profile.avatarUrl);
  }
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleFeaturesListCommand(
  interaction: ChatInputCommandInteraction, 
  guildId: string,
  storage: IStorage
) {
  await interaction.deferReply({ ephemeral: true });
  
  const settings = await storage.getBotSettings(guildId);
  if (!settings) {
    await interaction.editReply({ content: '❌ Server settings not found. Please try again.' });
    return;
  }
  
  const categories = featureRegistry.getCategories();
  const categoryOptions = categories.map(cat => {
    const info = featureRegistry.getCategoryInfo(cat);
    const features = featureRegistry.getFeaturesByCategory(cat);
    const enabledCount = features.filter(f => featureRegistry.isFeatureEnabled(settings, f.id)).length;
    
    return new StringSelectMenuOptionBuilder()
      .setLabel(info.name)
      .setDescription(`${enabledCount}/${features.length} enabled - ${info.description.slice(0, 50)}`)
      .setValue(cat)
      .setEmoji(info.emoji);
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_feature_category')
    .setPlaceholder('Select a category to view features')
    .addOptions(categoryOptions);
  
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  
  const enabledFeatures = featureRegistry.getEnabledFeatures(settings);
  const totalFeatures = featureRegistry.getAllFeatures();
  
  const embed = new EmbedBuilder()
    .setTitle('🔧 Feature Configuration')
    .setColor(0x5865f2)
    .setDescription(`Your bot is a **Swiss Army Knife** with ${totalFeatures.length} available features!\n\n` +
      `**Currently Active:** ${enabledFeatures.length}/${totalFeatures.length} features enabled\n\n` +
      `Select a category below to view and manage features.`)
    .setFooter({ text: 'Use /config features enable/disable to toggle' })
    .setTimestamp();
  
  const response = await interaction.editReply({ embeds: [embed], components: [row] });
  
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 120000
  });
  
  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: '❌ This menu is not for you.', ephemeral: true });
      return;
    }
    
    const category = i.values[0] as FeatureCategory;
    const categoryInfo = featureRegistry.getCategoryInfo(category);
    const features = featureRegistry.getFeaturesByCategory(category);
    
    const featureLines = features.map(feature => {
      const status = featureRegistry.getFeatureStatus(settings, feature.id);
      let statusIcon = '❌';
      let statusText = 'Disabled';
      
      if (status.enabled) {
        if (status.configured) {
          statusIcon = '✅';
          statusText = 'Active';
        } else {
          statusIcon = '⚠️';
          statusText = 'Needs Setup';
        }
      }
      
      let line = `${statusIcon} ${feature.emoji} **${feature.name}**\n   ${feature.description}`;
      
      if (status.missingChannels.length > 0) {
        line += `\n   *Missing: ${status.missingChannels.join(', ')}*`;
      }
      
      return line;
    });
    
    const categoryEmbed = new EmbedBuilder()
      .setTitle(`${categoryInfo.emoji} ${categoryInfo.name}`)
      .setColor(0x5865f2)
      .setDescription(categoryInfo.description + '\n\n' + featureLines.join('\n\n'))
      .setFooter({ text: 'Use /config features enable <feature> to toggle' })
      .setTimestamp();
    
    await i.update({ embeds: [categoryEmbed], components: [row] });
  });
  
  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch {}
  });
}

async function handleFeatureToggleCommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  storage: IStorage,
  enable: boolean
) {
  const featureId = interaction.options.getString('feature', true);
  
  await interaction.deferReply({ ephemeral: true });
  
  const feature = featureRegistry.getFeature(featureId);
  if (!feature) {
    await interaction.editReply({ content: `❌ Unknown feature: \`${featureId}\`` });
    return;
  }
  
  if (!feature.settingKey) {
    await interaction.editReply({ 
      content: `❌ **${feature.name}** cannot be toggled directly. ` +
        `Configure its required channels instead.`
    });
    return;
  }
  
  try {
    await dbStorage.updateBotSettings(guildId, { [feature.settingKey]: enable });
    
    const embed = new EmbedBuilder()
      .setTitle(`${enable ? '✅' : '❌'} Feature ${enable ? 'Enabled' : 'Disabled'}`)
      .setColor(enable ? 0x00ff00 : 0xff0000)
      .setDescription(`${feature.emoji} **${feature.name}** has been ${enable ? 'enabled' : 'disabled'}.`)
      .setTimestamp();
    
    if (enable && feature.requiredChannels) {
      const settings = await storage.getBotSettings(guildId);
      if (settings) {
        const missing = featureRegistry.getMissingChannels(settings, featureId);
        if (missing.length > 0) {
          embed.addFields({
            name: '⚠️ Setup Required',
            value: `Configure these channels for full functionality:\n${missing.map(c => `• \`${c}\``).join('\n')}`
          });
        }
      }
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Config] Toggle error:', error);
    await interaction.editReply({ content: '❌ Failed to update feature setting.' });
  }
}

async function handleOverviewCommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  storage: IStorage
) {
  await interaction.deferReply({ ephemeral: true });
  
  const settings = await storage.getBotSettings(guildId);
  const profile = await guildIdentityService.getProfile(guildId);
  const guild = interaction.guild;
  
  if (!settings) {
    await interaction.editReply({ content: '❌ Server settings not found.' });
    return;
  }
  
  const enabledFeatures = featureRegistry.getEnabledFeatures(settings);
  const totalFeatures = featureRegistry.getAllFeatures();
  
  const categorySummary = featureRegistry.getCategories().map(cat => {
    const info = featureRegistry.getCategoryInfo(cat);
    const features = featureRegistry.getFeaturesByCategory(cat);
    const enabled = features.filter(f => featureRegistry.isFeatureEnabled(settings, f.id));
    return `${info.emoji} **${info.name}:** ${enabled.length}/${features.length}`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(`🔧 ${guild?.name || 'Server'} Configuration`)
    .setColor(0x5865f2)
    .setThumbnail(guild?.iconURL() || null)
    .addFields(
      {
        name: '🤖 Bot Identity',
        value: [
          `**Nickname:** ${profile?.nickname || '*Default*'}`,
          `**Avatar:** ${profile?.avatarUrl ? '✅ Custom' : '*Default*'}`,
          `**Prefix:** \`${settings.botPrefix || '!'}\``
        ].join('\n'),
        inline: true
      },
      {
        name: '📊 Features',
        value: `**${enabledFeatures.length}/${totalFeatures.length}** active\n\n${categorySummary}`,
        inline: false
      },
      {
        name: '🎫 Tickets',
        value: [
          `**Channel:** ${settings.ticketChannelId ? `<#${settings.ticketChannelId}>` : '*Not set*'}`,
          `**Auto-close:** ${settings.autoCloseEnabled ? `${settings.autoCloseHours}h` : 'Off'}`,
          `**Threads:** ${settings.threadIntegrationEnabled ? 'On' : 'Off'}`
        ].join('\n'),
        inline: true
      },
      {
        name: '🛡️ Moderation',
        value: [
          `**AutoMod:** ${settings.autoModEnabled ? 'On' : 'Off'}`,
          `**Link Filter:** ${settings.linkFilterEnabled ? 'On' : 'Off'}`,
          `**Log Channel:** ${settings.loggingChannelId ? `<#${settings.loggingChannelId}>` : '*Not set*'}`
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({ text: 'Use /config features list for detailed feature management' })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

export async function handleConfigAutocomplete(interaction: any): Promise<void> {
  try {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'feature') {
      const searchValue = focusedOption.value.toLowerCase();
      const allFeatures = featureRegistry.getAllFeatures();
      
      const filtered = allFeatures
        .filter(feature => 
          feature.id.toLowerCase().includes(searchValue) ||
          feature.name.toLowerCase().includes(searchValue) ||
          feature.category.toLowerCase().includes(searchValue)
        )
        .slice(0, 25)
        .map(feature => ({
          name: `${feature.emoji} ${feature.name} (${feature.category})`,
          value: feature.id
        }));
      
      await interaction.respond(filtered);
    }
  } catch (error) {
    console.error('[Config] Error handling autocomplete:', error);
    try {
      await interaction.respond([]);
    } catch (e) {}
  }
}

export function registerConfigCommands(commands: Collection<string, Command>) {
  commands.set(configCommand.data.name, configCommand as unknown as Command);
  console.log('[Config] Registered /config command');
}
