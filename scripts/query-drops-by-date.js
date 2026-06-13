require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Connect to logs database
async function queryDrops() {
  try {
    console.log('🔌 Connecting to logs database...');
    await mongoose.connect(process.env.LOGS_URI);
    console.log('✅ Connected to logs database');

    // Get the Log model
    const Log = mongoose.model('Log', new mongoose.Schema({}, { strict: false, collection: 'logs' }));

    // Prompt for date (you can change this)
    const targetDate = process.argv[2] || '2024-06-07'; // Default to June 7, 2024
    console.log(`📅 Querying drops for date: ${targetDate}`);

    // Parse date
    const startDate = new Date(targetDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    console.log(`🔍 Searching from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Query logs
    const drops = await Log.find({
      'metadata.category': 'DROP_COUNT',
      timestamp: {
        $gte: startDate,
        $lt: endDate
      }
    }).sort({ timestamp: 1 }).lean();

    console.log(`✅ Found ${drops.length} drops`);

    if (drops.length === 0) {
      console.log('⚠️ No drops found for this date');
      await mongoose.disconnect();
      return;
    }

    // Prepare output directory
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Format filename with date
    const dateStr = targetDate.replace(/:/g, '-');
    const jsonFile = path.join(outputDir, `drops_${dateStr}.json`);
    const txtFile = path.join(outputDir, `drops_${dateStr}.txt`);

    // Save as JSON
    fs.writeFileSync(jsonFile, JSON.stringify(drops, null, 2));
    console.log(`💾 Saved JSON to: ${jsonFile}`);

    // Create readable TXT format
    let txtContent = `Drop Report for ${targetDate}\n`;
    txtContent += `Total Drops: ${drops.length}\n`;
    txtContent += `${'='.repeat(80)}\n\n`;

    drops.forEach((drop, index) => {
      txtContent += `#${index + 1}\n`;
      txtContent += `Time: ${drop.timestamp}\n`;
      txtContent += `User ID: ${drop.userId}\n`;
      txtContent += `Guild ID: ${drop.guildId}\n`;
      txtContent += `Card: ${drop.metadata?.cardName || 'N/A'}\n`;
      txtContent += `Rarity: ${drop.metadata?.rarity || 'N/A'}\n`;
      txtContent += `Total Count: ${drop.metadata?.drop_count || 'N/A'}\n`;
      txtContent += `Message: ${drop.message}\n`;
      txtContent += `-`.repeat(80) + '\n\n';
    });

    // Summary by user
    const userStats = {};
    drops.forEach(drop => {
      const userId = drop.userId;
      if (!userStats[userId]) {
        userStats[userId] = { count: 0, cards: [] };
      }
      userStats[userId].count++;
      userStats[userId].cards.push({
        card: drop.metadata?.cardName,
        rarity: drop.metadata?.rarity,
        time: drop.timestamp
      });
    });

    txtContent += `\n${'='.repeat(80)}\n`;
    txtContent += `SUMMARY BY USER\n`;
    txtContent += `${'='.repeat(80)}\n\n`;

    Object.entries(userStats).forEach(([userId, stats]) => {
      txtContent += `User ID: ${userId} - ${stats.count} drops\n`;
      stats.cards.forEach((card, i) => {
        txtContent += `  ${i + 1}. [${card.rarity}] ${card.card} at ${card.time}\n`;
      });
      txtContent += '\n';
    });

    fs.writeFileSync(txtFile, txtContent);
    console.log(`💾 Saved TXT to: ${txtFile}`);

    console.log('\n📊 Quick Summary:');
    console.log(`Total Drops: ${drops.length}`);
    console.log(`Unique Users: ${Object.keys(userStats).length}`);

    await mongoose.disconnect();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the query
queryDrops();
