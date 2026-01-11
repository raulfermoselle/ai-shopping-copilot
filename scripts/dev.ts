#!/usr/bin/env npx ts-node
/**
 * Development Script
 *
 * Launches a browser session for manual testing and development.
 */

import { launchBrowser, navigateToAuchan } from '../src/tools/browser.js';
import { createLogger } from '../src/utils/logger.js';

async function main(): Promise<void> {
  const logger = createLogger('debug', 'Dev');

  logger.info('Starting development session...');

  const session = await launchBrowser({ headless: false }, logger);

  try {
    await navigateToAuchan(session.page, logger);

    logger.info('Browser is open. Press Ctrl+C to close.');

    // Keep the script running
    await new Promise(() => {});
  } catch (error) {
    logger.error('Error during development session', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await session.close();
  }
}

main().catch(console.error);
