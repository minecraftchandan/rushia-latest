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
const { initializeSettings } = require('./src/utils/settings.manager');
const DatabaseManager = require('./src/database/database.manager');
const { logInfo, logError, logCritical, sendLog, sendError, initializeLogsDB } = require('./src/utils/logger');
const { handleCardInventorySystem } = require('./src/systems/cardInventorySystem');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.setMaxListeners(25);

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

const eventsPath = path.join(__dirname, 'src', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    const events = Array.isArray(event) ? event : [event];
    for (const e of events) {
        if (e.once) {
            client.once(e.name, (...args) => e.execute(...args));
        } else {
            client.on(e.name, (...args) => e.execute(...args));
        }
    }
}

const { handleGeneratorReaction } = require('./src/systems/message-generator.system');

let reminderSchedulerStarted = false;

client.on(Events.ShardDisconnect, async () => {
  if (reminderSchedulerStarted) {
    const { stopScheduler } = require('./src/tasks/reminder.scheduler');
    stopScheduler();
    reminderSchedulerStarted = false;
    await logInfo('SCHEDULER_STOPPED', { category: 'SYSTEM', metadata: { reason: 'SHARD_DISCONNECT' } }).catch(() => {});
  }
});

client.on(Events.Error, (error) => {
  logError('[CLIENT ERROR]', error, { category: 'SYSTEM' }).catch(() => {});
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await handleGeneratorReaction(reaction, user);
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    const defaultChannel = guild.channels.cache
      .filter(ch => 
        ch.type === 0 && 
        ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
      )
      .first();

    if (!defaultChannel) {
      await logInfo('No accessible text channel', { guildId: guild.id });
      return;
    }

    const guideMessage = "**Hello! Thanks for adding Rushia!**\n-# use `rconfig` to enable luvi helper";

    await defaultChannel.send(guideMessage);
    await logInfo('Setup guide sent', { guildId: guild.id, metadata: { guildName: guild.name } });
  } catch (error) {
    await logError('Setup message failed', error, { guildId: guild.id });
  }
});

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
    await logInfo('COMMANDS_DEPLOYED', {
      category: 'SYSTEM',
      metadata: { count: data.length }
    });
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
    await logError('Command deployment failed', error, { category: 'SYSTEM' });
    throw error;
  }
}

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
    
    await deployCommands(client);
    
    setInterval(() => {
      DatabaseManager.cleanup().catch(console.error);
    }, 24 * 60 * 60 * 1000);

  client.once(Events.ClientReady, async readyClient => {
        console.log(`✅ Bot logged in as ${readyClient.user.tag}`);
        
        await logInfo('BOT_READY', { 
          category: 'SYSTEM',
          metadata: { botTag: readyClient.user.tag, botId: readyClient.user.id }
        });
        
        console.log('📂 Initializing settings cache...');
        await initializeSettings();
        console.log('✅ Settings cache initialized');
        
        console.log('⏰ Starting reminder scheduler...');
        const Reminder = require('./src/database/reminder.model');
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const stale = await Reminder.deleteMany({
          status: 'pending',
          remindAt: { $lt: fiveMinutesAgo }
        });
        if (stale.deletedCount > 0) {
          await logInfo('[STARTUP] Stale reminders deleted', { category: 'SYSTEM', metadata: { count: stale.deletedCount } });
        }
        const stuckCount = await Reminder.updateMany(
          { status: 'claimed', claimedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } },
          { $set: { status: 'pending', claimedAt: null, updatedAt: new Date() } }
        );
        if (stuckCount.modifiedCount > 0) {
          await logInfo('[STARTUP] Stuck reminders recovered', { category: 'SYSTEM', metadata: { count: stuckCount.modifiedCount } });
        }
        if (!reminderSchedulerStarted) {
          startScheduler(readyClient);
          reminderSchedulerStarted = true;
        }
        console.log('✅ Reminder scheduler started');
        
        console.log('📦 Initializing inventory helper...');
        handleCardInventorySystem(readyClient);
        console.log('✅ Inventory helper initialized');
        
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
    await logCritical('Bot startup failed', error, { category: 'SYSTEM' });
    process.exit(1);
  }
})();

process.on('unhandledRejection', (error) => {
  logError('[UNHANDLED REJECTION]', error, { category: 'SYSTEM' }).catch(() => {});
});

process.on('uncaughtException', (error) => {
  logError('[UNCAUGHT EXCEPTION]', error, { category: 'SYSTEM' }).catch(() => {});
});

client.on('error', (error) => {
  logError('[CLIENT ERROR]', error, { category: 'SYSTEM' }).catch(() => {});
});
