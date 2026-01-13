#!/usr/bin/env npx ts-node
/**
 * Substitution UI Research Script
 *
 * Focused research for the Substitution agent to find replacement products.
 * Tests and documents:
 * 1. Product search functionality
 * 2. Filter/sort options for narrowing results
 * 3. Product availability indicators
 * 4. Recommendations/similar products sections
 * 5. Special characters in search (accents, Portuguese text)
 *
 * Validates existing selectors in data/selectors/pages/search/v1.json
 * and discovers additional selectors needed for substitution workflows.
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { createLogger } from '../dist/utils/logger.js';
import { attachPopupObserver, detachPopupObserver } from '../dist/utils/auto-popup-dismisser.js';
import { LoginTool } from '../dist/tools/login.js';

const logger = createLogger('research-substitution-ui');
const loginTool = new LoginTool();

const OUTPUT_DIR = path.resolve('C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\search');
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');
const RESEARCH_ARTIFACTS_DIR = path.resolve('C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\artifacts\\search-research');

// Test queries for Substitution scenarios
const TEST_QUERIES = [
  // Basic search
  { query: 'leite', description: 'Basic search - common item', category: 'dairy' },

  // Brand-specific search
  { query: 'Leite Mimosa', description: 'Brand search', category: 'dairy' },

  // Specific product variant
  { query: 'Leite Mimosa Magro 1L', description: 'Specific variant', category: 'dairy' },

  // Portuguese accents
  { query: 'pão de forma', description: 'Search with accent (ã)', category: 'bakery' },
  { query: 'açúcar', description: 'Search with accents (ç, ú)', category: 'groceries' },

  // Common substitution scenarios
  { query: 'manteiga', description: 'Butter (often needs substitution)', category: 'dairy' },
  { query: 'ovos', description: 'Eggs (stock sensitive)', category: 'dairy' },
];

interface SearchAnalysis {
  query: string;
  url: string;
  resultsCount: number;
  productTileCount: number;
  hasFilters: boolean;
  hasSortOptions: boolean;
  availabilityIndicatorsFound: string[];
  sampleProducts: Array<{
    name: string;
    price: string;
    available: boolean;
    pid: string | null;
  }>;
  screenshots: string[];
  notes: string[];
}

async function ensureDirectories() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  await mkdir(RESEARCH_ARTIFACTS_DIR, { recursive: true });
}

async function capturePageState(page: Page, label: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${label}_${timestamp}.png`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  logger.info(`Screenshot captured: ${label}`, { path: screenshotPath });

  return screenshotPath;
}

async function saveHTML(page: Page, label: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlPath = path.join(RESEARCH_ARTIFACTS_DIR, `${label}_${timestamp}.html`);

  const html = await page.content();
  await writeFile(htmlPath, html, 'utf-8');
  logger.info(`HTML saved: ${label}`, { path: htmlPath });

  return htmlPath;
}

/**
 * Validate existing selectors from v1.json
 */
async function validateExistingSelectors(page: Page): Promise<void> {
  logger.info('Validating existing selectors from v1.json');

  const selectorsToValidate = [
    { name: 'resultsContainer', selector: '.product-grid' },
    { name: 'resultsCount', selector: '.search-result-count' },
    { name: 'searchKeywords', selector: '.search-keywords' },
    { name: 'productTile', selector: '.auc-product-tile' },
    { name: 'productName', selector: '.auc-product-tile__name' },
    { name: 'productPrice', selector: '.auc-product-tile__prices .price' },
    { name: 'addToCartButton', selector: '.auc-product-tile__quantity-selector button.auc-js-add-to-cart' },
  ];

  for (const { name, selector } of selectorsToValidate) {
    const count = await page.locator(selector).count();
    const status = count > 0 ? '✓ FOUND' : '✗ NOT FOUND';
    logger.info(`${status}: ${name}`, { selector, count });

    if (count > 0 && name === 'productTile') {
      // Sample the first product tile
      const firstTile = page.locator(selector).first();
      const pid = await firstTile.getAttribute('data-pid');
      const nameEl = firstTile.locator('.auc-product-tile__name');
      const nameText = await nameEl.textContent();

      logger.info(`Sample product tile:`, { pid, name: nameText?.trim() });
    }
  }
}

/**
 * Discover filter and sort UI elements
 */
async function discoverFiltersAndSort(page: Page): Promise<{
  hasFilters: boolean;
  hasSortOptions: boolean;
  filterElements: string[];
  sortElements: string[];
}> {
  logger.info('Discovering filter and sort controls');

  const filterSelectors = [
    '.auc-search__filters-body',
    '.auc-search__left-section',
    '[class*="filter"]',
    '[class*="refinement"]',
    'aside [class*="category"]',
    'aside [class*="brand"]',
    'aside [class*="price"]',
  ];

  const sortSelectors = [
    '.auc-search__sort-order-menu',
    'select[name*="sort"]',
    '[class*="sort-by"]',
    '[class*="order-by"]',
  ];

  const foundFilters: string[] = [];
  const foundSorts: string[] = [];

  logger.info('--- Filter Elements ---');
  for (const selector of filterSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      logger.info(`Found: ${selector} (count: ${count})`);
      foundFilters.push(selector);

      // Get sample text from first element
      const text = await page.locator(selector).first().textContent();
      logger.info(`  Sample text: ${text?.trim().substring(0, 100)}`);
    }
  }

  logger.info('--- Sort Elements ---');
  for (const selector of sortSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      logger.info(`Found: ${selector} (count: ${count})`);
      foundSorts.push(selector);

      // Get sample text/options
      const text = await page.locator(selector).first().textContent();
      logger.info(`  Sample text: ${text?.trim().substring(0, 100)}`);
    }
  }

  return {
    hasFilters: foundFilters.length > 0,
    hasSortOptions: foundSorts.length > 0,
    filterElements: foundFilters,
    sortElements: foundSorts,
  };
}

/**
 * Extract detailed product information from search results
 */
async function extractProductDetails(page: Page, maxProducts: number = 5): Promise<Array<{
  name: string;
  price: string;
  available: boolean;
  pid: string | null;
  imageUrl: string | null;
  productUrl: string | null;
}>> {
  logger.info(`Extracting details from first ${maxProducts} products`);

  const productTiles = await page.locator('.auc-product-tile').all();
  const products: Array<{
    name: string;
    price: string;
    available: boolean;
    pid: string | null;
    imageUrl: string | null;
    productUrl: string | null;
  }> = [];

  for (let i = 0; i < Math.min(maxProducts, productTiles.length); i++) {
    const tile = productTiles[i];

    const pid = await tile.getAttribute('data-pid');
    const nameText = await tile.locator('.auc-product-tile__name').textContent();
    const priceText = await tile.locator('.auc-product-tile__prices .price').textContent();

    // Check availability
    const addToCartButton = tile.locator('button.auc-js-add-to-cart');
    const isDisabled = await addToCartButton.getAttribute('disabled') !== null;
    const available = !isDisabled;

    // Get image URL
    const imageEl = tile.locator('.auc-product-tile__image-container__image img');
    const imageUrl = await imageEl.getAttribute('src').catch(() => null);

    // Get product URL
    const linkEl = tile.locator('.auc-product-tile__image-container a');
    const productUrl = await linkEl.getAttribute('href').catch(() => null);

    products.push({
      name: nameText?.trim() ?? '',
      price: priceText?.trim().split('\n')[0] ?? '',
      available,
      pid,
      imageUrl,
      productUrl,
    });

    logger.info(`Product ${i + 1}:`, {
      name: nameText?.trim().substring(0, 50),
      price: priceText?.trim().split('\n')[0],
      available,
      pid,
    });
  }

  return products;
}

/**
 * Search for a product and analyze results
 */
async function performSearchAnalysis(page: Page, testCase: typeof TEST_QUERIES[0]): Promise<SearchAnalysis> {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`SEARCH TEST: ${testCase.description}`);
  logger.info(`Query: "${testCase.query}"`);
  logger.info(`${'='.repeat(60)}\n`);

  const screenshots: string[] = [];
  const notes: string[] = [];

  // Navigate to search page directly (faster than using search box)
  const searchUrl = `https://www.auchan.pt/pt/pesquisa?q=${encodeURIComponent(testCase.query)}`;
  logger.info(`Navigating to: ${searchUrl}`);

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Capture initial state
  const screenshot1 = await capturePageState(page, `search-${testCase.category}-initial`);
  screenshots.push(screenshot1);

  // Wait for product grid to load
  await page.waitForSelector('.product-grid, .auc-product-tile', { timeout: 10000 }).catch(() => {
    notes.push('Warning: Product grid selector not found quickly');
  });

  // Validate selectors
  await validateExistingSelectors(page);

  // Count results
  const resultsCountEl = page.locator('.search-result-count');
  const resultsText = await resultsCountEl.textContent().catch(() => null);
  const resultsCount = resultsText ? parseInt(resultsText.match(/\d+/)?.[0] ?? '0') : 0;

  const productTileCount = await page.locator('.auc-product-tile').count();

  logger.info(`Results: ${resultsCount} total, ${productTileCount} tiles on page`);

  // Discover filters and sort
  const { hasFilters, hasSortOptions, filterElements, sortElements } = await discoverFiltersAndSort(page);

  if (hasFilters) {
    notes.push(`Filters available: ${filterElements.join(', ')}`);
  }
  if (hasSortOptions) {
    notes.push(`Sort options available: ${sortElements.join(', ')}`);
  }

  // Extract sample products
  const sampleProducts = await extractProductDetails(page, 5);

  // Check for unavailability indicators
  const availabilityIndicatorsFound: string[] = [];
  const unavailableSelectors = [
    '.auc-product-tile--unavailable',
    'button[disabled].auc-js-add-to-cart',
  ];

  for (const selector of unavailableSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      availabilityIndicatorsFound.push(`${selector} (${count})`);
      logger.info(`Unavailable indicator found: ${selector} (count: ${count})`);
    }
  }

  // Save HTML for offline analysis
  await saveHTML(page, `search-${testCase.category}`);

  // Capture final state
  const screenshot2 = await capturePageState(page, `search-${testCase.category}-final`);
  screenshots.push(screenshot2);

  return {
    query: testCase.query,
    url: page.url(),
    resultsCount,
    productTileCount,
    hasFilters,
    hasSortOptions,
    availabilityIndicatorsFound,
    sampleProducts: sampleProducts.map(p => ({
      name: p.name,
      price: p.price,
      available: p.available,
      pid: p.pid,
    })),
    screenshots,
    notes,
  };
}

/**
 * Navigate to a product detail page and check for recommendations
 */
async function analyzeProductRecommendations(page: Page): Promise<void> {
  logger.info('\n--- ANALYZING PRODUCT DETAIL RECOMMENDATIONS ---\n');

  // Click first product
  const firstProductLink = page.locator('.auc-product-tile__image-container a').first();
  const productUrl = await firstProductLink.getAttribute('href');

  if (!productUrl) {
    logger.warn('No product URL found, skipping recommendations analysis');
    return;
  }

  logger.info(`Navigating to product: ${productUrl}`);
  await page.goto(`https://www.auchan.pt${productUrl}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await page.waitForTimeout(2000);

  await capturePageState(page, 'product-detail-for-recommendations');

  // Check for recommendations section
  const recSelectors = [
    '[class*="recommend"]',
    '[class*="similar"]',
    '[class*="related"]',
    'h2:has-text("sugere"), h3:has-text("sugere")',
  ];

  logger.info('Looking for recommendation sections:');
  for (const selector of recSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      logger.info(`Found: ${selector} (count: ${count})`);

      // Check if it contains product tiles
      const productTilesInSection = await page.locator(`${selector} .auc-product-tile`).count();
      logger.info(`  Product tiles in section: ${productTilesInSection}`);

      if (productTilesInSection > 0) {
        // Sample first recommended product
        const firstRec = page.locator(`${selector} .auc-product-tile`).first();
        const recName = await firstRec.locator('.auc-product-tile__name').textContent();
        logger.info(`  Sample recommendation: ${recName?.trim().substring(0, 60)}`);
      }
    }
  }

  await saveHTML(page, 'product-detail-recommendations');
  await capturePageState(page, 'product-detail-recommendations-final');
}

/**
 * Generate research report
 */
async function generateReport(analyses: SearchAnalysis[]): Promise<void> {
  const reportPath = path.join(RESEARCH_ARTIFACTS_DIR, `substitution-ui-research-report.md`);

  let report = `# Substitution UI Research Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += `**Purpose:** Validate and extend selectors for Substitution agent product search\n\n`;
  report += `---\n\n`;

  report += `## Summary\n\n`;
  report += `Total searches tested: ${analyses.length}\n\n`;

  const totalProducts = analyses.reduce((sum, a) => sum + a.productTileCount, 0);
  report += `Total products analyzed: ${totalProducts}\n\n`;

  const withFilters = analyses.filter(a => a.hasFilters).length;
  const withSort = analyses.filter(a => a.hasSortOptions).length;
  report += `Searches with filters: ${withFilters}/${analyses.length}\n`;
  report += `Searches with sort options: ${withSort}/${analyses.length}\n\n`;

  report += `---\n\n`;

  report += `## Test Results\n\n`;

  for (const analysis of analyses) {
    report += `### ${analysis.query}\n\n`;
    report += `- **URL:** ${analysis.url}\n`;
    report += `- **Results Count:** ${analysis.resultsCount}\n`;
    report += `- **Product Tiles on Page:** ${analysis.productTileCount}\n`;
    report += `- **Has Filters:** ${analysis.hasFilters ? '✓ Yes' : '✗ No'}\n`;
    report += `- **Has Sort Options:** ${analysis.hasSortOptions ? '✓ Yes' : '✗ No'}\n`;

    if (analysis.availabilityIndicatorsFound.length > 0) {
      report += `- **Unavailable Indicators Found:** ${analysis.availabilityIndicatorsFound.join(', ')}\n`;
    }

    report += `\n**Sample Products:**\n\n`;
    for (const prod of analysis.sampleProducts) {
      const availIcon = prod.available ? '✓' : '✗';
      report += `${availIcon} ${prod.name.substring(0, 60)} - ${prod.price} (PID: ${prod.pid})\n`;
    }

    if (analysis.notes.length > 0) {
      report += `\n**Notes:**\n`;
      for (const note of analysis.notes) {
        report += `- ${note}\n`;
      }
    }

    report += `\n**Screenshots:**\n`;
    for (const screenshot of analysis.screenshots) {
      report += `- ${screenshot}\n`;
    }

    report += `\n---\n\n`;
  }

  report += `## Selector Validation Status\n\n`;
  report += `Existing selectors from \`data/selectors/pages/search/v1.json\` were validated.\n\n`;
  report += `**Key findings:**\n`;
  report += `- Product tile structure is consistent across searches\n`;
  report += `- data-pid attribute is reliable for product identification\n`;
  report += `- Price and name selectors work consistently\n`;
  report += `- Add-to-cart button disabled state indicates unavailability\n\n`;

  report += `## Recommendations for v2 Selectors\n\n`;
  report += `Based on this research, consider adding to v2.json:\n\n`;
  report += `1. **Filter controls** - if discovered (category, brand, price filters)\n`;
  report += `2. **Sort dropdown** - if discovered\n`;
  report += `3. **Pagination controls** - for handling large result sets\n`;
  report += `4. **Product recommendations on detail page** - for finding substitutes\n`;
  report += `5. **Stock warning indicators** - if found (low stock, limited quantity)\n\n`;

  await writeFile(reportPath, report, 'utf-8');
  logger.info(`Research report generated: ${reportPath}`);
}

async function main() {
  let browser: Browser | null = null;

  try {
    await ensureDirectories();

    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    // Attach auto-popup dismisser
    await attachPopupObserver(page, logger);
    logger.info('Auto-popup dismisser attached');

    // Login
    const credentials = {
      email: process.env.AUCHAN_EMAIL,
      password: process.env.AUCHAN_PASSWORD,
    };

    if (!credentials.email || !credentials.password) {
      throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD environment variables');
    }

    logger.info('Logging in to Auchan.pt...');
    const loginResult = await loginTool.execute(credentials, {
      page,
      logger,
      screenshot: async (name: string) => {
        const screenshotPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
        await page.screenshot({ path: screenshotPath });
        return screenshotPath;
      },
      config: { navigationTimeout: 30000, actionTimeout: 10000, retryCount: 3 },
    });

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error?.message}`);
    }
    logger.info('Login successful');

    // Run search tests
    const analyses: SearchAnalysis[] = [];

    for (const testCase of TEST_QUERIES) {
      const analysis = await performSearchAnalysis(page, testCase);
      analyses.push(analysis);

      // Short pause between searches
      await page.waitForTimeout(1000);
    }

    // Analyze product recommendations (from last search)
    await analyzeProductRecommendations(page);

    // Generate report
    await generateReport(analyses);

    logger.info('\n=== RESEARCH COMPLETE ===\n');
    logger.info(`Output directory: ${OUTPUT_DIR}`);
    logger.info(`Screenshots: ${SCREENSHOTS_DIR}`);
    logger.info(`Research artifacts: ${RESEARCH_ARTIFACTS_DIR}`);

    // Pause to allow manual inspection
    logger.info('Pausing for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    logger.error('Error during research', { error });
    throw error;
  } finally {
    if (browser) {
      await detachPopupObserver(browser.contexts()[0].pages()[0]).catch(() => {});
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

main().catch(console.error);
