const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { BOT_OWNER_ID } = require('../config/constants');

async function handlePermsCheck(message) {
    if (message.author.id !== BOT_OWNER_ID) {
        return;
    }

    if (!message.guild) {
        return message.reply('This command can only be used in a server.');
    }

    const botMember = message.guild.members.me;
    const channel = message.channel;

    const requiredPerms = [
        { name: 'View Channels', flag: PermissionsBitField.Flags.ViewChannel, critical: true },
        { name: 'Send Messages', flag: PermissionsBitField.Flags.SendMessages, critical: true },
        { name: 'Read Message History', flag: PermissionsBitField.Flags.ReadMessageHistory, critical: true },
        { name: 'Mention Roles', flag: PermissionsBitField.Flags.MentionEveryone, critical: true },
        { name: 'Manage Messages', flag: PermissionsBitField.Flags.ManageMessages, critical: true },
        { name: 'Create Instant Invite', flag: PermissionsBitField.Flags.CreateInstantInvite, critical: true },
        { name: 'Embed Links', flag: PermissionsBitField.Flags.EmbedLinks, critical: false },
        { name: 'Add Reactions', flag: PermissionsBitField.Flags.AddReactions, critical: false },
    ];

    const serverPerms = requiredPerms.map(perm => ({
        ...perm,
        has: botMember.permissions.has(perm.flag)
    }));

    const channelPerms = requiredPerms.map(perm => ({
        ...perm,
        has: channel.permissionsFor(botMember).has(perm.flag)
    }));

    const criticalMissing = [...serverPerms, ...channelPerms].filter(p => p.critical && !p.has).length;
    const optionalMissing = [...serverPerms, ...channelPerms].filter(p => !p.critical && !p.has).length;

    const formatPerms = (perms) => perms.map(p => 
        `${p.has ? '🟢' : (p.critical ? '🔴' : '🟡')} \`${p.name}\``
    ).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('🔐 Permission Status')
        .setDescription(
            criticalMissing === 0 
                ? '✅ **All critical permissions granted**' 
                : `⚠️ **${criticalMissing} critical permission(s) missing**`
        )
        .addFields(
            { name: '🌐 Server-Wide', value: formatPerms(serverPerms), inline: true },
            { name: `📝 #${channel.name}`, value: formatPerms(channelPerms), inline: true }
        )
        .setColor(criticalMissing === 0 ? 0x2ecc71 : 0xe74c3c)
        .setFooter({ 
            text: `🟢 Granted | 🔴 Missing (Critical) | 🟡 Missing (Optional)`,
            iconURL: botMember.user.displayAvatarURL()
        })
        .setTimestamp();

    if (criticalMissing > 0 || optionalMissing > 0) {
        embed.addFields({
            name: '⚙️ Action Required',
            value: criticalMissing > 0 
                ? '❌ Bot will not function properly. Grant missing critical permissions.' 
                : '⚠️ Some features may be limited. Consider granting optional permissions.',
            inline: false
        });
    }

    await message.reply({ embeds: [embed] });
}

module.exports = { handlePermsCheck };
