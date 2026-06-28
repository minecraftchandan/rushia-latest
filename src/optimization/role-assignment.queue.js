const { sendLog, sendError } = require('../utils/logger');

/**
 * Queue system for role assignments to prevent Discord API rate limiting
 * Handles 1000+ concurrent users by staggering role assignments with delays
 */
class RoleAssignmentQueue {
  constructor(delay = 500) {
    this.queue = [];
    this.processing = false;
    this.delay = delay; // milliseconds between assignments
    this.stats = {
      total: 0,
      processed: 0,
      failed: 0
    };
  }

  /**
   * Add a role assignment task to the queue
   * @param {Object} task - { guildId, userId, roleId, client, onSuccess, onFailure }
   */
  add(task) {
    this.queue.push(task);
    this.stats.total++;
    
    if (!this.processing) {
      this.process();
    }
    
    return this.stats.total;
  }

  async process() {
    if (this.queue.length === 0) {
      this.processing = false;
      
      // Log completion stats
      if (this.stats.total > 0) {
        sendLog(`[ROLE QUEUE] Complete - Total: ${this.stats.total}, Processed: ${this.stats.processed}, Failed: ${this.stats.failed}`, {
          operation: 'ROLE_ASSIGNMENT_QUEUE',
          action: 'COMPLETED',
          metadata: {
            stats: this.stats
          },
          tags: ['role', 'queue', 'completed']
        });
      }
      
      return;
    }

    this.processing = true;
    const task = this.queue.shift();

    try {
      const { guildId, userId, roleId, client, onSuccess, onFailure } = task;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) throw new Error(`Guild ${guildId} not found`);

      const member = await guild.members.fetch(userId);
      if (!member) throw new Error(`Member ${userId} not found in guild`);

      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error(`Role ${roleId} not found in guild`);

      await member.roles.add(role);
      
      this.stats.processed++;
      
      if (onSuccess) {
        await onSuccess(member, role, guild);
      }

      sendLog(`[ROLE QUEUE] Role assigned: ${role.name} to ${member.user.tag}`, {
        operation: 'ROLE_ASSIGNMENT_QUEUE',
        action: 'ASSIGNED',
        userId,
        guildId,
        metadata: {
          roleId,
          roleName: role.name,
          guildName: guild.name,
          queuePosition: this.stats.processed,
          queueRemaining: this.queue.length
        },
        tags: ['role', 'queue', 'assigned']
      });
    } catch (error) {
      this.stats.failed++;
      
      if (task.onFailure) {
        await task.onFailure(error);
      }

      sendError('[ROLE QUEUE] Task failed:', error, {
        operation: 'ROLE_ASSIGNMENT_QUEUE',
        action: 'FAILED',
        userId: task.userId,
        guildId: task.guildId,
        metadata: {
          roleId: task.roleId,
          queuePosition: this.stats.processed,
          queueRemaining: this.queue.length,
          error: error.message
        },
        tags: ['role', 'queue', 'error']
      });
    }

    // Schedule next task with staggered delay
    setTimeout(() => this.process(), this.delay);
  }

  /**
   * Get current queue status
   */
  status() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      delay: this.delay,
      stats: this.stats
    };
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clear the queue (emergency only)
   */
  clear() {
    const count = this.queue.length;
    this.queue = [];
    sendLog(`[ROLE QUEUE] Queue cleared - ${count} tasks removed`, {
      operation: 'ROLE_ASSIGNMENT_QUEUE',
      action: 'CLEARED',
      metadata: {
        tasksRemoved: count
      },
      tags: ['role', 'queue', 'cleared']
    });
  }

  /**
   * Set delay between assignments
   */
  setDelay(delayMs) {
    this.delay = delayMs;
    sendLog(`[ROLE QUEUE] Delay updated to ${delayMs}ms`, {
      operation: 'ROLE_ASSIGNMENT_QUEUE',
      action: 'CONFIG_CHANGED',
      metadata: { delay: delayMs },
      tags: ['role', 'queue', 'config']
    });
  }
}

module.exports = new RoleAssignmentQueue(500); // 500ms between assignments = handles 2000+ users/hour
