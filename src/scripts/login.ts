/**
 * Login Script
 *
 * Creates a browser session and logs into Auchan.pt, saving the session state.
 */

import dotenv from 'dotenv';
import { chromium, Browser } from 'playwright';
import { createLoginTool } from '../tools/login.js';
import { createSessionManager } from '../tools/session.js';
import { createLogger } from '../utils/logger.js';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Load environment variables
dotenv.config();

const SESSION_PATH = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\sessions\\auchan-session.json';

async function main(): Promise<void> {
  let browser: Browser | null = null;

  try {
    console.log('🚀 Starting login process...\n');

    // Ensure sessions directory exists
    const sessionDir = dirname(SESSION_PATH);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    // Create logger
    const logger = createLogger('info', 'Login');

    // Launch browser
    browser = await chromium.launch({
      headless: false,
      slowMo: 300
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'pt-PT',
      timezoneId: 'Europe/Lisbon',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Create tool context
    const toolContext = {
      page,
      logger,
      screenshot: async (label: string): Promise<string> => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const path = `C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots\\${timestamp}-${label}.png`;
        const dir = dirname(path);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        await page.screenshot({ path, fullPage: false });
        return path;
      },
      config: {
        navigationTimeout: 15000,
        elementTimeout: 10000,
        screenshotDir: 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots',
      },
    };

    // Create login tool
    const loginTool = createLoginTool();

    // Perform login (credentials from env)
    console.log('🔐 Logging in...');
    const result = await loginTool.execute({}, toolContext);

    if (result.success && result.data) {
      console.log('✅ Login successful!');
      if (result.data.userName) {
        console.log(`   User: ${result.data.userName}`);
      }
      console.log(`   Session restored: ${result.data.sessionRestored}`);
      console.log(`   Final URL: ${result.data.finalUrl}\n`);

      // Save session
      console.log('💾 Saving session...');
      const sessionManager = createSessionManager(undefined, logger);

      // Get email from env
      const email = process.env.AUCHAN_EMAIL;
      if (!email) {
        throw new Error('AUCHAN_EMAIL not found in environment');
      }

      await sessionManager.saveSession(context, email);
      console.log(`✅ Session saved to: ${SESSION_PATH}\n`);

      // Wait a moment before closing
      console.log('⏸️  Keeping browser open for 5 seconds...');
      await page.waitForTimeout(5000);
    } else {
      console.error('❌ Login failed');
    }

  } catch (error) {
    console.error('❌ Login script failed:', error);
    throw error;
  } finally {
    if (browser) {
      console.log('🔒 Closing browser...');
      await browser.close();
      console.log('✅ Browser closed');
    }
  }
}

main().catch(console.error);
