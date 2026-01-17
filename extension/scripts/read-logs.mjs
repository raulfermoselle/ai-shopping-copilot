/**
 * Read Extension Debug Logs via Chrome DevTools Protocol
 *
 * Prerequisites:
 *   Chrome must be running with: --remote-debugging-port=9222
 *
 * Usage:
 *   node extension/scripts/read-logs.mjs [--watch]
 *
 * Options:
 *   --watch    Poll for new logs every 2 seconds
 *   --clear    Clear logs after reading
 */

import http from 'http';
import WebSocket from 'ws';

const CDP_PORT = 9222;
const DEBUG_LOG_KEY = 'aisc_debug_logs';
const EXTENSION_NAME = 'AI Shopping Copilot';

async function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${CDP_PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${path}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function findExtensionTarget() {
  const targets = await getJson('/json');

  // Find extension background/service worker
  const extTarget = targets.find(t =>
    t.type === 'service_worker' &&
    t.url?.includes('chrome-extension://') &&
    (t.title?.includes(EXTENSION_NAME) || t.url?.includes(EXTENSION_NAME.toLowerCase().replace(/ /g, '')))
  );

  if (!extTarget) {
    // Try to find by looking at all extension targets
    const extTargets = targets.filter(t => t.url?.startsWith('chrome-extension://'));
    if (extTargets.length > 0) {
      console.log('Available extension targets:');
      extTargets.forEach(t => console.log(`  - ${t.title} (${t.url})`));
    }
    return null;
  }

  return extTarget;
}

async function getExtensionId() {
  const target = await findExtensionTarget();
  if (!target) return null;

  // Extract extension ID from URL like chrome-extension://abcdef123/...
  const match = target.url.match(/chrome-extension:\/\/([^/]+)/);
  return match ? match[1] : null;
}

async function readLogsViaCDP(extensionId) {
  // Get browser websocket endpoint
  const version = await getJson('/json/version');
  const wsUrl = version.webSocketDebuggerUrl;

  if (!wsUrl) {
    throw new Error('No webSocketDebuggerUrl found. Is Chrome running with --remote-debugging-port=9222?');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let messageId = 1;

    ws.on('open', () => {
      // Send Extensions.getStorageItems command
      ws.send(JSON.stringify({
        id: messageId,
        method: 'Extensions.getStorageItems',
        params: {
          id: extensionId,
          storageArea: 'local',
          keys: [DEBUG_LOG_KEY]
        }
      }));
    });

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString());
      if (response.id === messageId) {
        ws.close();
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result?.data?.[DEBUG_LOG_KEY] || []);
        }
      }
    });

    ws.on('error', reject);

    setTimeout(() => {
      ws.close();
      reject(new Error('CDP request timeout'));
    }, 5000);
  });
}

function formatLog(entry) {
  const { timestamp, level, source, message, data } = entry;
  const levelPadded = level.toUpperCase().padEnd(5);
  const dataStr = data ? `\n    ${data.replace(/\n/g, '\n    ')}` : '';
  return `[${timestamp}] [${levelPadded}] [${source}] ${message}${dataStr}`;
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch');

  console.log('Connecting to Chrome DevTools Protocol...');

  try {
    await getJson('/json/version');
  } catch (err) {
    console.error(`
ERROR: Cannot connect to Chrome DevTools Protocol on port ${CDP_PORT}

Make sure Chrome is running with remote debugging enabled:

  Windows:
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222

  macOS:
    /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

  Linux:
    google-chrome --remote-debugging-port=9222

Or add to your Chrome shortcut: --remote-debugging-port=9222
`);
    process.exit(1);
  }

  const extensionId = await getExtensionId();
  if (!extensionId) {
    console.error(`
ERROR: Could not find "${EXTENSION_NAME}" extension.

Make sure the extension is loaded in Chrome:
  1. Go to chrome://extensions/
  2. Enable Developer mode
  3. Load unpacked -> select extension/package/
`);
    process.exit(1);
  }

  console.log(`Found extension: ${extensionId}\n`);

  let lastLogCount = 0;

  async function readAndPrint() {
    try {
      const logs = await readLogsViaCDP(extensionId);

      if (watchMode) {
        // Only print new logs
        const newLogs = logs.slice(lastLogCount);
        newLogs.forEach(log => console.log(formatLog(log)));
        lastLogCount = logs.length;
      } else {
        // Print all logs
        if (logs.length === 0) {
          console.log('No logs found.');
        } else {
          console.log(`Found ${logs.length} log entries:\n`);
          logs.forEach(log => console.log(formatLog(log)));
        }
      }
    } catch (err) {
      console.error('Error reading logs:', err.message);
    }
  }

  await readAndPrint();

  if (watchMode) {
    console.log('\n--- Watching for new logs (Ctrl+C to stop) ---\n');
    setInterval(readAndPrint, 2000);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
