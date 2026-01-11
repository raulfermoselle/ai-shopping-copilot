/**
 * Manual Login Test Script
 *
 * Run with: npx tsx scripts/test-login.ts
 */

import 'dotenv/config';
import { launchBrowser } from '../src/tools/browser.js';
import { createLoginTool } from '../src/tools/login.js';
import { createToolContext } from '../src/tools/base-tool.js';
import { createLogger } from '../src/utils/logger.js';

async function testLogin() {
  const logger = createLogger('debug', 'TestLogin');

  logger.info('Starting login test...');

  // Launch browser in headed mode
  const session = await launchBrowser({
    config: {
      headless: false,
      slowMo: 100, // Slow down for observation
    },
    logger,
  });

  try {
    const context = createToolContext(session.page, { logger });
    const loginTool = createLoginTool();

    logger.info('Executing login tool...');
    const result = await loginTool.execute({}, context);

    if (result.success) {
      logger.info('Login successful!', {
        userName: result.data?.userName,
        sessionRestored: result.data?.sessionRestored,
        finalUrl: result.data?.finalUrl,
      });
    } else {
      logger.error('Login failed', {
        error: result.error?.message,
        code: result.error?.code,
      });
    }

    // Keep browser open for observation
    logger.info('Keeping browser open for 30 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 30000));

  } finally {
    await session.close();
    logger.info('Browser closed');
  }
}

testLogin().catch(console.error);
