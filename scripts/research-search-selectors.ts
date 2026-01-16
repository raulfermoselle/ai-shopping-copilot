/**
 * Search Page Selector Discovery Script
 *
 * Purpose: Research and capture selectors for the Substitution agent
 * - Login to Auchan.pt
 * - Search for products
 * - Capture search results page structure
 * - Identify product availability indicators
 * - Save screenshots and HTML snapshots
 *
 * SAFETY: Does not add to cart or proceed to checkout
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from 'dotenv';

// Load .env file
config();

const AUCHAN_EMAIL = process.env.AUCHAN_EMAIL;
const AUCHAN_PASSWORD = process.env.AUCHAN_PASSWORD;

if (!AUCHAN_EMAIL || !AUCHAN_PASSWORD) {
  console.error('ERROR: AUCHAN_EMAIL and AUCHAN_PASSWORD must be set in .env');
  process.exit(1);
}

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'selectors', 'pages', 'search');
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');
const SNAPSHOTS_DIR = path.join(OUTPUT_DIR, 'snapshots');

// Ensure directories exist
for (const dir of [OUTPUT_DIR, SCREENSHOTS_DIR, SNAPSHOTS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function captureState(page: Page, label: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const safeLabel = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

  // Screenshot
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${safeLabel}_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot: ${screenshotPath}`);

  // HTML snapshot
  const html = await page.content();
  const snapshotPath = path.join(SNAPSHOTS_DIR, `${safeLabel}_${timestamp}.html`);
  fs.writeFileSync(snapshotPath, html, 'utf-8');
  console.log(`💾 Snapshot: ${snapshotPath}`);
}

async function dismissPopups(page: Page): Promise<void> {
  console.log('Checking for popups to dismiss...');

  const popupSelectors = [
    // Cookie consent
    '#onetrust-accept-btn-handler',
    '[data-testid="cookie-accept"]',
    '.cookie-accept',
    // OneSignal notification
    '#onesignal-slidedown-cancel-button',
    'button:has-text("Não")',
    'button:has-text("Fechar")',
    // Generic close buttons
    '[aria-label="Close"]',
    'button.close',
  ];

  for (const selector of popupSelectors) {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 })) {
        await element.click({ force: true, timeout: 2000 });
        console.log(`✓ Dismissed popup: ${selector}`);
        await page.waitForTimeout(500);
      }
    } catch {
      // Popup not found or couldn't click, continue
    }
  }

  // Also try to remove popup overlays directly
  try {
    await page.evaluate(() => {
      // Remove OneTrust overlay
      const oneTrustOverlay = document.querySelector('.onetrust-pc-dark-filter');
      if (oneTrustOverlay) oneTrustOverlay.remove();

      // Remove OneSignal overlay
      const oneSignalContainer = document.querySelector('#onesignal-slidedown-container');
      if (oneSignalContainer) oneSignalContainer.remove();
    });
  } catch {
    // Ignore errors
  }
}

async function login(page: Page): Promise<void> {
  console.log('\n=== LOGIN ===');

  await page.goto('https://www.auchan.pt/pt/', { waitUntil: 'domcontentloaded' });
  console.log('Navigated to homepage');

  await dismissPopups(page);

  // Check if already logged in
  const loggedInIndicator = page.locator('.auc-header-account span:not(:has-text("Login"))').first();
  if (await loggedInIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('✓ Already logged in');
    return;
  }

  // Navigate to login
  console.log('Navigating to login page...');
  await dismissPopups(page);

  const accountButton = page.locator('.auc-header-account a[href*="Login-OAuthLogin"]').first();
  if (await accountButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await accountButton.click({ force: true });
    console.log('Clicked account button');
    await page.waitForTimeout(1000);
    await dismissPopups(page); // Dismiss any popups that appeared
  }

  // Wait for login form
  await page.waitForSelector('#uname1, input[type="email"]', { timeout: 10000 });
  console.log('Login form loaded');

  // Fill and submit
  await page.fill('#uname1, input[type="email"]', AUCHAN_EMAIL);
  await page.fill('#pwd1, input[type="password"]', AUCHAN_PASSWORD);

  await page.click('#btnSubmit_login, input[type="button"][value*="Aceda"]');
  console.log('Submitted login form');

  // Wait for login to complete
  await page.waitForSelector('.auc-header-account span:not(:has-text("Login"))', { timeout: 15000 });
  console.log('✓ Login successful');

  await dismissPopups(page);
  await page.waitForTimeout(1000);
}

async function researchSearchPage(page: Page): Promise<void> {
  console.log('\n=== RESEARCH: SEARCH PAGE ===');

  // Search for "leite" (milk) - common product
  console.log('\n1. Searching for "leite"...');

  // Find search input
  const searchSelectors = [
    'input[type="search"]',
    'input[name="q"]',
    '#search-input',
    '.auc-header__search input',
  ];

  let searchInput = null;
  for (const selector of searchSelectors) {
    searchInput = page.locator(selector).first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`✓ Found search input: ${selector}`);
      break;
    }
  }

  if (!searchInput) {
    throw new Error('Search input not found');
  }

  await searchInput.fill('leite');
  await page.waitForTimeout(500);

  // Submit search (usually Enter key or click search button)
  await searchInput.press('Enter');
  console.log('Submitted search');

  // Wait for search results to load
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000); // Let content settle

  console.log('Search results loaded');
  await captureState(page, 'search-leite-initial');

  // Scroll down to trigger lazy loading
  console.log('\n2. Scrolling to load more products...');
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(1000);

  await captureState(page, 'search-leite-scrolled');

  // Try another search term to see consistency
  console.log('\n3. Searching for "pão" (bread)...');
  searchInput = page.locator('input[type="search"]').first();
  await searchInput.fill('pão');
  await searchInput.press('Enter');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  await captureState(page, 'search-pao-initial');

  // Analyze page structure
  console.log('\n4. Analyzing page structure...');

  const analysis = await page.evaluate(() => {
    const results: any = {
      productCards: [],
      pagination: null,
      filters: [],
    };

    // Find product cards (try common patterns)
    const cardSelectors = [
      '.product-tile',
      '.product-card',
      '[data-product-id]',
      '.auc-product',
      '.search-result-item',
    ];

    for (const selector of cardSelectors) {
      const cards = document.querySelectorAll(selector);
      if (cards.length > 0) {
        results.productCards.push({
          selector,
          count: cards.length,
          sample: cards[0]?.outerHTML.substring(0, 500),
        });
      }
    }

    // Find pagination
    const paginationSelectors = [
      '.pagination',
      '[role="navigation"]',
      '.page-numbers',
    ];

    for (const selector of paginationSelectors) {
      const elem = document.querySelector(selector);
      if (elem) {
        results.pagination = {
          selector,
          html: elem.outerHTML.substring(0, 300),
        };
        break;
      }
    }

    // Find filters
    const filterSelectors = [
      '.filter',
      '.refinement',
      '[data-filter]',
    ];

    for (const selector of filterSelectors) {
      const elems = document.querySelectorAll(selector);
      if (elems.length > 0) {
        results.filters.push({
          selector,
          count: elems.length,
        });
      }
    }

    return results;
  });

  console.log('\nPage Structure Analysis:');
  console.log(JSON.stringify(analysis, null, 2));

  // Save analysis
  const analysisPath = path.join(OUTPUT_DIR, 'page-structure-analysis.json');
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf-8');
  console.log(`\n💾 Analysis saved: ${analysisPath}`);
}

async function researchProductAvailability(page: Page): Promise<void> {
  console.log('\n=== RESEARCH: PRODUCT AVAILABILITY ===');

  // Navigate to a specific product detail page
  console.log('\n1. Looking for a product with "Add to Cart" button...');

  const addToCartSelectors = [
    'button:has-text("Adicionar")',
    '.add-to-cart',
    '[data-pid]',
    'button.auc-button:has-text("Adicionar")',
  ];

  for (const selector of addToCartSelectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`✓ Found add-to-cart pattern: ${selector}`);
      break;
    }
  }

  await captureState(page, 'search-availability-indicators');

  // Check for out-of-stock indicators
  console.log('\n2. Checking for out-of-stock indicators...');

  const outOfStockPatterns = await page.evaluate(() => {
    const patterns: string[] = [];

    // Look for common out-of-stock text
    const bodyText = document.body.innerText.toLowerCase();
    if (bodyText.includes('esgotado')) patterns.push('text: esgotado');
    if (bodyText.includes('indisponível')) patterns.push('text: indisponível');
    if (bodyText.includes('sem stock')) patterns.push('text: sem stock');

    // Look for disabled buttons
    const disabledButtons = document.querySelectorAll('button:disabled');
    if (disabledButtons.length > 0) {
      patterns.push(`disabled buttons: ${disabledButtons.length}`);
    }

    // Look for availability badges
    const badges = document.querySelectorAll('.badge, .tag, .label, [class*="stock"]');
    if (badges.length > 0) {
      patterns.push(`availability badges: ${badges.length}`);
    }

    return patterns;
  });

  console.log('Out-of-stock patterns found:', outOfStockPatterns);
}

async function main(): Promise<void> {
  let browser: Browser | null = null;

  try {
    console.log('Starting Search Selector Discovery...\n');

    browser = await chromium.launch({
      headless: false,
      slowMo: 100, // Slow down for visibility
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Login
    await login(page);

    // Research search page
    await researchSearchPage(page);

    // Research availability indicators
    await researchProductAvailability(page);

    console.log('\n✓ Discovery complete!');
    console.log(`\nOutputs:`);
    console.log(`- Screenshots: ${SCREENSHOTS_DIR}`);
    console.log(`- Snapshots: ${SNAPSHOTS_DIR}`);
    console.log(`\nNext: Review captures and create v1.json registry file.`);

  } catch (error) {
    console.error('\n❌ Error during discovery:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('\nBrowser closed.');
    }
  }
}

// Run
main().catch(console.error);
