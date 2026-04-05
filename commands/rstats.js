const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const os = require('os');

function extractDbName(uri) {
  if (!uri) return 'Not configured';
  try {
    const match = uri.match(/\.net\/([^?]+)/);
    return match ? match[1] : 'Unknown';
  } catch {
    return 'Invalid URI';
  }
}

function formatUptime(ms) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  
  return parts.join(' ') || '0s';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function pingDatabase(connection) {
  try {
    const start = Date.now();
    await connection.db.admin().ping();
    return `${Date.now() - start}ms`;
  } catch (error) {
    return 'Error';
  }
}

async function handleRstatsCommand(message) {
  const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

  if (message.author.id !== BOT_OWNER_ID) {
    await message.reply('🚫 This command is only available to the bot owner.');
    return;
  }

  // Send loading message
  const loadingMsg = await message.reply('<a:loading:1471139633894133812> Fetching bot statistics...');

  try {
    const client = message.client;
    
    // Bot stats
    const uptime = formatUptime(client.uptime);
    const ping = `${Math.round(client.ws.ping)}ms`;
    const serverCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const channelCount = client.channels.cache.size;
    
    // System stats
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Database info
    const mainDb = extractDbName(process.env.MONGODB_URI);
    const logsDb = extractDbName(process.env.LOGS_URI);
    const pogDb = extractDbName(process.env.POG_MONGODB_URI);
    const wishlistDb = extractDbName(process.env.WISHLIST_URI);
    
    // MongoDB connection states and ping
    const mainState = mongoose.connection.readyState;
    const stateMap = { 0: '❌ Disconnected', 1: '✅ Connected', 2: '🔄 Connecting', 3: '⚠️ Disconnecting' };
    
    // Get database ping latencies
    let mainDbPing = 'N/A';
    if (mainState === 1) {
      mainDbPing = await pingDatabase(mongoose.connection);
    }
    
    // Get other database connections
    const connections = mongoose.connections;
    let logsDbPing = 'N/A';
    let pogDbPing = 'N/A';
    let wishlistDbPing = 'N/A';
    
    for (const conn of connections) {
      if (conn.readyState === 1 && conn.name) {
        const dbPing = await pingDatabase(conn);
        if (conn.name === logsDb) logsDbPing = dbPing;
        else if (conn.name === pogDb) pogDbPing = dbPing;
        else if (conn.name === wishlistDb) wishlistDbPing = dbPing;
      }
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Statistics')
      .setColor(0x5865F2)
      .addFields(
        { name: '⏱️ Uptime', value: uptime, inline: true },
        { name: '🏓 Latency', value: ping, inline: true },
        { name: '🌍 Region', value: process.env.AWS_REGION || 'N/A', inline: true },
        { name: '🖥️ Servers', value: serverCount.toString(), inline: true },
        { name: '👥 Users', value: userCount.toLocaleString(), inline: true },
        { name: '📺 Channels', value: channelCount.toString(), inline: true },
        { name: '💾 Memory (Bot)', value: `${formatBytes(memUsage.heapUsed)} / ${formatBytes(memUsage.heapTotal)}`, inline: true },
        { name: '💾 Memory (System)', value: `${formatBytes(usedMem)} / ${formatBytes(totalMem)}`, inline: true },
        { name: '⚙️ Node.js', value: process.version, inline: true },
        { name: '<:db:1471141805327126608> Main DB', value: `${mainDb}\n${stateMap[mainState]}\n🏓 ${mainDbPing}`, inline: true },
        { name: '<:db:1471141805327126608> Logs DB', value: `${logsDb}\n🏓 ${logsDbPing}`, inline: true },
        { name: '<:db:1471141805327126608> POG DB', value: `${pogDb}\n🏓 ${pogDbPing}`, inline: true },
        { name: '<:db:1471141805327126608> Wishlist DB', value: `${wishlistDb}\n🏓 ${wishlistDbPing}`, inline: true },
        { name: '🔧 Platform', value: `${os.platform()} ${os.arch()}`, inline: true },
        { name: '⚡ CPU Cores', value: os.cpus().length.toString(), inline: true }
      )
      .setFooter({ text: `Requested by ${message.author.tag}` })
      .setTimestamp();

    await loadingMsg.edit({ content: null, embeds: [embed] });
  } catch (error) {
    console.error('Error in rstats command:', error);
    await loadingMsg.edit('❌ An error occurred while fetching bot statistics.');
  }
}

module.exports = { handleRstatsCommand };
