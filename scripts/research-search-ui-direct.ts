/**
 * Research Script: Auchan.pt Product Search UI (Direct Navigation)
 *
 * Instead of fighting with the search input, navigate directly to a search URL
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\search';
const PRODUCT_DETAIL_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\product-detail';
const SCREENSHOTS_DIR = path.join(OUTPUT_DIR, 'screenshots');

async function ensureDirectories() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(PRODUCT_DETAIL_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  await mkdir(path.join(PRODUCT_DETAIL_DIR, 'screenshots'), { recursive: true });
}

async function capturePageState(page: Page, label: string, outputDir = OUTPUT_DIR) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotsDir = path.join(outputDir, 'screenshots');
  const screenshotPath = path.join(screenshotsDir, `${label}_${timestamp}.png`);
  const htmlPath = path.join(outputDir, `${label}_${timestamp}.html`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const html = await page.content();
  await writeFile(htmlPath, html, 'utf-8');

  console.log(`Captured: ${label}`);
  console.log(`  Screenshot: ${screenshotPath}`);
  console.log(`  HTML: ${htmlPath}`);

  return { screenshotPath, htmlPath };
}

async function dismissCookieConsent(page: Page) {
  console.log('Checking for cookie consent...');

  const consentSelectors = [
    'button:has-text("Aceitar")',
    'button:has-text("Accept")',
    'button[id*="accept"]',
    '#onetrust-accept-btn-handler',
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

async function analyzeSearchResults(page: Page) {
  console.log('\n=== ANALYZING SEARCH RESULTS PAGE ===\n');

  const url = page.url();
  console.log(`URL: ${url}`);

  // Parse URL for query params
  const urlObj = new URL(url);
  console.log(`\nURL Pattern: ${urlObj.pathname}`);
  console.log(`Search params:`);
  urlObj.searchParams.forEach((value, key) => {
    console.log(`  ${key} = ${value}`);
  });

  // Look for product containers
  console.log('\n--- Looking for Product Containers ---');
  const productContainerSelectors = [
    '.product-card',
    '.auc-product-card',
    '.product-item',
    '.search-result',
    '[data-product-id]',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    'article',
  ];

  let productSelector = null;
  for (const selector of productContainerSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
      if (!productSelector) {
        productSelector = selector;
      }
    }
  }

  if (!productSelector) {
    console.log('No product containers found with standard selectors.');
    console.log('Trying to find any repeated elements...');

    // Get all elements and see if there's a pattern
    const allDivs = await page.locator('div[class]').all();
    console.log(`Total divs with classes: ${allDivs.length}`);
  }

  // Analyze first product card in detail
  if (productSelector) {
    console.log(`\n--- Analyzing First Product (${productSelector}) ---`);
    const productCard = page.locator(productSelector).first();

    try {
      const productClasses = await productCard.getAttribute('class').catch(() => 'N/A');
      console.log(`Product card classes: ${productClasses}`);

      // Look for product link
      const links = await productCard.locator('a[href]').all();
      console.log(`\nLinks in product card: ${links.length}`);
      for (let i = 0; i < Math.min(links.length, 3); i++) {
        const href = await links[i].getAttribute('href');
        const text = await links[i].textContent();
        console.log(`  Link ${i + 1}: ${href}`);
        console.log(`    Text: "${text?.trim().substring(0, 50)}"`);
      }

      // Look for product name/title
      const headings = await productCard.locator('h1, h2, h3, h4').all();
      console.log(`\nHeadings in product card: ${headings.length}`);
      for (const heading of headings) {
        const text = await heading.textContent();
        const tagName = await heading.evaluate(el => el.tagName);
        const classes = await heading.getAttribute('class');
        console.log(`  ${tagName}: "${text?.trim()}"`);
        console.log(`    Classes: ${classes}`);
      }

      // Look for price
      const priceSelectors = [
        '.price',
        '[class*="price"]',
        '[class*="Price"]',
        'span:has-text("€")',
      ];

      console.log('\n--- Product Price ---');
      for (const selector of priceSelectors) {
        const elements = await productCard.locator(selector).all();
        for (let i = 0; i < Math.min(elements.length, 2); i++) {
          const text = await elements[i].textContent();
          const classes = await elements[i].getAttribute('class');
          console.log(`  ${selector}: "${text?.trim()}"`);
          console.log(`    Classes: ${classes}`);
        }
      }

      // Look for images
      const images = await productCard.locator('img').all();
      console.log(`\n--- Product Images ---`);
      console.log(`Image count: ${images.length}`);
      if (images.length > 0) {
        const src = await images[0].getAttribute('src');
        const alt = await images[0].getAttribute('alt');
        console.log(`  First image src: ${src}`);
        console.log(`  First image alt: "${alt}"`);
      }

      // Look for buttons
      const buttons = await productCard.locator('button').all();
      console.log(`\n--- Product Buttons ---`);
      console.log(`Button count: ${buttons.length}`);
      for (let i = 0; i < Math.min(buttons.length, 3); i++) {
        const text = await buttons[i].textContent();
        const classes = await buttons[i].getAttribute('class');
        const ariaLabel = await buttons[i].getAttribute('aria-label');
        console.log(`  Button ${i + 1}: "${text?.trim()}"`);
        console.log(`    Classes: ${classes}`);
        console.log(`    Aria-label: ${ariaLabel}`);
      }
    } catch (error) {
      console.error('Error analyzing product card:', error);
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
    '[class*="OutOfStock"]',
    '[class*="Unavailable"]',
    'button:disabled',
  ];

  for (const selector of unavailableSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
      const text = await page.locator(selector).first().textContent().catch(() => 'N/A');
      console.log(`  Text: "${text?.trim()}"`);
    }
  }

  // Look for stock text indicators
  const stockTextPatterns = [
    'text=/esgotado/i',
    'text=/indisponível/i',
    'text=/stock limitado/i',
    'text=/últimas unidades/i',
  ];

  console.log('\n--- Stock Text Indicators ---');
  for (const pattern of stockTextPatterns) {
    const count = await page.locator(pattern).count();
    if (count > 0) {
      console.log(`${pattern}: ${count} elements`);
    }
  }
}

async function analyzeSubstitutionFeatures(page: Page) {
  console.log('\n=== ANALYZING SUBSTITUTION/RECOMMENDATION FEATURES ===\n');

  // Look for "similar products" sections
  const similarProductSelectors = [
    '[class*="similar"]',
    '[class*="Similar"]',
    '[class*="related"]',
    '[class*="Related"]',
    '[class*="recommend"]',
    '[class*="Recommend"]',
    '[class*="alternative"]',
    '[class*="Alternative"]',
  ];

  for (const selector of similarProductSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
    }
  }
}

async function navigateToProductDetail(page: Page) {
  console.log('\n=== NAVIGATING TO PRODUCT DETAIL ===\n');

  // Find first product link
  const productLinks = await page.locator('a[href*="/produtos/"], a[href*="/product/"]').all();

  if (productLinks.length === 0) {
    console.log('No product links found');
    return null;
  }

  const firstLink = productLinks[0];
  const href = await firstLink.getAttribute('href');
  console.log(`Navigating to: ${href}`);

  await page.goto(`https://www.auchan.pt${href}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  });
  await page.waitForTimeout(2000);

  await capturePageState(page, 'product-detail', PRODUCT_DETAIL_DIR);

  return href;
}

async function analyzeProductDetail(page: Page) {
  console.log('\n=== ANALYZING PRODUCT DETAIL PAGE ===\n');

  const url = page.url();
  console.log(`URL: ${url}`);
  console.log(`URL Pattern: ${new URL(url).pathname}`);

  // Look for add to cart button
  console.log('\n--- Add to Cart Button ---');
  const addToCartSelectors = [
    'button:has-text("Adicionar")',
    'button:has-text("Carrinho")',
    '[class*="add-to-cart"]',
    '[class*="AddToCart"]',
    'button[data-action="add-to-cart"]',
  ];

  for (const selector of addToCartSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`${selector}: ${count} elements`);
      const button = page.locator(selector).first();
      const text = await button.textContent().catch(() => 'N/A');
      const classes = await button.getAttribute('class').catch(() => 'N/A');
      const disabled = await button.isDisabled().catch(() => false);
      console.log(`  Text: "${text?.trim()}"`);
      console.log(`  Classes: ${classes}`);
      console.log(`  Disabled: ${disabled}`);
    }
  }

  // Look for recommendations
  console.log('\n--- Product Recommendations ---');
  await analyzeSubstitutionFeatures(page);

  // Look for similar/related products section
  const sectionHeadings = await page.locator('h2, h3').all();
  console.log(`\n--- Section Headings ---`);
  for (const heading of sectionHeadings) {
    const text = await heading.textContent();
    console.log(`  "${text?.trim()}"`);
  }
}

async function main() {
  let browser: Browser | null = null;

  try {
    await ensureDirectories();

    browser = await chromium.launch({
      headless: false,
      slowMo: 200,
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Navigate directly to a search URL
    console.log('Navigating to Auchan.pt search results...');
    await page.goto('https://www.auchan.pt/pt/pesquisa?q=leite', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    // Dismiss cookie consent
    await dismissCookieConsent(page);

    await capturePageState(page, 'search-results-leite');

    // Analyze search results
    await analyzeSearchResults(page);
    await analyzeAvailability(page);
    await analyzeSubstitutionFeatures(page);

    // Try another search - more specific
    console.log('\n\n=== SECOND SEARCH (specific product) ===\n');
    await page.goto('https://www.auchan.pt/pt/pesquisa?q=azeite', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    await capturePageState(page, 'search-results-azeite');
    await analyzeSearchResults(page);

    // Navigate to product detail
    const productUrl = await navigateToProductDetail(page);

    if (productUrl) {
      await analyzeProductDetail(page);
    }

    console.log('\n=== RESEARCH COMPLETE ===\n');
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`Product detail directory: ${PRODUCT_DETAIL_DIR}`);

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
