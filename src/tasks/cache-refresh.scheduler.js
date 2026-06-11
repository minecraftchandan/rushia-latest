const settingsManager = require('../utils/settings.manager');
const { sendLog, sendError } = require('../utils/logger');

async function initializeSettingsCache() {
  try {
    await settingsManager.initializeSettings();
    await sendLog('SETTINGS_CACHE_INITIALIZED', { category: 'SYSTEM' });
  } catch (error) {
    await sendError('SETTINGS_CACHE_INIT_FAILED', { category: 'SYSTEM', error: error.message });
  }
}

module.exports = { initializeSettingsCache };
