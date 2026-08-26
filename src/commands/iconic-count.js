const { PermissionFlagsBits } = require('discord.js');
const { BOT_OWNER_ID } = require('../config/constants');
const { getSettings, updateSettings } = require('../utils/settings.manager');

async function handleIconicCountCommand(message, args = []) {
  if (!message.guild) {
    await message.reply('❌ This command can only be used in a server.');
    return;
  }

  const isOwner = message.author.id === BOT_OWNER_ID;
  const hasAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !hasAdmin) {
    await message.reply('❌ You need Administrator permission to configure the iconic count channel.');
    return;
  }

  const rawInput = Array.isArray(args) ? args.join(' ').trim() : '';
  const normalized = rawInput.toLowerCase();

  if (!rawInput || normalized === 'none') {
    await updateSettings(message.guild.id, { address: null });
    await message.reply('✅ Iconic count is now server-wide. Use `@bot ict #channel` or a channel ID to restrict it to one channel.');
    return;
  }

  let targetChannel = null;
  const mentionMatch = rawInput.match(/^<#(\d+)>$/);
  if (mentionMatch) {
    targetChannel = await message.guild.channels.fetch(mentionMatch[1]).catch(() => null);
  } else if (/^\d+$/.test(rawInput)) {
    targetChannel = await message.guild.channels.fetch(rawInput).catch(() => null);
  } else {
    targetChannel = await message.guild.channels.cache.find(channel =>
      channel.name.toLowerCase() === rawInput.toLowerCase().replace(/^#/, '')
    ) ?? null;
  }

  if (!targetChannel) {
    await message.reply('❌ Invalid channel. Please provide a channel mention (#channel) or a channel ID.');
    return;
  }

  if (!targetChannel.isTextBased()) {
    await message.reply('❌ Please choose a text channel.');
    return;
  }

  const perms = targetChannel.permissionsFor(message.guild.members.me);
  if (!perms || !perms.has('ViewChannel')) {
    await message.reply(`❌ I can’t access ${targetChannel}. Please make sure the bot can view that channel.`);
    return;
  }

  await updateSettings(message.guild.id, { address: targetChannel.id });
  const settings = await getSettings(message.guild.id);
  const address = settings?.address;

  if (!address) {
    await message.reply('❌ Failed to save the channel restriction.');
    return;
  }

  await message.reply('✅ Iconic count is now restricted to ' + targetChannel + '. Use `@bot ict none` to reset it back to server-wide mode.');
}

module.exports = { handleIconicCountCommand };
