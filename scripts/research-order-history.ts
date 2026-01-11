/**
 * Research Script: Auchan.pt Order History UI Discovery
 *
 * This script:
 * 1. Logs into Auchan.pt
 * 2. Discovers order history navigation path
 * 3. Captures order list page structure
 * 4. Navigates to order detail page
 * 5. Documents all selectors with fallbacks
 * 6. Saves snapshots and screenshots
 * 7. Creates selector registry entries
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots';
const SNAPSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages';

interface SelectorCandidate {
  name: string;
  selector: string;
  score: number;
  reason: string;
  isUnique: boolean;
  matchCount: number;
}

interface DiscoveredElement {
  name: string;
  primary: string;
  fallbacks: string[];
  notes: string;
  verified: boolean;
}

/**
 * Score selector based on stability and reliability
 */
function scoreSelector(selector: string): number {
  if (selector.includes('[data-testid=')) return 95;
  if (selector.includes('[data-test=')) return 95;
  if (selector.startsWith('[aria-')) return 85;
  if (selector.startsWith('#') && !selector.match(/\d{5,}/)) return 75; // ID without long numbers
  if (selector.startsWith('[id=') && !selector.match(/\d{5,}/)) return 75;
  if (selector.includes('[role=')) return 70;
  if (selector.match(/^[a-z-]+$/)) return 65; // Simple tag name
  if (selector.startsWith('.') && selector.split('.').length <= 3) return 60; // Class (max 2 classes)
  if (selector.includes(':has-text(')) return 50;
  if (selector.includes('>>')) return 40; // Chained selectors are more brittle
  return 30;
}

/**
 * Test if a selector is unique on the page
 */
async function testSelectorUniqueness(
  page: Page,
  selector: string
): Promise<{ isUnique: boolean; count: number }> {
  try {
    const count = await page.locator(selector).count();
    return { isUnique: count === 1, count };
  } catch {
    return { isUnique: false, count: 0 };
  }
}

/**
 * Generate multiple selector candidates for an element
 */
async function generateSelectorCandidates(
  page: Page,
  description: string,
  candidates: string[]
): Promise<SelectorCandidate[]> {
  const results: SelectorCandidate[] = [];

  for (const selector of candidates) {
    const { isUnique, count } = await testSelectorUniqueness(page, selector);
    const score = scoreSelector(selector);

    results.push({
      name: description,
      selector,
      score,
      reason: getSelectorReason(selector),
      isUnique,
      matchCount: count,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

function getSelectorReason(selector: string): string {
  if (selector.includes('[data-testid=')) return 'data-testid (most stable)';
  if (selector.includes('[data-test=')) return 'data-test (most stable)';
  if (selector.startsWith('[aria-')) return 'ARIA attribute (accessible, stable)';
  if (selector.startsWith('#')) return 'ID (unique, fairly stable)';
  if (selector.includes('[role=')) return 'ARIA role (semantic, stable)';
  if (selector.startsWith('.')) return 'Class name (moderate stability)';
  if (selector.includes(':has-text(')) return 'Text content (fragile to translations)';
  return 'Custom selector';
}

/**
 * Login to Auchan.pt
 */
async function login(page: Page): Promise<void> {
  const email = process.env.AUCHAN_EMAIL;
  const password = process.env.AUCHAN_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing AUCHAN_EMAIL or AUCHAN_PASSWORD in .env');
  }

  console.log('🔐 Logging in to Auchan.pt...');

  // Navigate to homepage
  await page.goto('https://www.auchan.pt', { waitUntil: 'networkidle' });

  // Handle cookie consent
  const cookieButton = page.locator(
    '[data-testid="cookie-accept"], .cookie-accept, #onetrust-accept-btn-handler'
  ).first();
  if (await cookieButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieButton.click();
    await page.waitForTimeout(500);
  }

  // Dismiss popups
  const dismissButton = page.locator(
    '#onesignal-slidedown-cancel-button, button:has-text("Não"), button:has-text("Fechar")'
  ).first();
  if (await dismissButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissButton.click();
    await page.waitForTimeout(500);
  }

  // Check if already logged in
  const loggedIn = await page
    .locator('.auc-header-account span:not(:has-text("Login")), [data-testid="user-menu"]')
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (loggedIn) {
    console.log('✅ Already logged in');
    return;
  }

  // Navigate to login
  const accountButton = page
    .locator('.auc-header-account a[href*="Login-OAuthLogin"], .auc-header-account a:has-text("Login")')
    .first();
  if (await accountButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await accountButton.click();
    await page.waitForTimeout(500);
  }

  const loginLink = page.locator('a[href*="Login-OAuthLogin"]').first();
  if (await loginLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loginLink.click();
  }

  // Wait for login form
  await page.waitForSelector(
    '#uname1, input[type="email"], input[name="uname1"]',
    { timeout: 10000 }
  );

  // Fill login form
  await page.fill('#uname1, input[type="email"], input[name="uname1"]', email);
  await page.fill('#pwd1, input[type="password"]', password);
  await page.click('#btnSubmit_login, input[type="button"][value*="Aceda"]');

  // Wait for redirect back to Auchan
  await page.waitForURL(/auchan\.pt/, { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  console.log('✅ Logged in successfully');
}

/**
 * Discover order history navigation and page structure
 */
async function discoverOrderHistory(page: Page): Promise<void> {
  console.log('\n📋 Discovering order history interface...');

  // Strategy: Look for account menu, "Minhas encomendas", "Histórico", etc.
  const navigationCandidates = [
    'a[href*="order"], a[href*="encomenda"], a[href*="historico"]',
    'a:has-text("Minhas encomendas")',
    'a:has-text("Histórico")',
    'a:has-text("Encomendas")',
    'a:has-text("Pedidos")',
    '[data-testid="orders"], [data-testid="order-history"]',
    '.account-menu a:has-text("Encomendas")',
    'nav a:has-text("Encomendas")',
  ];

  console.log('🔍 Searching for order history link...');

  // First, try to find the account menu
  const accountMenuSelectors = [
    '.auc-header-account',
    '[data-testid="user-menu"]',
    '.account-menu',
    '.user-menu',
    'a:has-text("A minha conta")',
    'a:has-text("Conta")',
  ];

  let foundAccountMenu = false;
  for (const selector of accountMenuSelectors) {
    const menuButton = page.locator(selector).first();
    if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`✅ Found account menu: ${selector}`);
      await menuButton.click();
      await page.waitForTimeout(1000);
      foundAccountMenu = true;
      break;
    }
  }

  if (!foundAccountMenu) {
    console.log('⚠️  Account menu not found, searching whole page...');
  }

  // Now look for order history link
  let orderHistoryUrl: string | null = null;
  for (const selector of navigationCandidates) {
    const link = page.locator(selector).first();
    if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      console.log(`✅ Found order link: "${text?.trim()}" (${selector})`);
      console.log(`   href: ${href}`);

      // Click to navigate
      await link.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      orderHistoryUrl = page.url();
      console.log(`📍 Order history URL: ${orderHistoryUrl}`);
      break;
    }
  }

  if (!orderHistoryUrl) {
    throw new Error('Could not find order history navigation link');
  }

  // Capture order list page
  await capturePageSnapshot(page, 'order-history-list');
}

/**
 * Capture page HTML and screenshot
 */
async function capturePageSnapshot(page: Page, name: string): Promise<void> {
  console.log(`📸 Capturing snapshot: ${name}`);

  // Screenshot
  const screenshotPath = join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`   Screenshot: ${screenshotPath}`);

  // HTML snapshot
  const html = await page.content();
  const snapshotPath = join(SNAPSHOTS_DIR, name.replace('-list', '').replace('-detail', ''), 'snapshots', `${name}.html`);
  await mkdir(join(SNAPSHOTS_DIR, name.replace('-list', '').replace('-detail', ''), 'snapshots'), { recursive: true });
  await writeFile(snapshotPath, html, 'utf-8');
  console.log(`   HTML: ${snapshotPath}`);
}

/**
 * Discover selectors for order list page
 */
async function discoverOrderListSelectors(page: Page): Promise<DiscoveredElement[]> {
  console.log('\n🔍 Discovering order list selectors...');

  const elements: DiscoveredElement[] = [];

  // Order list container
  const containerCandidates = await generateSelectorCandidates(page, 'Order list container', [
    '[data-testid="order-list"]',
    '[data-testid="orders"]',
    '.order-list',
    '.orders-container',
    '[role="list"]',
    'main .order',
    'section:has(.order)',
  ]);
  console.log('Container candidates:', containerCandidates.filter(c => c.matchCount > 0));

  // Order row/card
  const orderRowCandidates = await generateSelectorCandidates(page, 'Order row/card', [
    '[data-testid="order-item"]',
    '[data-testid="order-card"]',
    '.order-item',
    '.order-card',
    '.order',
    '[role="listitem"]',
    'article',
  ]);
  console.log('Order row candidates:', orderRowCandidates.filter(c => c.matchCount > 0));

  // Order ID
  const orderIdCandidates = await generateSelectorCandidates(page, 'Order ID', [
    '[data-testid="order-id"]',
    '.order-id',
    '.order-number',
    '[aria-label*="número"], [aria-label*="order"]',
    'strong:has-text("Nº")',
  ]);
  console.log('Order ID candidates:', orderIdCandidates.filter(c => c.matchCount > 0));

  // Order date
  const orderDateCandidates = await generateSelectorCandidates(page, 'Order date', [
    '[data-testid="order-date"]',
    '.order-date',
    'time',
    '[datetime]',
  ]);
  console.log('Order date candidates:', orderDateCandidates.filter(c => c.matchCount > 0));

  // Order total
  const orderTotalCandidates = await generateSelectorCandidates(page, 'Order total', [
    '[data-testid="order-total"]',
    '.order-total',
    '.order-price',
    '[aria-label*="total"], [aria-label*="preço"]',
  ]);
  console.log('Order total candidates:', orderTotalCandidates.filter(c => c.matchCount > 0));

  // Order status
  const orderStatusCandidates = await generateSelectorCandidates(page, 'Order status', [
    '[data-testid="order-status"]',
    '.order-status',
    '.status',
    '[aria-label*="estado"]',
  ]);
  console.log('Order status candidates:', orderStatusCandidates.filter(c => c.matchCount > 0));

  // View details link
  const viewDetailsCandidates = await generateSelectorCandidates(page, 'View details link', [
    '[data-testid="view-order"]',
    'a:has-text("Ver detalhes")',
    'a:has-text("Detalhes")',
    '.order-details-link',
    'a[href*="order"]',
  ]);
  console.log('View details candidates:', viewDetailsCandidates.filter(c => c.matchCount > 0));

  // For now, return discovered candidates
  // We'll manually review and choose the best ones
  return elements;
}

/**
 * Discover selectors for order detail page
 */
async function discoverOrderDetailSelectors(page: Page): Promise<DiscoveredElement[]> {
  console.log('\n🔍 Discovering order detail selectors...');

  const elements: DiscoveredElement[] = [];

  // Order items container
  const itemsContainerCandidates = await generateSelectorCandidates(page, 'Order items container', [
    '[data-testid="order-items"]',
    '[data-testid="items"]',
    '.order-items',
    '.items-list',
    '[role="list"]',
  ]);
  console.log('Items container candidates:', itemsContainerCandidates.filter(c => c.matchCount > 0));

  // Item row
  const itemRowCandidates = await generateSelectorCandidates(page, 'Item row', [
    '[data-testid="order-item"]',
    '[data-testid="item"]',
    '.order-item',
    '.item',
    '[role="listitem"]',
  ]);
  console.log('Item row candidates:', itemRowCandidates.filter(c => c.matchCount > 0));

  // Item name
  const itemNameCandidates = await generateSelectorCandidates(page, 'Item name', [
    '[data-testid="item-name"]',
    '.item-name',
    '.product-name',
    '[aria-label*="produto"]',
  ]);
  console.log('Item name candidates:', itemNameCandidates.filter(c => c.matchCount > 0));

  // Item quantity
  const itemQuantityCandidates = await generateSelectorCandidates(page, 'Item quantity', [
    '[data-testid="item-quantity"]',
    '.item-quantity',
    '.quantity',
    '[aria-label*="quantidade"]',
  ]);
  console.log('Item quantity candidates:', itemQuantityCandidates.filter(c => c.matchCount > 0));

  // Item price
  const itemPriceCandidates = await generateSelectorCandidates(page, 'Item price', [
    '[data-testid="item-price"]',
    '.item-price',
    '.price',
    '[aria-label*="preço"]',
  ]);
  console.log('Item price candidates:', itemPriceCandidates.filter(c => c.matchCount > 0));

  // Reorder/Add to cart button
  const reorderCandidates = await generateSelectorCandidates(page, 'Reorder button', [
    '[data-testid="reorder"]',
    'button:has-text("Encomendar novamente")',
    'button:has-text("Adicionar ao carrinho")',
    '.reorder-button',
  ]);
  console.log('Reorder button candidates:', reorderCandidates.filter(c => c.matchCount > 0));

  return elements;
}

/**
 * Main research flow
 */
async function main() {
  let browser: Browser | null = null;

  try {
    // Launch browser
    console.log('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: false, // Headed so we can observe
      slowMo: 100, // Slow down for observation
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Step 1: Login
    await login(page);

    // Step 2: Discover order history
    await discoverOrderHistory(page);

    // Step 3: Discover order list selectors
    await discoverOrderListSelectors(page);

    // Step 4: Navigate to an order detail page
    console.log('\n🔍 Looking for first order to open...');
    const firstOrderLink = page.locator('a[href*="order"], a:has-text("Ver")').first();
    if (await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✅ Found first order, clicking...');
      await firstOrderLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      console.log(`📍 Order detail URL: ${page.url()}`);

      // Capture order detail page
      await capturePageSnapshot(page, 'order-history-detail');

      // Discover order detail selectors
      await discoverOrderDetailSelectors(page);
    } else {
      console.log('⚠️  No orders found - unable to discover detail page selectors');
    }

    console.log('\n✅ Research complete! Review screenshots and HTML snapshots.');
    console.log('📂 Screenshots: C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots');
    console.log('📂 Snapshots: C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages');

    // Keep browser open for manual inspection
    console.log('\n⏸️  Browser will remain open for manual inspection.');
    console.log('Press Ctrl+C to close when done.');

    await new Promise(() => {}); // Keep alive
  } catch (error) {
    console.error('\n❌ Research failed:', error);
    throw error;
  }
}

main().catch(console.error);
