const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');
const { BOT_OWNER_ID } = require('../config/constants');

// ---------- command type badges ----------
const CMD_TYPE = {
  SLASH: 'slash',
  PREFIX: 'prefix',
  MENTION: 'mention',
  REACTION: 'reaction'
};

const CMD_TYPE_BADGE = {
  [CMD_TYPE.SLASH]: '💬',
  [CMD_TYPE.PREFIX]: '⌨️',
  [CMD_TYPE.MENTION]: '🤖',
  [CMD_TYPE.REACTION]: '🖱️'
};

function badge(type) {
  return CMD_TYPE_BADGE[type] || '';
}

// ---------- category command data ----------
// Each category has `sections`, each section has a name and a list of commands.
// Each command: { type, command, description, types (optional badge list for multi-value args) }
const HELP_CATEGORIES = {
  overview: {
    title: '🌸 RUSHIA BOT — HELP CENTER',
    description: 'Welcome to Rushia! Your guide to commands, raids, notifications, cards, leaderboards and server tools.',
    stats: [
      { icon: '📌', title: 'Commands', sub: '30+ commands' },
      { icon: '⚙️', title: 'Server', sub: 'Configuration & roles' },
      { icon: '🔔', title: 'Notifications', sub: 'Reminders & DMs' },
      { icon: '🎴', title: 'Cards', sub: 'Wishlist & inventory' },
      { icon: '🏆', title: 'Leaderboards', sub: 'Drops, clash & iconic' },
      { icon: '⚔️', title: 'Raids', sub: 'Raid roles & alerts' },
      { icon: '🎁', title: 'Giveaways', sub: 'Giveaway configuration' },
      { icon: '🛠️', title: 'Utilities', sub: 'Admin & tools' }
    ]
  },
  server: {
    title: '⚙️ SERVER SETUP',
    description: "Configure Rushia's server-wide features, roles and alerts.",
    sections: [
      {
        name: '👑 Boss Roles',
        commands: [
          { type: CMD_TYPE.SLASH, command: '/view-settings', description: 'View current boss role configuration.' },
          { type: CMD_TYPE.SLASH, command: '/set-boss-role [role]', description: 'Set or remove the global boss ping role.' },
          { type: CMD_TYPE.SLASH, command: '/multi-roles enable', description: 'Enable separate roles for each boss tier.' },
          { type: CMD_TYPE.SLASH, command: '/multi-roles disable', description: 'Disable multi-role mode and use a single boss role.' },
          { type: CMD_TYPE.SLASH, command: '/multi-roles set-boss <tier> [role]', description: 'Assign a role to a specific boss tier.' }
        ]
      },
      {
        name: '📊 Other Server Settings',
        commands: [
          { type: CMD_TYPE.MENTION, command: '@Rushia ict [#channel|channelId|none]', description: 'Restrict iconic counting to one channel.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia raidconfig', description: 'Configure raid roles.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia setpog [#channel]', description: 'Configure POG alert channel.' }
        ]
      },
      {
        name: '🧩 Admin Panel',
        commands: [
          { type: CMD_TYPE.SLASH, command: '/config', description: 'Open the full admin configuration panel.', highlight: true }
        ]
      }
    ]
  },
  notifications: {
    title: '🔔 NOTIFICATIONS & REMINDERS',
    description: 'Manage your personal notifications, reminders and DM alerts.',
    sections: [
      {
        name: '🔔 Notification Preferences',
        commands: [
          { type: CMD_TYPE.SLASH, command: '/notifications view', description: 'View current notification preferences.' },
          { type: CMD_TYPE.SLASH, command: '/notifications set <type> <enabled>', description: 'Enable or disable a notification type.', typeBadges: ['expedition', 'stamina', 'raid', 'raidSpawnReminder', 'drop'] }
        ]
      },
      {
        name: '📩 Direct Messages',
        commands: [
          { type: CMD_TYPE.SLASH, command: '/dm enable <type>', description: 'Enable DM reminders.' },
          { type: CMD_TYPE.SLASH, command: '/dm disable <type>', description: 'Disable DM reminders.', typeBadges: ['expedition', 'stamina', 'raidSpawn', 'drop'] }
        ]
      },
      {
        name: '⚡ Temporary Raid Channel',
        commands: [
          { type: CMD_TYPE.MENTION, command: '@Rushia here', description: 'Temporarily redirect raid reminders to the current channel.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia unhere', description: 'Clear the temporary reminder channel override.' }
        ]
      }
    ]
  },
  wishlist: {
    title: '🎴 WISHLIST & CARDS',
    description: 'Manage your wishlist and card inventory.',
    sections: [
      {
        name: 'Wishlist',
        commands: [
          { type: CMD_TYPE.MENTION, command: '@Rushia wa <card name>', description: 'Add a card to your wishlist.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia wl [@user or userId]', description: "View your own or another user's wishlist." },
          { type: CMD_TYPE.MENTION, command: '@Rushia wr <card name>', description: 'Remove a card from your wishlist.' }
        ]
      },
      {
        name: '✏️ Pencil Reaction',
        commands: [
          { type: CMD_TYPE.REACTION, command: '✏️ Pencil', description: 'Open the card inventory / edit view for the user linked to the message.' }
        ]
      }
    ]
  },
  leaderboards: {
    title: '🏆 LEADERBOARDS',
    description: "Track Rushia's community statistics.",
    sections: [
      {
        name: 'Main Hub',
        commands: [
          { type: CMD_TYPE.PREFIX, command: 'rlb', description: 'Main leaderboard hub.' }
        ]
      },
      {
        name: 'Select Leaderboard',
        commands: [],
        note: 'Use the category selector to switch between the major leaderboard views.\n**Options:** 🟡 Drops • 🔴 Rare Drops • ⚔️ Clash • ✨ Iconic'
      },
      {
        name: 'Quick Commands',
        commands: [
          { type: CMD_TYPE.PREFIX, command: 'rdlb', description: 'Drop leaderboard.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia rrlb', description: 'Rare drop leaderboard.' },
          { type: CMD_TYPE.PREFIX, command: 'rclb', description: 'Clash leaderboard.' },
          { type: CMD_TYPE.PREFIX, command: 'rilb', description: 'Iconic leaderboard.' }
        ]
      }
    ]
  },
  raids: {
    title: '⚔️ RAIDS',
    description: 'Manage raid roles, raid alerts and raid interactions.',
    sections: [
      {
        name: '<a:bell:1543246602074849280> Raid Bell',
        commands: [
          { type: CMD_TYPE.REACTION, command: '<a:bell:1543246602074849280> Bell', description: 'React to a valid raid embed with the bell to ping the matching element role.', highlight: true }
        ]
      },
      {
        name: 'Raid Roles',
        commands: [],
        note: '👥 **Raid Member** — Can react to ping their matching element role.\n🚫 **Non-Member** — Reaction is removed, with a warning in-channel.\n👑 **Raid Leader** — Sees the summon UI instead of the normal bell flow.'
      },
      {
        name: 'Raid Tools',
        commands: [
          { type: CMD_TYPE.MENTION, command: '@Rushia raidconfig', description: 'Configure raid roles.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia here', description: 'Temporarily redirect raid reminders.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia unhere', description: 'Clear the temporary override.' }
        ]
      }
    ]
  },
  giveaways: {
    title: '🎁 GIVEAWAYS',
    description: 'Configure and manage Rushia giveaways.',
    sections: [
      {
        name: 'Setup',
        commands: [
          { type: CMD_TYPE.MENTION, command: '@Rushia gawk set', description: 'Start giveaway configuration.' },
          { type: CMD_TYPE.MENTION, command: '@Rushia gawk view', description: 'View the current giveaway configuration.' }
        ]
      }
    ]
  },
  admin: {
    title: '🛠️ ADMIN & UTILITIES',
    description: 'Advanced commands available to authorized administrators.',
    requiresAdmin: true,
    sections: [
      {
        name: 'Leaderboard Admin',
        commands: [
          { type: CMD_TYPE.PREFIX, command: 'radd', description: 'Manually update leaderboard data.', admin: true },
          { type: CMD_TYPE.PREFIX, command: 'rdel', description: 'Manually remove leaderboard data.', admin: true }
        ]
      },
      {
        name: 'Role Delays',
        commands: [
          { type: CMD_TYPE.PREFIX, command: 'rdelay <roleId> <time>', description: 'Delay a role action.', admin: true },
          { type: CMD_TYPE.PREFIX, command: 'rdelays', description: 'View active delayed role jobs.', admin: true }
        ]
      },
      {
        name: 'Suggestions',
        commands: [
          { type: CMD_TYPE.SLASH, command: '/suggestion <suggestion>', description: 'Send a suggestion to the bot owner.' }
        ]
      }
    ]
  }
};

const HELP_OPTION_ORDER = ['overview', 'server', 'notifications', 'wishlist', 'leaderboards', 'raids', 'giveaways', 'admin'];
const helpStateByUser = new Map();

function getCategoryLabel(key) {
  const labels = {
    overview: '🌸 Overview',
    server: '⚙️ Server Setup',
    notifications: '🔔 Notifications',
    wishlist: '🎴 Wishlist & Cards',
    leaderboards: '🏆 Leaderboards',
    raids: '⚔️ Raids',
    giveaways: '🎁 Giveaways',
    admin: '🛠️ Admin & Utilities'
  };
  return labels[key] || 'Help';
}

// A member "is admin" for the purposes of the Admin & Utilities category if
// they can manage the guild, or are the bot owner (DMs / edge cases).
function memberIsAdmin(interactionOrMessage) {
  const member = interactionOrMessage.member;
  const userId = interactionOrMessage.user?.id || interactionOrMessage.author?.id;
  if (userId && userId === BOT_OWNER_ID) return true;
  if (!member || !member.permissions) return false;
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function visibleCategoryOrder(isAdmin) {
  return isAdmin ? HELP_OPTION_ORDER : HELP_OPTION_ORDER.filter(key => !HELP_CATEGORIES[key].requiresAdmin);
}

function buildCategoryTextContent(categoryKey = 'overview') {
  const category = HELP_CATEGORIES[categoryKey] || HELP_CATEGORIES.overview;

  if (categoryKey === 'overview') {
    const statLines = category.stats.map(stat => `${stat.icon} **${stat.title}** — ${stat.sub}`).join('\n');
    return [
      '## 🌸 RUSHIA BOT — HELP CENTER',
      category.description,
      '',
      statLines
    ].join('\n');
  }

  const sectionBlocks = (category.sections || []).map(section => {
    const lines = [`### ${section.name}`];

    if (section.note) {
      lines.push(section.note);
    }

    for (const cmd of section.commands || []) {
      const prefix = cmd.highlight ? '⭐ ' : '';
      const adminTag = cmd.admin ? ' `ADMIN`' : '';
      lines.push(`${badge(cmd.type)} \`${cmd.command}\`${adminTag}${prefix ? ` ${prefix}` : ''}`);
      lines.push(cmd.description);
      if (cmd.typeBadges?.length) {
        lines.push(cmd.typeBadges.map(t => `\`${t}\``).join(' '));
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }).join('\n\n');

  return [`## ${category.title}`, category.description, '', sectionBlocks].join('\n');
}

function buildLegacyCategoryComponents(userId, category, previousCategory = 'overview', isAdmin = false) {
  const options = visibleCategoryOrder(isAdmin).map(key => ({
    label: getCategoryLabel(key),
    value: key,
    default: key === category,
    description: key === 'overview' ? 'Main help page' : 'Command overview'
  }));

  const dropdown = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`help_category_${userId}`)
      .setPlaceholder('📚 Select a category...')
      .addOptions(options)
  );

  return [dropdown];
}

function buildCategoryComponents(userId, category, previousCategory = 'overview', isAdmin = false) {
  const options = visibleCategoryOrder(isAdmin).map(key => ({
    label: getCategoryLabel(key),
    value: key,
    default: key === category,
    description: key === 'overview' ? 'Main help page' : 'Command overview'
  }));

  const dropdown = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`help_category_${userId}`)
      .setPlaceholder('📚 Select a category...')
      .addOptions(options)
  );

  const container = new ContainerBuilder()
    .setAccentColor(0xD98FFF)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buildCategoryTextContent(category))
    );

  if (category !== 'overview') {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
  }

  container
    .addActionRowComponents(dropdown);

  return [container];
}

function buildHelpUpdatePayload(interaction, userId, category, previousCategory, isAdmin) {
  if (interaction.message?.flags?.has(MessageFlags.IsComponentsV2)) {
    return {
      components: buildCategoryComponents(userId, category, previousCategory, isAdmin),
      flags: MessageFlags.IsComponentsV2
    };
  }

  return {
    embeds: [buildHelpContentEmbed(category, previousCategory, interaction.client.user)],
    components: buildLegacyCategoryComponents(userId, category, previousCategory, isAdmin)
  };
}

function buildHelpEmbed(categoryKey = 'overview', previousCategory = 'overview', botUser = null) {
  const category = HELP_CATEGORIES[categoryKey] || HELP_CATEGORIES.overview;
  const embed = new EmbedBuilder()
    .setTitle(category.title)
    .setDescription(category.description)
    .setColor(0xD98FFF)
    .setFooter({
      text: categoryKey === 'overview'
        ? 'Use the menu below to find commands and features.'
        : `Back: ${getCategoryLabel(previousCategory)}`
    });

  if (botUser) {
    embed.setAuthor({
      name: botUser.username,
      iconURL: botUser.displayAvatarURL({ size: 128 })
    });
  }

  if (categoryKey === 'overview') {
    embed.addFields(category.stats.map(stat => ({ name: `${stat.icon} ${stat.title}`, value: stat.sub, inline: true })));
  } else {
    for (const section of category.sections || []) {
      if (section.note) {
        embed.addFields({ name: section.name, value: section.note, inline: false });
      }
      if (section.commands?.length) {
        const value = section.commands.map(cmd => {
          const adminTag = cmd.admin ? ' `ADMIN`' : '';
          const typeBadges = cmd.typeBadges?.length ? `\n${cmd.typeBadges.map(t => `\`${t}\``).join(' ')}` : '';
          return `${badge(cmd.type)} \`${cmd.command}\`${adminTag}\n${cmd.description}${typeBadges}`;
        }).join('\n\n');
        embed.addFields({ name: section.name, value, inline: false });
      }
    }
  }

  return embed;
}

function buildHelpContentEmbed(categoryKey = 'overview', previousCategory = 'overview', botUser = null) {
  return buildHelpEmbed(categoryKey, previousCategory, botUser);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows the Rushia Bot help center'),

  async execute(interaction) {
    const isAdmin = memberIsAdmin(interaction);
    helpStateByUser.set(interaction.user.id, 'overview');
    const components = buildCategoryComponents(interaction.user.id, 'overview', 'overview', isAdmin);
    await interaction.reply({
      components,
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true
    });
  }
};

async function handleHelpCategory(interaction) {
  if (!interaction.customId.startsWith('help_category_')) return false;

  const userId = interaction.customId.replace('help_category_', '');
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'This help panel is not for you.', ephemeral: true });
    return true;
  }

  const isAdmin = memberIsAdmin(interaction);
  const category = interaction.values[0];

  if (HELP_CATEGORIES[category]?.requiresAdmin && !isAdmin) {
    await interaction.reply({ content: 'You need the **Manage Server** permission to view Admin & Utilities.', ephemeral: true });
    return true;
  }

  const previousCategory = helpStateByUser.get(userId) || 'overview';
  const nextCategory = category;
  helpStateByUser.set(userId, nextCategory);
  await interaction.update(buildHelpUpdatePayload(interaction, userId, nextCategory, previousCategory, isAdmin));
  return true;
}

async function handleHelpButton(interaction) {
  if (!interaction.customId.startsWith('help_')) return false;

  const [, action, userId, previousCategory] = interaction.customId.split('_');
  if (!userId || interaction.user.id !== userId) {
    await interaction.reply({ content: 'This help panel is not for you.', ephemeral: true });
    return true;
  }

  const isAdmin = memberIsAdmin(interaction);

  if (action === 'home') {
    helpStateByUser.set(userId, 'overview');
    await interaction.update(buildHelpUpdatePayload(interaction, userId, 'overview', 'overview', isAdmin));
    return true;
  }

  if (action === 'back') {
    const targetCategory = previousCategory || helpStateByUser.get(userId) || 'overview';
    if (HELP_CATEGORIES[targetCategory]?.requiresAdmin && !isAdmin) {
      helpStateByUser.set(userId, 'overview');
      await interaction.update(buildHelpUpdatePayload(interaction, userId, 'overview', 'overview', isAdmin));
      return true;
    }

    helpStateByUser.set(userId, targetCategory);
    await interaction.update(buildHelpUpdatePayload(interaction, userId, targetCategory, 'overview', isAdmin));
    return true;
  }

  return false;
}

async function handleHelpCommand(message) {
  const isAdmin = memberIsAdmin(message);
  const embed = buildHelpContentEmbed('overview', 'overview', message.client.user);
  const legacyComponents = buildLegacyCategoryComponents(message.author.id, 'overview', 'overview', isAdmin);
  await message.reply({ embeds: [embed], components: legacyComponents });
}

module.exports.handleHelpCategory = handleHelpCategory;
module.exports.handleHelpButton = handleHelpButton;
module.exports.handleHelpCommand = handleHelpCommand;