const axios = require('axios');

const BIRTHDAY_CHANNEL_ID = '1521077685131153502';
const BIRTHDAY_DATA_CHANNEL_ID = '1541637140478300190';
const ELIGIBLE_USER_ID = '829968432328998912';
const DATA_PREFIX = 'birthday-system-data:';
const birthdayData = {
  roles: {},
  processed: []
};
let dataMessage = null;
let dataMessages = [];
let dataLoadPromise = null;

async function loadData(client) {
  if (dataLoadPromise) {
    return dataLoadPromise;
  }

  dataLoadPromise = (async () => {
    const channel = await client.channels.fetch(BIRTHDAY_DATA_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Birthday data channel ${BIRTHDAY_DATA_CHANNEL_ID} is not a text channel`);
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    dataMessages = messages.filter(message =>
      message.author.id === client.user.id && message.content.startsWith(DATA_PREFIX)
    ).sort((first, second) => first.createdTimestamp - second.createdTimestamp);

    if (dataMessages.length > 0) {
      dataMessage = dataMessages[0];
      const storedData = dataMessages
        .map(message => message.content.slice(DATA_PREFIX.length))
        .join('');
      const parsed = JSON.parse(storedData);
      if (parsed && typeof parsed === 'object') {
        birthdayData.roles = parsed.roles && typeof parsed.roles === 'object' ? parsed.roles : {};
        birthdayData.processed = Array.isArray(parsed.processed) ? parsed.processed : [];
      }
    } else {
      dataMessage = await channel.send({ content: `${DATA_PREFIX}${JSON.stringify(birthdayData)}` });
      dataMessages = [dataMessage];
    }
  })();

  try {
    await dataLoadPromise;
  } catch (error) {
    dataLoadPromise = null;
    throw error;
  }
}

async function saveData(client) {
  await loadData(client);
  const serializedData = JSON.stringify(birthdayData);
  const chunkSize = 2000 - DATA_PREFIX.length;
  const chunks = [];
  for (let index = 0; index < serializedData.length; index += chunkSize) {
    chunks.push(serializedData.slice(index, index + chunkSize));
  }

  const savedMessages = [];
  for (let index = 0; index < chunks.length; index++) {
    const content = `${DATA_PREFIX}${chunks[index]}`;
    const existingMessage = dataMessages[index];
    const savedMessage = existingMessage
      ? await existingMessage.edit({ content })
      : await dataMessage.channel.send({ content });
    savedMessages.push(savedMessage);
  }

  for (let index = chunks.length; index < dataMessages.length; index++) {
    await dataMessages[index].delete();
  }

  dataMessages = savedMessages;
  dataMessage = savedMessages[0];
}

function getWebhookUrl() {
  return process.env.LOG_WEBHOOK_URL;
}

async function sendWebhook(embed) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return;
  }

  await axios.post(webhookUrl, { embeds: [embed] });
}

function isBirthdayMessage(message) {
  return Boolean(message.guild)
    && message.channelId === BIRTHDAY_CHANNEL_ID
    && /\bhappy\b/i.test(message.content)
    && /\b(?:birthday|bday|b'day)\b/i.test(message.content)
    && message.mentions.users.has(ELIGIBLE_USER_ID);
}

async function processBirthdayMessage(message) {
  if (message.author.bot || !isBirthdayMessage(message)) {
    return;
  }

  await loadData(message.client);
  const roleId = birthdayData.roles[message.guildId];
  const targetUser = message.author;
  if (!roleId || targetUser.id === ELIGIBLE_USER_ID || targetUser.bot) {
    return;
  }

  const trackingKey = `${message.guildId}:${targetUser.id}:${roleId}`;
  if (birthdayData.processed.includes(trackingKey)) {
    return;
  }

  try {
    const member = await message.guild.members.fetch(targetUser.id);
    const role = await message.guild.roles.fetch(roleId);
    if (!role) {
      throw new Error(`Birthday role ${roleId} was not found`);
    }

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Birthday event eligibility');
    }

    birthdayData.processed.push(trackingKey);
    await saveData(message.client);

    let dmSent = true;
    try {
      await targetUser.send(
        `🎉 You have acquired the **${role.name}** role in **${message.guild.name}** for eligibility in the birthday event!`
      );
    } catch (error) {
      dmSent = false;
      console.error(`Could not DM birthday role recipient ${targetUser.id}:`, error.message);
    }

    await sendWebhook({
      color: dmSent ? 0x00ff00 : 0xffaa00,
      title: dmSent ? 'Birthday role assigned' : 'Birthday role assigned (DM failed)',
      fields: [
        { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'Guild', value: `${message.guild.name} (${message.guildId})`, inline: true },
        { name: 'Role', value: `${role.name} (${role.id})`, inline: true },
        { name: 'Source message', value: message.url, inline: false },
        { name: 'Timestamp', value: new Date().toISOString(), inline: false }
      ]
    });
  } catch (error) {
    console.error(`Birthday role assignment failed for ${targetUser.id}:`, error);
    try {
      await sendWebhook({
        color: 0xff0000,
        title: 'Birthday role assignment failed',
        fields: [
          { name: 'User ID', value: targetUser.id, inline: true },
          { name: 'Guild ID', value: message.guildId, inline: true },
          { name: 'Role ID', value: roleId, inline: true },
          { name: 'Error', value: error.message, inline: false },
          { name: 'Timestamp', value: new Date().toISOString(), inline: false }
        ]
      });
    } catch (webhookError) {
      console.error('Could not send birthday assignment failure webhook:', webhookError.message);
    }
  }
}

async function handleBirthdayCommand(message, role) {
  if (!message.guild || !role) {
    await message.reply('Please mention a role, for example: `@bot hbd @Birthday`');
    return;
  }

  if (!message.member.permissions.has('ManageRoles')) {
    await message.reply('You need the **Manage Roles** permission to configure the birthday role.');
    return;
  }

  birthdayData.roles[message.guildId] = role.id;
  birthdayData.processed = birthdayData.processed.filter(
    key => !key.startsWith(`${message.guildId}:`)
  );
  await saveData(message.client);
  await message.reply(`Birthday eligibility role set to ${role}.`);
}

module.exports = {
  processBirthdayMessage,
  handleBirthdayCommand
};
