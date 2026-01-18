/**
 * Extension Debug Log Dumper
 *
 * USAGE: Paste this entire script into the Service Worker console
 *
 * To access the Service Worker console:
 * 1. Go to chrome://extensions/
 * 2. Find "AI Shopping Copilot"
 * 3. Click "Service worker" link
 * 4. In the Console tab, paste this script and press Enter
 */

(async function dumpLogs() {
  const DEBUG_LOG_KEY = 'aisc_debug_logs';

  try {
    const result = await chrome.storage.local.get(DEBUG_LOG_KEY);
    const logs = result[DEBUG_LOG_KEY] || [];

    if (logs.length === 0) {
      console.log('No logs found.');
      return;
    }

    console.log(`Found ${logs.length} log entries:\n`);

    logs.forEach((log, i) => {
      const prefix = `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}]`;
      const data = log.data ? `\n  Data: ${log.data}` : '';
      console.log(`${i + 1}. ${prefix} ${log.message}${data}\n`);
    });

    // Also output as copyable JSON
    console.log('\n--- JSON (copy this for sharing) ---\n');
    console.log(JSON.stringify(logs, null, 2));

  } catch (err) {
    console.error('Failed to dump logs:', err);
  }
})();
