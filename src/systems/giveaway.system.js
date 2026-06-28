const Giveaway = require('../database/giveaway.model');
const GiveawayConfig = require('../database/giveaway-config.model');
const { sendLog, sendError } = require('../utils/logger');
const roleAssignmentQueue = require('../optimization/role-assignment.queue');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class GiveawaySystem {
  constructor() {
    this.gwConfig = null;
    this.logWebhookUrl = process.env.LOG_WEBHOOK_URL;
    this.loadConfig();
  }

  async loadConfig() {
    try {
      const configPath = path.join(__dirname, '../../gw.json');
      const data = await fs.readFile(configPath, 'utf8');
      this.gwConfig = JSON.parse(data);
    } catch (error) {
      sendError('Error loading gw.json config:', error);
    }
  }

  isAllowedGuild(guildId) {
    if (!guildId || !this.gwConfig || !this.gwConfig.guild_id) {
      return false;
    }
    return guildId === this.gwConfig.guild_id;
  }

  async sendWebhook(embeds, content = '') {
    if (!this.logWebhookUrl) return;
    try {
      await axios.post(this.logWebhookUrl, {
        content: content || undefined,
        embeds
      });
    } catch (error) {
      console.error('Error sending webhook:', error.message);
    }
  }

  async trackTask(guildId, userId, username, taskType, client) {
    try {
      if (!this.isAllowedGuild(guildId)) {
        return null;
      }

      // Check if this task type is enabled in server config
      const config = await GiveawayConfig.findOne({ guildId });
      if (!config || !config.tasks[taskType] || !config.tasks[taskType].enabled) {
        return null; // Task not configured or disabled
      }

      // Find or create user's giveaway entry
      let giveaway = await Giveaway.findOne({ guildId, userId, taskType, completed: false });
      
      if (!giveaway) {
        // Create new giveaway entry for this user
        giveaway = new Giveaway({
          guildId,
          userId,
          username,
          taskType,
          currentCount: 0,
          targetCount: config.tasks[taskType].targetCount,
          roleId: config.tasks[taskType].roleId
        });
      }

      giveaway.currentCount += 1;
      giveaway.lastTrackedAt = new Date();

      if (giveaway.currentCount >= giveaway.targetCount) {
        giveaway.completed = true;
        giveaway.completedAt = new Date();
        
        await giveaway.save();
        
        // Update config stats
        await GiveawayConfig.updateOne(
          { guildId },
          { 
            $inc: { totalCompletions: 1 },
            $set: { lastUpdated: new Date() }
          }
        );
        
        await this.assignRole(guildId, userId, giveaway.roleId, client);
        
        return { completed: true, giveaway };
      }

      await giveaway.save();
      return { completed: false, giveaway };
    } catch (error) {
      sendError('Error tracking task:', error);
      return null;
    }
  }

  async assignRole(guildId, userId, roleId, client) {
    try {
      // Queue the role assignment to prevent Discord API rate limiting
      const queueId = roleAssignmentQueue.add({
        guildId,
        userId,
        roleId,
        client,
        onSuccess: async (member, role, guild) => {
          let dmSuccess = true;
          try {
            await member.send({
              content: `🎉 Congratulations! You have been assigned the **${role.name}** role in **${guild.name}** for completing your giveaway task!`
            });
          } catch (dmError) {
            dmSuccess = false;
            sendLog(`Could not DM user ${userId} about role assignment`);
            
            // Send webhook notification about DM failure
            await this.sendWebhook([
              {
                color: 0xFFA500,
                title: '⚠️ Role Assigned - DM Failed',
                fields: [
                  { name: 'User', value: `${member.user.tag} (${userId})`, inline: true },
                  { name: 'Guild', value: `${guild.name} (${guildId})`, inline: true },
                  { name: 'Role', value: `${role.name}`, inline: true },
                  { name: 'Error', value: 'Could not send DM to user', inline: false },
                  { name: 'Timestamp', value: new Date().toISOString(), inline: false }
                ]
              }
            ]);
          }

          // Send webhook for successful role assignment
          if (dmSuccess) {
            await this.sendWebhook([
              {
                color: 0x00FF00,
                title: '✅ Role Assigned & DM Sent',
                fields: [
                  { name: 'User', value: `${member.user.tag} (${userId})`, inline: true },
                  { name: 'Guild', value: `${guild.name} (${guildId})`, inline: true },
                  { name: 'Role', value: `${role.name}`, inline: true },
                  { name: 'Timestamp', value: new Date().toISOString(), inline: false }
                ]
              }
            ]);
          }
        },
        onFailure: async (error) => {
          // Send webhook notification about failure
          await this.sendWebhook([
            {
              color: 0xFF0000,
              title: '❌ Role Assignment Failed',
              fields: [
                { name: 'User ID', value: `${userId}`, inline: true },
                { name: 'Guild ID', value: `${guildId}`, inline: true },
                { name: 'Role ID', value: `${roleId}`, inline: true },
                { name: 'Error', value: error.message, inline: false },
                { name: 'Timestamp', value: new Date().toISOString(), inline: false }
              ]
            }
          ]);
        }
      });

      sendLog(`Role assignment queued for user ${userId} (Queue ID: ${queueId})`);
    } catch (error) {
      sendError('Error queuing role assignment:', error);
    }
  }

  async setTaskConfig(guildId, guildName, taskType, targetCount, roleId, roleName, createdBy) {
    try {
      if (!this.isAllowedGuild(guildId)) {
        return {
          success: false,
          message: 'This feature is only available in the configured server.'
        };
      }

      let config = await GiveawayConfig.findOne({ guildId });
      
      // Check if server already has an enabled giveaway task
      if (config) {
        const hasEnabledTask = Object.values(config.tasks || {}).some(
          (task) => task && task.enabled
        );
        if (hasEnabledTask) {
          return {
            success: false,
            message: 'This server already has an active giveaway configuration. Delete the existing one before creating a new one.'
          };
        }
      }
      
      if (!config) {
        config = new GiveawayConfig({
          guildId,
          guildName,
          tasks: {}
        });
      }

      config.tasks[taskType] = {
        taskType,
        targetCount,
        roleId,
        roleName,
        enabled: true,
        createdBy,
        createdAt: new Date()
      };
      
      config.lastUpdated = new Date();
      await config.save();

      return { success: true, config };
    } catch (error) {
      sendError('Error setting task config:', error);
      return { success: false, message: 'Failed to set task configuration.' };
    }
  }

  async getServerConfig(guildId) {
    try {
      return await GiveawayConfig.findOne({ guildId });
    } catch (error) {
      sendError('Error fetching server config:', error);
      return null;
    }
  }

  async deleteServerConfig(guildId, guildName, client) {
    try {
      const config = await GiveawayConfig.findOne({ guildId });
      if (!config) {
        return { success: true, deleted: false, rolesRemoved: 0 };
      }

      let rolesRemoved = 0;
      const guild = client?.guilds?.cache?.get(guildId);

      if (guild) {
        const roleIds = Object.values(config.tasks || {})
          .filter(Boolean)
          .map((task) => task.roleId)
          .filter(Boolean);

        for (const roleId of [...new Set(roleIds)]) {
          const role = guild.roles.cache.get(roleId);
          if (!role) continue;

          // Collect all members with this role and remove with staggered delays
          const members = Array.from(role.members.values());
          
          for (let i = 0; i < members.length; i++) {
            const member = members[i];
            
            // Add staggered delay to prevent rate limiting (every 5 members, add extra delay)
            if (i % 5 === 0 && i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            try {
              await member.roles.remove(role);
              rolesRemoved += 1;
            } catch (memberError) {
              sendError(`Error removing role ${roleId} from member ${member.id}:`, memberError);
            }
          }
        }
      }

      await Giveaway.deleteMany({ guildId });
      await GiveawayConfig.deleteOne({ guildId });

      // Send webhook notification about config deletion
      const tasksList = Object.values(config.tasks || {})
        .filter(Boolean)
        .map(task => `**${task.taskType}** (Target: ${task.targetCount})`)
        .join('\n');

      await this.sendWebhook([
        {
          color: 0xFF0000,
          title: '🗑️ Giveaway Config Deleted',
          fields: [
            { name: 'Guild', value: `${guildName} (${guildId})`, inline: true },
            { name: 'Roles Removed', value: `${rolesRemoved}`, inline: true },
            { name: 'Tasks Removed', value: tasksList || 'None', inline: false },
            { name: 'Timestamp', value: new Date().toISOString(), inline: false }
          ]
        }
      ]);

      return { success: true, deleted: true, rolesRemoved };
    } catch (error) {
      sendError('Error deleting server config:', error);
      return { success: false, deleted: false, rolesRemoved: 0 };
    }
  }

  async disableTask(guildId, taskType) {
    try {
      await GiveawayConfig.updateOne(
        { guildId },
        { 
          $set: { 
            [`tasks.${taskType}.enabled`]: false,
            lastUpdated: new Date()
          }
        }
      );
      return { success: true };
    } catch (error) {
      sendError('Error disabling task:', error);
      return { success: false };
    }
  }

  async enableTask(guildId, taskType) {
    try {
      await GiveawayConfig.updateOne(
        { guildId },
        { 
          $set: { 
            [`tasks.${taskType}.enabled`]: true,
            lastUpdated: new Date()
          }
        }
      );
      return { success: true };
    } catch (error) {
      sendError('Error enabling task:', error);
      return { success: false };
    }
  }

  async getUserProgress(guildId, userId, taskType) {
    try {
      return await Giveaway.findOne({ guildId, userId, taskType, completed: false });
    } catch (error) {
      sendError('Error fetching user progress:', error);
      return null;
    }
  }

  async getAllActiveGiveaways(guildId) {
    try {
      return await Giveaway.find({ guildId, completed: false });
    } catch (error) {
      sendError('Error fetching active giveaways:', error);
      return [];
    }
  }

  async getLeaderboard(guildId, taskType, limit = 10) {
    try {
      return await Giveaway.find({ guildId, taskType, completed: false })
        .sort({ currentCount: -1 })
        .limit(limit);
    } catch (error) {
      sendError('Error fetching leaderboard:', error);
      return [];
    }
  }

  async updateParticipantCount(guildId) {
    try {
      const uniqueUsers = await Giveaway.distinct('userId', { guildId });
      await GiveawayConfig.updateOne(
        { guildId },
        { 
          $set: { 
            totalParticipants: uniqueUsers.length,
            lastUpdated: new Date()
          }
        }
      );
    } catch (error) {
      sendError('Error updating participant count:', error);
    }
  }

  getTaskEmbed(taskType) {
    if (!this.gwConfig || !this.gwConfig.tasks) return null;
    return this.gwConfig.tasks[taskType];
  }
}

module.exports = new GiveawaySystem();
