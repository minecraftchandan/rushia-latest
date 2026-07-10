const express = require('express');
const os = require('os');
const axios = require('axios');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function createHealthServer({ client, logger, port = process.env.HEALTH_PORT || 3000 }) {
  const app = express();

  const webhookUrl = process.env.HEALTH_WEBHOOK || process.env.HEALTH_WEBHOOK_URL || null;
  const webhookIntervalMs = parseInt(process.env.HEALTH_WEBHOOK_INTERVAL_MS || '60000', 10);

  async function sendHealthWebhook() {
    if (!webhookUrl) return;
    try {
      const uptime = process.uptime();
      const memory = process.memoryUsage();
      const guildCount = client?.guilds?.cache?.size || 0;
      const userCount = client?.users?.cache?.size || 0;
      const ready = client?.user ? true : false;
      const ping = client?.ws?.ping || null;
      const latestError = logger?.getLatestError ? await logger.getLatestError() : null;
      const lastErrorAt = latestError ? new Date(latestError.timestamp || latestError.createdAt || Date.now()).toISOString() : 'None';

      const lastEventAt = client?.lastEventAt || 0;
      const now = Date.now();
      const lastEventAgeMs = lastEventAt ? now - lastEventAt : Infinity;
      const downThresholdMs = parseInt(process.env.HEALTH_DOWN_THRESHOLD_MS || '120000', 10); // default 2 minutes

      const isUnresponsive = lastEventAgeMs > downThresholdMs;

      const embed = {
        title: isUnresponsive ? '⚠️ Bot Unresponsive' : (ready ? 'Bot Health — OK' : 'Bot Health — Not Ready'),
        color: isUnresponsive ? 0xFF0000 : (ping && typeof ping === 'number' && ping > 2000 ? 0xFFA500 : 0x00FF00),
        fields: [
          { name: 'Status', value: isUnresponsive ? 'Unresponsive' : (ready ? 'Ready' : 'Not Ready'), inline: true },
          { name: 'Guilds', value: String(guildCount), inline: true },
          { name: 'Users', value: String(userCount), inline: true },
          { name: 'Discord Ping (ms)', value: ping ? String(ping) : 'N/A', inline: true },
          { name: 'Uptime (s)', value: String(Math.floor(uptime)), inline: true },
          { name: 'Memory (heapUsed)', value: formatBytes(memory.heapUsed || 0), inline: true },
          { name: 'Last Event Age', value: lastEventAt ? `${Math.floor(lastEventAgeMs / 1000)}s` : 'Never', inline: true },
          { name: 'Last Error', value: lastErrorAt, inline: false },
          { name: 'Timestamp', value: new Date().toISOString(), inline: false }
        ]
      };

      await axios.post(webhookUrl, { embeds: [embed] }, { timeout: 10000 });
    } catch (err) {
      console.error('Failed to send health webhook:', err.message);
    }
  }

  // Start periodic webhook sender if configured
  if (process.env.HEALTH_WEBHOOK || process.env.HEALTH_WEBHOOK_URL) {
    // send once immediately, then on interval
    sendHealthWebhook().catch(() => {});
    setInterval(() => sendHealthWebhook().catch(() => {}), webhookIntervalMs);
  }

  app.get('/health', async (req, res) => {
    try {
      const uptime = process.uptime();
      const memory = process.memoryUsage();

      const guildCount = client?.guilds?.cache?.size || 0;
      const userCount = client?.users?.cache?.size || 0;
      const ready = client?.user ? true : false;
      const ping = client?.ws?.ping || null;

      const latestError = logger?.getLatestError ? await logger.getLatestError() : null;
      const lastErrorAt = latestError ? new Date(latestError.timestamp || latestError.createdAt || Date.now()).toISOString() : null;

      // Basic health heuristics: if Discord ping is null or very high, mark degraded
      let status = 'ok';
      if (ping === null || ping === undefined) status = 'degraded';
      else if (typeof ping === 'number' && ping > 2000) status = 'degraded';

      res.json({
        status,
        botReady: ready,
        discordPingMs: ping,
        guildCount,
        userCount,
        uptimeSeconds: Math.floor(uptime),
        memory: {
          rss: formatBytes(memory.rss),
          heapTotal: formatBytes(memory.heapTotal),
          heapUsed: formatBytes(memory.heapUsed),
          external: formatBytes(memory.external || 0)
        },
        lastErrorAt,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });

  app.get('/logs', async (req, res) => {
    try {
      if (!logger || !logger.getRecentLogs) return res.status(501).json({ error: 'Logging DB not configured' });
      const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
      const logs = await logger.getRecentLogs(limit);
      res.json({ count: logs.length, logs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const server = app.listen(port, () => {
    console.log(`✅ Health server listening on port ${port}`);
  });

  return { app, server };
}

module.exports = { createHealthServer };
