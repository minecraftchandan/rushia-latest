require('dotenv').config();

const { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  Events, 
  PermissionsBitField,
  ActivityType,
  REST,
  Routes
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { startScheduler } = require('./src/tasks/reminder.scheduler');
const { startCacheRefreshScheduler, setClient: setCacheClient } = require('./src/tasks/cache-refresh.scheduler');
const { initializeSettings } = require('./src/utils/settings.manager');
const { initializeUserSettings } = require('./src/utils/user-settings.manager');
const DatabaseManager = require('./src/database/database.manager');
const { sendLog, sendError, initializeLogsDB, silenceConsole } = require('./src/utils/logger');
const { handleCardInventorySystem } = require('./src/systems/cardInventorySystem');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Load commands from ./commands folder
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

// Load event handlers from ./events folder
const eventsPath = path.join(__dirname, 'src', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Load event handlers from ./events folder
const { handleGeneratorReaction } = require('./src/systems/message-generator.system');

// Handle reactions for generator system and card rarity system
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await handleGeneratorReaction(reaction, user);
});

// Guild join welcome/setup guide
client.on(Events.GuildCreate, async (guild) => {
  try {
    const defaultChannel = guild.channels.cache
      .filter(ch => 
        ch.type === 0 && 
        ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
      )
      .first();

    if (!defaultChannel) {
      await sendLog(`No accessible text channel found in guild ${guild.name}`, { guildId: guild.id });
      return;
    }

    const guideMessage = `**Hello! Thanks for adding Rushia!**
-# use `rconfig` to enable luvi helper`;

    await defaultChannel.send(guideMessage);
    await sendLog(`Sent setup guide message in guild ${guild.name}`, { guildId: guild.id });
  } catch (error) {
    await sendError(`Failed to send setup message in guild ${guild.name}: ${error.message}`, { guildId: guild.id });
  }
});

// Deploy slash commands function
async function deployCommands(client) {
  console.log('🔄 Starting command deployment...');
  const commands = [];
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (!command.data) {
      console.error(`❌ Command ${file} is missing data export`);
      continue;
    }
    commands.push(command.data.toJSON());
  }

  console.log(`📋 Found ${commands.length} commands to deploy`);

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  
  try {
    console.log('⏳ Deploying commands to Discord...');
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log(`✅ Successfully deployed ${data.length} slash commands!`);
    await sendLog('COMMANDS_DEPLOYED', {
      category: 'SYSTEM',
      action: 'COMMANDS_DEPLOYED',
      count: data.length
    });
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
    await sendError(`Failed to deploy commands: ${error.message}`);
    throw error;
  }
}

// Connect to MongoDB and login the bot
(async () => {
  try {
    console.log('🚀 Starting bot initialization...');
    
    console.log('📦 Connecting to MongoDB...');
    await DatabaseManager.connect();
    console.log('✅ MongoDB connected');
    
    console.log('🗂️ Creating database indexes...');
    await DatabaseManager.createIndexes();
    console.log('✅ Database indexes created');
    
    console.log('📝 Initializing logs database...');
    await initializeLogsDB();
    console.log('✅ Logs database initialized');
    
    // Auto-deploy commands on startup
    await deployCommands(client);
    
    // Schedule daily cleanup
    setInterval(() => {
      DatabaseManager.cleanup().catch(console.error);
    }, 24 * 60 * 60 * 1000); // Daily

  client.once(Events.ClientReady, async readyClient => {
        console.log(`✅ Bot logged in as ${readyClient.user.tag}`);
        
        await sendLog('BOT_READY', { 
          category: 'SYSTEM',
          action: 'BOT_READY',
          botTag: readyClient.user.tag,
          botId: readyClient.user.id
        });
        
        console.log('📂 Initializing settings cache...');
        await initializeSettings();
        await initializeUserSettings();
        console.log('✅ Settings cache initialized');
        
        console.log('⏰ Starting reminder scheduler...');
        startScheduler(readyClient);
        console.log('✅ Reminder scheduler started');
        
        console.log('🗄️ Starting cache refresh scheduler...');
        setCacheClient(readyClient);
        startCacheRefreshScheduler();
        console.log('✅ Cache refresh scheduler started (every 5 minutes)');
        
        console.log('📦 Initializing inventory helper...');
        handleCardInventorySystem(readyClient);
        console.log('✅ Inventory helper initialized');
        
        console.log('🎮 Setting up bot activities...');
        
        console.log('🎮 Setting up bot activities...');
        const activities = [
          { name: 'boss spawns', type: ActivityType.Watching },
          { name: 'raid fatigue', type: ActivityType.Listening },
          { name: 'expeditions', type: ActivityType.Watching },
          { name: 'stamina refills', type: ActivityType.Listening },
          { name: 'card alerts', type: ActivityType.Watching },
          { name: 'game notifications', type: ActivityType.Playing }
        ];
        
        let activityIndex = 0;
        const updateActivity = () => {
          readyClient.user.setActivity(activities[activityIndex].name, { type: activities[activityIndex].type });
          activityIndex = (activityIndex + 1) % activities.length;
        };
        
        updateActivity();
        setInterval(updateActivity, 20000);
        console.log('✅ Bot activities configured (rotating every 20s)');
        
        console.log('\n🎉 Bot is fully operational!');
        console.log(`🔗 Invite: https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`);
        console.log(`📊 Servers: ${readyClient.guilds.cache.size}`);
        console.log(`👥 Users: ${readyClient.users.cache.size}`);
        console.log('\n✅ All systems ready!\n');
    });

    console.log('🔑 Logging in to Discord...');
    await client.login(process.env.BOT_TOKEN);
  } catch (error) {
    console.error('❌ Fatal error during bot startup:', error);
    await sendError(`Failed to start bot: ${error.message}`);
    process.exit(1);
  }
})();

// Global error handlers to prevent crashes
process.on('unhandledRejection', (error) => {
  sendError(`[UNHANDLED REJECTION] ${error.stack || error.message}`).catch(() => {});
});

process.on('uncaughtException', (error) => {
  sendError(`[UNCAUGHT EXCEPTION] ${error.stack || error.message}`).catch(() => {});
});

client.on('error', (error) => {
  sendError(`[CLIENT ERROR] ${error.stack || error.message}`).catch(() => {});
});
