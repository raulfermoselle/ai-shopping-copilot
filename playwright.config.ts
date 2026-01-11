import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for AI Shopping Copilot
 *
 * Configured for Auchan.pt automation with Portuguese locale.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Sequential for shopping session
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for deterministic order
  reporter: 'html',

  use: {
    baseURL: 'https://www.auchan.pt',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',

    // Viewport for consistent screenshots
    viewport: { width: 1280, height: 720 },

    // Capture evidence on failure
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',

    // Reasonable timeouts for shopping site
    actionTimeout: 10000,
    navigationTimeout: 30000,

    // Browser behavior
    ignoreHTTPSErrors: false,
    bypassCSP: false,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Realistic user agent
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    },
  ],

  // Output directories
  outputDir: 'test-results/',
});
