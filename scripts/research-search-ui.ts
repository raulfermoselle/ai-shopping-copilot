/**
 * Research Script: Auchan.pt Product Search UI
 *
 * Investigates:
 * 1. Search functionality and URL patterns
 * 2. Search results page structure
 * 3. Product card selectors
 * 4. Availability indicators
 * 5. Substitution/recommendation features
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\search';
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');

interface SelectorCandidate {
  description: string;
  elementType: string;
  primary: string;
  fallbacks: string[];
  strategy: string;
  stabilityScore: number;
  verified: boolean;
  notes: string;
}

async function ensureDirectories() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
}

async function capturePageState(page: Page, label: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${label}_${timestamp}.png`);
  const htmlPath = path.join(OUTPUT_DIR, `${label}_${timestamp}.html`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const html = await page.content();
  await writeFile(htmlPath, html, 'utf-8');

  console.log(`Captured: ${label}`);
  console.log(`  Screenshot: ${screenshotPath}`);
  console.log(`  HTML: ${htmlPath}`);

  return { screenshotPath, htmlPath };
}

async function analyzeSearchInterface(page: Page) {
  console.log('\n=== ANALYZING SEARCH INTERFACE ===\n');

  // Check for search input in header
  const searchInputSelectors = [
    'input[type="search"]',
    'input[name*="search"]',
    'input[placeholder*="Pesquis"]',
    'input[placeholder*="pesquis"]',
    '[data-testid*="search"]',
    '#search',
    '.search-input',
    '.auc-search-input',
  ];

  const candidates: Record<string, SelectorCandidate> = {};

  for (const selector of searchInputSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`Found search input: ${selector} (count: ${count})`);
      const element = page.locator(selector).first();
      const placeholder = await element.getAttribute('placeholder').catch(() => null);
      const name = await element.getAttribute('name').catch(() => null);
      const id = await element.getAttribute('id').catch(() => null);

      console.log(`  Placeholder: ${placeholder}`);
      console.log(`  Name: ${name}`);
      console.log(`  ID: ${id}`);
    }
  }

  return candidates;
}

async function dismissCookieConsent(page: Page) {
  console.log('Checking for cookie consent...');

  const consentSelectors = [
    'button:has-text("Aceitar")',
    'button:has-text("Accept")',
    'button[id*="accept"]',
    '#onetrust-accept-btn-handler',
    '.ot-btn-primary',
  ];

  for (const selector of consentSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.click();
        console.log(`Dismissed cookie consent with: ${selector}`);
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      // Try next selector
    }
  }
}

async function performSearch(page: Page, query: string) {
  console.log(`\n=== PERFORMING SEARCH: "${query}" ===\n`);

  // Click search icon to reveal search input
  const searchIconSelectors = [
    'button[aria-label*="Search"]',
    'button[aria-label*="search"]',
    'a[href*="search"]',
    '.search-icon',
    '[class*="search-icon"]',
    'svg[class*="search"]',
  ];

  console.log('Looking for search icon/button...');
  for (const selector of searchIconSelectors) {
    try {
      const icon = page.locator(selector).first();
      if (await icon.isVisible({ timeout: 2000 })) {
        console.log(`Found search icon: ${selector}`);
        await icon.click();
        await page.waitForTimeout(1000);
        break;
      }
    } catch {
      // Try next selector
    }
  }

  // Try to find and fill search input
  const searchInputSelectors = [
    'input[name="vendor-search-handler"]',
    'input[type="search"]',
    'input[placeholder*="Search"]',
    '#vendor-search-handler',
  ];

  let searchInput = null;
  for (const selector of searchInputSelectors) {
    try {
      const input = page.locator(selector).first();
      if (await input.isVisible({ timeout: 3000 })) {
        searchInput = input;
        console.log(`Found search input: ${selector}`);
        break;
      }
    } catch {
      // Try next selector
    }
  }

  if (!searchInput) {
    // Try checking for attached but hidden input
    const hiddenInput = page.locator('input[name="vendor-search-handler"]').first();
    if (await hiddenInput.count() > 0) {
      searchInput = hiddenInput;
      console.log('Found hidden search input, will attempt to use it');
    } else {
      throw new Error('Could not find search input');
    }
  }

  await searchInput.fill(query);
  console.log(`Filled search input with: "${query}"`);

  // Capture the filled state
  await capturePageState(page, 'search-input-filled');

  // Submit search (try pressing Enter or clicking search button)
  await searchInput.press('Enter');

  // Wait for navigation or results to load
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.waitForTimeout(2000); // Extra time for dynamic content

  const currentUrl = page.url();
  console.log(`Current URL: ${currentUrl}`);

  // Capture search results page
  await capturePageState(page, 'search-results');

  return currentUrl;
}

async function analyzeSearchResults(page: Page) {
  console.log('\n=== ANALYZING SEARCH RESULTS PAGE ===\n');

  const url = page.url();
  console.log(`URL: ${url}`);

  // Parse URL for query params
  const urlObj = new URL(url);
  console.log(`Search params:`);
  urlObj.searchParams.forEach((value, key) => {
    console.log(`  ${key} = ${value}`);
  });

  // Look for product containers
  const productContainerSelectors = [
    '.product-card',
    '.auc-product-card',
    '.product-item',
    '.search-result',
    '[data-product-id]',
    '[class*="product"]',
    '.auc-product',
  ];

  console.log('\n--- Product Containers ---');
  for (const selector of productContainerSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
    }
  }

  // Look for results container
  const resultsContainerSelectors = [
    '.search-results',
    '.product-list',
    '.products-grid',
    '.results',
    '[class*="search-results"]',
    '[class*="product-list"]',
  ];

  console.log('\n--- Results Container ---');
  for (const selector of resultsContainerSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
      const classes = await page.locator(selector).first().getAttribute('class');
      console.log(`  Classes: ${classes}`);
    }
  }

  // Analyze first product card in detail
  console.log('\n--- First Product Analysis ---');
  const productCard = page.locator('[class*="product"]').first();
  const productClasses = await productCard.getAttribute('class').catch(() => 'N/A');
  console.log(`Product card classes: ${productClasses}`);

  // Look for product name
  const nameSelectors = [
    '.product-name',
    '.auc-product-name',
    '.product-title',
    'h2',
    'h3',
    'a[href*="/produtos/"]',
  ];

  console.log('\nProduct Name:');
  for (const selector of nameSelectors) {
    const element = productCard.locator(selector).first();
    const count = await element.count();
    if (count > 0) {
      const text = await element.textContent();
      console.log(`  ${selector}: "${text?.trim()}"`);
    }
  }

  // Look for price
  const priceSelectors = [
    '.price',
    '.auc-price',
    '.product-price',
    '[class*="price"]',
  ];

  console.log('\nProduct Price:');
  for (const selector of priceSelectors) {
    const element = productCard.locator(selector).first();
    const count = await element.count();
    if (count > 0) {
      const text = await element.textContent();
      console.log(`  ${selector}: "${text?.trim()}"`);
    }
  }
}

async function analyzeAvailability(page: Page) {
  console.log('\n=== ANALYZING AVAILABILITY INDICATORS ===\n');

  // Look for out-of-stock indicators
  const unavailableSelectors = [
    '.out-of-stock',
    '.unavailable',
    '.not-available',
    '[class*="out-of-stock"]',
    '[class*="unavailable"]',
    '.product--unavailable',
    '.auc-product--unavailable',
    'button:disabled',
    'button[disabled]',
  ];

  for (const selector of unavailableSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
      const text = await page.locator(selector).first().textContent();
      console.log(`  Text: "${text?.trim()}"`);
    }
  }

  // Look for stock warnings
  const stockWarningSelectors = [
    '[class*="stock"]',
    '[class*="availability"]',
    '.low-stock',
    '.limited-stock',
  ];

  console.log('\n--- Stock Warnings ---');
  for (const selector of stockWarningSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
      const element = page.locator(selector).first();
      const text = await element.textContent();
      const classes = await element.getAttribute('class');
      console.log(`  Text: "${text?.trim()}"`);
      console.log(`  Classes: ${classes}`);
    }
  }
}

async function analyzeSubstitutionFeatures(page: Page) {
  console.log('\n=== ANALYZING SUBSTITUTION/RECOMMENDATION FEATURES ===\n');

  // Look for "similar products" sections
  const similarProductSelectors = [
    '[class*="similar"]',
    '[class*="related"]',
    '[class*="recommend"]',
    '[class*="also-like"]',
    '[class*="alternatives"]',
    '.similar-products',
    '.related-products',
    '.recommendations',
  ];

  for (const selector of similarProductSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
      const text = await page.locator(selector).first().textContent();
      console.log(`  Text: "${text?.trim().substring(0, 100)}..."`);
    }
  }

  // Check if clicking a product shows similar items
  console.log('\n--- Checking Product Detail for Recommendations ---');
  const firstProductLink = page.locator('a[href*="/produtos/"]').first();
  const productUrl = await firstProductLink.getAttribute('href');
  console.log(`Product URL: ${productUrl}`);
}

async function main() {
  let browser: Browser | null = null;

  try {
    await ensureDirectories();

    browser = await chromium.launch({
      headless: false,
      slowMo: 500, // Slow down for observation
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Navigate to Auchan.pt
    console.log('Navigating to Auchan.pt...');
    await page.goto('https://www.auchan.pt', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    await capturePageState(page, 'homepage-with-consent');

    // Dismiss cookie consent
    await dismissCookieConsent(page);

    await capturePageState(page, 'homepage');

    // Analyze search interface
    await analyzeSearchInterface(page);

    // Perform a search (common grocery item)
    const searchUrl = await performSearch(page, 'leite');

    // Analyze search results
    await analyzeSearchResults(page);

    // Analyze availability indicators
    await analyzeAvailability(page);

    // Analyze substitution features
    await analyzeSubstitutionFeatures(page);

    // Try another search with a more specific product
    console.log('\n\n=== SECOND SEARCH (more specific) ===\n');
    await performSearch(page, 'Leite Mimosa Magro');
    await analyzeSearchResults(page);

    // Navigate to a product detail page
    console.log('\n\n=== NAVIGATING TO PRODUCT DETAIL ===\n');
    const firstProduct = page.locator('a[href*="/produtos/"]').first();
    const productUrl = await firstProduct.getAttribute('href');

    if (productUrl) {
      await page.goto(`https://www.auchan.pt${productUrl}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await page.waitForTimeout(2000);

      await capturePageState(page, 'product-detail');

      // Look for recommendations on product page
      console.log('\n--- Product Detail Recommendations ---');
      const recSelectors = [
        '[class*="similar"]',
        '[class*="related"]',
        '[class*="recommend"]',
        '[class*="upsell"]',
        '[class*="cross-sell"]',
      ];

      for (const selector of recSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`${selector}: ${count} elements`);
        }
      }
    }

    console.log('\n=== RESEARCH COMPLETE ===\n');
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`Screenshots: ${SCREENSHOTS_DIR}`);

  } catch (error) {
    console.error('Error during research:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

main().catch(console.error);
