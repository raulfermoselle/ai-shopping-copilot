/**
 * Order History Discovery V2
 *
 * More robust approach:
 * 1. Login and wait for full page load
 * 2. Click on account menu (OLÁ, [NAME])
 * 3. Extract all menu options
 * 4. Find and navigate to order history
 * 5. Capture page structure and selectors
 */

import 'dotenv/config';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\screenshots';
const SNAPSHOTS_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages';
const EXPLORATION_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\exploration';

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
  await page.goto('https://www.auchan.pt', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

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
  await page.waitForTimeout(3000); // Extra wait for page to fully load

  console.log('✅ Logged in successfully');
}

/**
 * Explore account menu and find order history
 */
async function exploreAccountMenu(page: Page): Promise<string | null> {
  console.log('\n🔍 Exploring account menu...');

  // Take screenshot of logged-in state
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, 'step1-logged-in.png'),
    fullPage: false,
  });
  console.log('📸 Screenshot: step1-logged-in.png');

  // Find account button - should say "OLÁ, [NAME]"
  const accountButtonSelectors = [
    '.auc-header-account',
    '[data-testid="user-menu"]',
    'text=OLÁ',
    'a:has-text("OLÁ")',
    'button:has-text("OLÁ")',
  ];

  let accountMenu = null;
  for (const selector of accountButtonSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`✅ Found account button: ${selector}`);
      accountMenu = btn;
      break;
    }
  }

  if (!accountMenu) {
    console.error('❌ Could not find account menu button');
    return null;
  }

  // Click account menu
  console.log('🖱️  Clicking account menu...');
  await accountMenu.click();
  await page.waitForTimeout(1500); // Wait for menu to open

  // Take screenshot of opened menu
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, 'step2-account-menu-open.png'),
    fullPage: false,
  });
  console.log('📸 Screenshot: step2-account-menu-open.png');

  // Extract all menu links
  const menuLinks = await page.evaluate(() => {
    // Look for menu container (could be dropdown, sidebar, etc.)
    const containers = [
      document.querySelector('.account-menu'),
      document.querySelector('[data-testid="account-menu"]'),
      document.querySelector('.user-menu'),
      document.querySelector('[role="menu"]'),
      // Fallback: just get all visible links
      document.body,
    ];

    const container = containers.find(c => c !== null) || document.body;
    const links = Array.from(container.querySelectorAll('a'));

    return links
      .filter(a => a.offsetParent !== null) // Only visible elements
      .map(a => ({
        text: a.textContent?.trim() || '',
        href: a.href,
        className: a.className,
        id: a.id,
      }))
      .filter(l => l.text && l.href);
  });

  console.log(`\n📋 Found ${menuLinks.length} menu links:`);
  menuLinks.forEach((link, i) => {
    console.log(`  [${i}] "${link.text}" → ${link.href}`);
  });

  // Save menu links
  await mkdir(EXPLORATION_DIR, { recursive: true });
  await writeFile(
    join(EXPLORATION_DIR, 'account-menu-links.json'),
    JSON.stringify(menuLinks, null, 2),
    'utf-8'
  );

  // Look for order history link
  const orderKeywords = ['encomenda', 'pedido', 'histórico', 'histor', 'order', 'compra'];
  const orderLink = menuLinks.find(link =>
    orderKeywords.some(kw => link.text.toLowerCase().includes(kw))
  );

  if (orderLink) {
    console.log(`\n✅ Found order history link: "${orderLink.text}"`);
    console.log(`   URL: ${orderLink.href}`);
    return orderLink.href;
  }

  console.log('\n⚠️  Order history link not found in menu');
  return null;
}

/**
 * Navigate to order history and capture page
 */
async function captureOrderHistory(page: Page, url: string): Promise<void> {
  console.log(`\n📋 Navigating to order history: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  console.log(`📍 Current URL: ${finalUrl}`);

  // Take screenshot
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, 'step3-order-history-list.png'),
    fullPage: true,
  });
  console.log('📸 Screenshot: step3-order-history-list.png');

  // Save HTML
  const html = await page.content();
  const snapshotDir = join(SNAPSHOTS_DIR, 'order-history', 'snapshots');
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(join(snapshotDir, 'order-list.html'), html, 'utf-8');
  console.log(`💾 HTML saved: ${join(snapshotDir, 'order-list.html')}`);

  // Extract page structure
  const structure = await page.evaluate(() => {
    const result: any = {
      title: document.title,
      url: window.location.href,
      mainContentSelectors: [],
      potentialOrderContainers: [],
      allLinks: [],
    };

    // Find main content
    const mainSelectors = ['main', '[role="main"]', '.main-content', '#main'];
    for (const sel of mainSelectors) {
      if (document.querySelector(sel)) {
        result.mainContentSelectors.push(sel);
      }
    }

    // Find potential order containers
    const containerSelectors = [
      '.order', '.pedido', '.encomenda',
      '[data-testid*="order"]', '[data-testid*="pedido"]',
      '[class*="order"]', '[class*="Order"]',
      'article', 'li', '.card', '.item',
    ];

    for (const sel of containerSelectors) {
      const count = document.querySelectorAll(sel).length;
      if (count > 0 && count < 50) { // Reasonable number
        result.potentialOrderContainers.push({ selector: sel, count });
      }
    }

    // Get all links (might have "view details", "reorder", etc.)
    result.allLinks = Array.from(document.querySelectorAll('a'))
      .filter(a => a.offsetParent !== null && a.textContent?.trim())
      .map(a => ({
        text: a.textContent?.trim(),
        href: a.href,
      }))
      .slice(0, 30);

    return result;
  });

  console.log('\n📊 Page structure analysis:');
  console.log('   Title:', structure.title);
  console.log('   Main selectors:', structure.mainContentSelectors);
  console.log('   Potential order containers:', structure.potentialOrderContainers);
  console.log('   Sample links:', structure.allLinks.slice(0, 5));

  // Save structure
  await writeFile(
    join(EXPLORATION_DIR, 'order-history-structure.json'),
    JSON.stringify(structure, null, 2),
    'utf-8'
  );
}

/**
 * Try to navigate to first order detail
 */
async function exploreOrderDetail(page: Page): Promise<void> {
  console.log('\n🔍 Looking for order detail link...');

  const detailLinkSelectors = [
    'a:has-text("Ver detalhes")',
    'a:has-text("Detalhes")',
    'a:has-text("Ver")',
    'a[href*="order"]',
    'a[href*="encomenda"]',
    'a[href*="pedido"]',
    '.order a',
    '[data-testid*="order"] a',
  ];

  for (const selector of detailLinkSelectors) {
    const link = page.locator(selector).first();
    if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
      const text = await link.textContent();
      const href = await link.getAttribute('href');
      console.log(`✅ Found detail link: "${text?.trim()}" (${selector})`);
      console.log(`   href: ${href}`);

      // Click to navigate
      await link.click();
      await page.waitForTimeout(3000);

      const finalUrl = page.url();
      console.log(`📍 Order detail URL: ${finalUrl}`);

      // Take screenshot
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'step4-order-detail.png'),
        fullPage: true,
      });
      console.log('📸 Screenshot: step4-order-detail.png');

      // Save HTML
      const html = await page.content();
      const snapshotDir = join(SNAPSHOTS_DIR, 'order-detail', 'snapshots');
      await mkdir(snapshotDir, { recursive: true });
      await writeFile(join(snapshotDir, 'order-detail.html'), html, 'utf-8');
      console.log(`💾 HTML saved: ${join(snapshotDir, 'order-detail.html')}`);

      // Extract structure
      const structure = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          potentialItemContainers: Array.from(
            new Set([
              ...Array.from(document.querySelectorAll('.item')).map(() => '.item'),
              ...Array.from(document.querySelectorAll('.product')).map(() => '.product'),
              ...Array.from(document.querySelectorAll('[data-testid*="item"]')).map(el => `[data-testid="${el.getAttribute('data-testid')}"]`),
            ])
          ).slice(0, 10),
        };
      });

      console.log('\n📊 Order detail structure:');
      console.log('   Title:', structure.title);
      console.log('   Potential item containers:', structure.potentialItemContainers);

      await writeFile(
        join(EXPLORATION_DIR, 'order-detail-structure.json'),
        JSON.stringify(structure, null, 2),
        'utf-8'
      );

      return;
    }
  }

  console.log('⚠️  Could not find order detail link');
}

/**
 * Main discovery flow
 */
async function main() {
  let browser: Browser | null = null;

  try {
    console.log('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 100,
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();

    // Step 1: Login
    await login(page);

    // Step 2: Explore account menu
    const orderHistoryUrl = await exploreAccountMenu(page);

    if (!orderHistoryUrl) {
      console.error('\n❌ Could not find order history URL');
      console.log('🔍 Browser will stay open for manual exploration');
      console.log('   Navigate manually and observe the structure');
      await new Promise(() => {});
      return;
    }

    // Step 3: Capture order history page
    await captureOrderHistory(page, orderHistoryUrl);

    // Step 4: Try to explore order detail
    await exploreOrderDetail(page);

    console.log('\n✅ Discovery complete!');
    console.log('\n📂 Review outputs:');
    console.log(`   Screenshots: ${SCREENSHOTS_DIR}`);
    console.log(`   HTML snapshots: ${SNAPSHOTS_DIR}`);
    console.log(`   Analysis: ${EXPLORATION_DIR}`);

    console.log('\n🔍 Browser will stay open for manual verification');
    console.log('   Press Ctrl+C when done\n');

    await new Promise(() => {});
  } catch (error) {
    console.error('\n❌ Discovery failed:', error);
    console.log('\n🔍 Browser will stay open for debugging');
    await new Promise(() => {});
  }
}

main().catch(console.error);
