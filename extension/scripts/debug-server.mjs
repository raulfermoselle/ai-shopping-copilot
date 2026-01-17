/**
 * Extension Debug Log Server
 *
 * Receives logs from the Chrome extension via HTTP POST and writes to disk.
 * This enables autonomous debugging - Claude can read/tail the log file.
 *
 * Usage:
 *   node extension/scripts/debug-server.mjs
 *
 * The extension POSTs logs to http://localhost:9222/log
 * Logs are written to extension/logs/debug.log
 */

import { createServer } from 'http';
import { mkdirSync, appendFileSync, writeFileSync, existsSync, statSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'logs');
const LOG_FILE = join(LOG_DIR, 'debug.log');
const PORT = 9222;
const MAX_LOG_SIZE = 1024 * 1024; // 1MB - rotate when exceeded

// Ensure logs directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// Initialize log file
writeFileSync(LOG_FILE, `=== Debug server started at ${new Date().toISOString()} ===\n`);

function formatLogEntry(entry) {
  const { timestamp, level, source, message, data } = entry;
  const dataStr = data ? `\n    ${data.replace(/\n/g, '\n    ')}` : '';
  return `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${source}] ${message}${dataStr}\n`;
}

function rotateLogIfNeeded() {
  try {
    const stats = existsSync(LOG_FILE) ? statSync(LOG_FILE) : null;
    if (stats && stats.size > MAX_LOG_SIZE) {
      const rotatedFile = LOG_FILE.replace('.log', `.${Date.now()}.log`);
      renameSync(LOG_FILE, rotatedFile);
      writeFileSync(LOG_FILE, `=== Log rotated at ${new Date().toISOString()} ===\n`);
      console.log(`Log rotated to ${rotatedFile}`);
    }
  } catch (err) {
    // Ignore rotation errors
  }
}

const server = createServer((req, res) => {
  // CORS headers for extension access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        const formatted = formatLogEntry(entry);

        // Write to file
        appendFileSync(LOG_FILE, formatted);

        // Also print to console for immediate visibility
        process.stdout.write(formatted);

        rotateLogIfNeeded();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (err) {
        console.error('Failed to process log:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(`{"error":"${err.message}"}`);
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/logs') {
    // Batch endpoint - receives array of logs
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const entries = JSON.parse(body);
        if (Array.isArray(entries)) {
          const formatted = entries.map(formatLogEntry).join('');
          appendFileSync(LOG_FILE, formatted);
          process.stdout.write(formatted);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(`{"error":"${err.message}"}`);
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  AISC Debug Server running on http://localhost:${PORT}        ║
║                                                            ║
║  Logs written to: extension/logs/debug.log                 ║
║                                                            ║
║  To tail logs:                                             ║
║    tail -f extension/logs/debug.log                        ║
║                                                            ║
║  Press Ctrl+C to stop                                      ║
╚════════════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down debug server...');
  appendFileSync(LOG_FILE, `=== Debug server stopped at ${new Date().toISOString()} ===\n`);
  process.exit(0);
});
