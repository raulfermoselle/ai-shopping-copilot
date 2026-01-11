/**
 * Delivery Slot Research Script
 *
 * Sprint: Sprint-SS-R-001
 * Objective: Research Auchan.pt delivery slot UI and constraints
 *
 * CRITICAL: READ-ONLY research. NEVER select or confirm a delivery slot.
 *
 * This script will:
 * 1. Login to Auchan.pt using existing session
 * 2. Navigate to cart (or add test item if cart is empty)
 * 3. Proceed to checkout to reach delivery slot selection
 * 4. Capture screenshots and HTML of the slot selection UI
 * 5. Document selectors, constraints, and behaviors
 * 6. Exit WITHOUT selecting any slot
 */

import dotenv from 'dotenv';
import { chromium, Browser, Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Load environment variables
dotenv.config();

interface ResearchFindings {
  urls: {
    checkoutEntry?: string;
    slotSelectionPage?: string;
  };
  slotDisplay: {
    format: string; // 'calendar' | 'list' | 'time-blocks' | 'other'
    dateRange: string;
    timeSlotFormat: string;
  };
  constraints: {
    minimumCartValue?: string;
    bookingAdvanceDays?: number;
    slotDuration?: string;
    hasExpressOption?: boolean;
    hasPremiumSlots?: boolean;
  };
  selectors: {
    [key: string]: {
      description: string;
      candidates: string[];
      verified: boolean;
    };
  };
  screenshots: string[];
  htmlSnapshots: string[];
  notes: string[];
}

const RESEARCH_OUTPUT_DIR = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\delivery-slots';
const SESSION_PATH = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\sessions\\auchan-session.json';

async function captureSnapshot(page: Page, label: string, findings: ResearchFindings): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = join(RESEARCH_OUTPUT_DIR, 'snapshots', `${label}-${timestamp}.png`);
  const htmlPath = join(RESEARCH_OUTPUT_DIR, 'snapshots', `${label}-${timestamp}.html`);

  // Ensure snapshots directory exists
  const snapshotsDir = join(RESEARCH_OUTPUT_DIR, 'snapshots');
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  // Capture screenshot
  await page.screenshot({ path: screenshotPath, fullPage: true });
  findings.screenshots.push(screenshotPath);
  console.log(`📸 Screenshot saved: ${screenshotPath}`);

  // Capture HTML
  const html = await page.content();
  writeFileSync(htmlPath, html, 'utf-8');
  findings.htmlSnapshots.push(htmlPath);
  console.log(`📄 HTML saved: ${htmlPath}`);
}

async function discoverSelectors(page: Page, findings: ResearchFindings): Promise<void> {
  console.log('\n🔍 Discovering selectors...');

  // Try to find calendar/date picker
  const calendarSelectors = [
    '[class*="calendar"]',
    '[class*="date-picker"]',
    '[role="grid"]',
    '[class*="slot-picker"]',
    '.auc-calendar',
    '.delivery-calendar'
  ];

  for (const selector of calendarSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`  ✓ Found calendar element: ${selector} (${count} matches)`);
      if (!findings.selectors.calendar) {
        findings.selectors.calendar = {
          description: 'Main calendar/date picker container',
          candidates: [],
          verified: true
        };
      }
      findings.selectors.calendar.candidates.push(selector);
    }
  }

  // Try to find individual slot buttons/cards
  const slotSelectors = [
    '[class*="slot"]',
    '[class*="time-slot"]',
    '[class*="delivery-slot"]',
    'button[class*="slot"]',
    '[data-slot-id]',
    '[data-time]',
    '.slot-option'
  ];

  for (const selector of slotSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`  ✓ Found slot elements: ${selector} (${count} matches)`);
      if (!findings.selectors.slotButton) {
        findings.selectors.slotButton = {
          description: 'Individual time slot button/card',
          candidates: [],
          verified: true
        };
      }
      findings.selectors.slotButton.candidates.push(selector);
    }
  }

  // Try to find availability indicators
  const availabilitySelectors = [
    '[class*="available"]',
    '[class*="unavailable"]',
    '[class*="full"]',
    '[class*="disabled"]',
    '[disabled]',
    '[aria-disabled="true"]'
  ];

  for (const selector of availabilitySelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`  ✓ Found availability indicator: ${selector} (${count} matches)`);
      if (!findings.selectors.availabilityIndicator) {
        findings.selectors.availabilityIndicator = {
          description: 'Slot availability status indicator',
          candidates: [],
          verified: true
        };
      }
      findings.selectors.availabilityIndicator.candidates.push(selector);
    }
  }

  // Try to find price elements
  const priceSelectors = [
    '[class*="price"]',
    '[class*="fee"]',
    '[class*="cost"]',
    '.slot-price',
    '[data-price]'
  ];

  for (const selector of priceSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`  ✓ Found price elements: ${selector} (${count} matches)`);
      if (!findings.selectors.slotPrice) {
        findings.selectors.slotPrice = {
          description: 'Slot price/fee display',
          candidates: [],
          verified: true
        };
      }
      findings.selectors.slotPrice.candidates.push(selector);
    }
  }

  // Try to find date navigation
  const navigationSelectors = [
    'button[aria-label*="next"]',
    'button[aria-label*="previous"]',
    'button[aria-label*="seguinte"]',
    'button[aria-label*="anterior"]',
    '[class*="nav"]',
    '[class*="arrow"]'
  ];

  for (const selector of navigationSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`  ✓ Found navigation elements: ${selector} (${count} matches)`);
      if (!findings.selectors.dateNavigation) {
        findings.selectors.dateNavigation = {
          description: 'Calendar date navigation (prev/next)',
          candidates: [],
          verified: true
        };
      }
      findings.selectors.dateNavigation.candidates.push(selector);
    }
  }
}

async function analyzeSlotUI(page: Page, findings: ResearchFindings): Promise<void> {
  console.log('\n📊 Analyzing slot UI structure...');

  // Check page text for clues about constraints
  const pageText = await page.textContent('body') || '';

  // Look for minimum cart value
  const cartValueMatch = pageText.match(/mínimo.*?(\d+)\s*€/i) ||
                         pageText.match(/valor.*?mínimo.*?(\d+)/i);
  if (cartValueMatch) {
    findings.constraints.minimumCartValue = cartValueMatch[1] + '€';
    findings.notes.push(`Found minimum cart value: ${findings.constraints.minimumCartValue}`);
  }

  // Look for express/premium mentions
  if (pageText.toLowerCase().includes('express') || pageText.toLowerCase().includes('rápida')) {
    findings.constraints.hasExpressOption = true;
    findings.notes.push('Express delivery option detected');
  }

  if (pageText.toLowerCase().includes('premium') || pageText.toLowerCase().includes('prioritária')) {
    findings.constraints.hasPremiumSlots = true;
    findings.notes.push('Premium delivery slots detected');
  }

  // Analyze URL
  const currentUrl = page.url();
  findings.urls.slotSelectionPage = currentUrl;
  console.log(`  Current URL: ${currentUrl}`);

  // Check if it's a calendar view
  const hasCalendar = await page.locator('[class*="calendar"], [role="grid"]').count() > 0;
  if (hasCalendar) {
    findings.slotDisplay.format = 'calendar';
    findings.notes.push('UI uses calendar format');
  }

  // Check if it's a list view
  const hasList = await page.locator('ul, ol, [role="list"]').count() > 0;
  if (hasList && !hasCalendar) {
    findings.slotDisplay.format = 'list';
    findings.notes.push('UI uses list format');
  }

  // Count visible slot options
  const slotCount = await page.locator('[class*="slot"], button[class*="time"]').count();
  console.log(`  Visible slot options: ${slotCount}`);
  findings.notes.push(`Found ${slotCount} slot elements on current view`);
}

async function main(): Promise<void> {
  let browser: Browser | null = null;

  try {
    console.log('🚀 Starting delivery slot research...\n');

    // Initialize findings
    const findings: ResearchFindings = {
      urls: {},
      slotDisplay: {
        format: 'unknown',
        dateRange: 'TBD',
        timeSlotFormat: 'TBD'
      },
      constraints: {},
      selectors: {},
      screenshots: [],
      htmlSnapshots: [],
      notes: []
    };

    // Check for existing session
    if (!existsSync(SESSION_PATH)) {
      console.error('❌ No session found. Please login first using the login tool.');
      console.error(`   Expected session at: ${SESSION_PATH}`);
      return;
    }

    console.log('✓ Found existing session\n');

    // Launch browser
    browser = await chromium.launch({
      headless: false,
      slowMo: 500 // Slow down for observation
    });

    const context = await browser.newContext({
      storageState: SESSION_PATH,
      viewport: { width: 1280, height: 720 },
      locale: 'pt-PT',
      timezoneId: 'Europe/Lisbon'
    });

    const page = await context.newPage();

    // Navigate to cart
    console.log('📦 Navigating to cart...');
    await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    await page.waitForTimeout(2000);
    await captureSnapshot(page, 'cart-before-checkout', findings);

    // Check if cart is empty
    let isCartEmpty = await page.locator('.auc-cart--empty').count() > 0;

    if (isCartEmpty) {
      console.log('\n⚠️  Cart is empty. Adding a test product...');
      findings.notes.push('Cart was empty - added test product for research');

      // Navigate to a simple product page and add to cart
      // Using a basic product like milk that's usually available
      console.log('🔍 Searching for a product to add...');
      await page.goto('https://www.auchan.pt/pt/pesquisa?q=leite', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      await page.waitForTimeout(2000);
      await captureSnapshot(page, 'search-results', findings);

      // Try to find and click first product
      const productSelectors = [
        '.auc-product-card a[href*="/produtos/"]',
        '[data-product-id]',
        '.product-tile a',
        'a[href*="/produtos/"]'
      ];

      let productClicked = false;
      for (const selector of productSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`✓ Found product link: ${selector}`);
          await page.locator(selector).first().click();
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
          await page.waitForTimeout(2000);
          productClicked = true;
          break;
        }
      }

      if (productClicked) {
        await captureSnapshot(page, 'product-page', findings);

        // Try to add to cart
        const addToCartSelectors = [
          'button:has-text("Adicionar")',
          'button:has-text("Carrinho")',
          '[data-testid="add-to-cart"]',
          '.add-to-cart',
          'button.auc-btn-primary'
        ];

        for (const selector of addToCartSelectors) {
          const count = await page.locator(selector).count();
          if (count > 0) {
            console.log(`✓ Found add to cart button: ${selector}`);
            await page.locator(selector).first().click();
            await page.waitForTimeout(3000); // Wait for cart update
            findings.notes.push(`Added product to cart using selector: ${selector}`);
            break;
          }
        }

        // Navigate back to cart
        console.log('📦 Returning to cart...');
        await page.goto('https://www.auchan.pt/pt/carrinho-compras', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        await page.waitForTimeout(2000);
        await captureSnapshot(page, 'cart-with-item', findings);

        // Check if cart still empty
        isCartEmpty = await page.locator('.auc-cart--empty').count() > 0;
        if (isCartEmpty) {
          console.log('⚠️  Could not add item to cart. Manual intervention needed.');
        } else {
          console.log('✓ Cart now has items\n');
        }
      } else {
        console.log('⚠️  Could not find product to add. Manual intervention needed.');
      }
    } else {
      console.log('✓ Cart has items\n');
    }

    // Try to find checkout button
    const checkoutButtonSelectors = [
      '.checkout-btn',
      '.auc-js-confirm-cart',
      'button:has-text("Finalizar")',
      'button:has-text("Checkout")',
      'a:has-text("Finalizar")',
      '[href*="checkout"]',
      '[href*="pagamento"]',
      '.checkout-button',
      '#checkout-btn'
    ];

    let checkoutButtonFound = false;
    for (const selector of checkoutButtonSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`✓ Found checkout button: ${selector}`);

        // Document but DON'T click if cart is empty
        if (!isCartEmpty) {
          // Wait for button to be enabled (may take a moment after cart loads)
          console.log('⏳ Waiting for checkout button to be enabled...');
          try {
            await page.locator(selector).first().waitFor({ state: 'visible', timeout: 5000 });

            // Check if button is disabled
            const isDisabled = await page.locator(selector).first().evaluate((el) => {
              return el.classList.contains('disabled') || el.hasAttribute('disabled');
            });

            if (isDisabled) {
              console.log('⚠️  Button is disabled. Checking data-url attribute...');

              // Get the data-url attribute which may contain the checkout URL
              const dataUrl = await page.locator(selector).first().getAttribute('data-url');
              if (dataUrl) {
                console.log(`📍 Found data-url: ${dataUrl}`);
                console.log('🛒 Navigating to checkout URL directly...');
                await page.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.waitForTimeout(2000);
                findings.urls.checkoutEntry = page.url();
                checkoutButtonFound = true;
                break;
              } else {
                console.log('⚠️  Button disabled and no data-url found. Waiting 5 seconds...');
                await page.waitForTimeout(5000);
              }
            }

            // If button is enabled or we waited, try clicking
            console.log('🛒 Clicking checkout button...');
            await page.locator(selector).first().click({ force: true }); // Force click in case of overlay
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
            await page.waitForTimeout(2000);

            findings.urls.checkoutEntry = page.url();
            checkoutButtonFound = true;
            break;
          } catch (err) {
            console.log(`⚠️  Could not click button with selector ${selector}:`, err);
          }
        } else {
          findings.notes.push(`Checkout button found but not clicked (cart empty): ${selector}`);
        }
      }
    }

    if (!checkoutButtonFound && !isCartEmpty) {
      console.log('⚠️  Could not find checkout button automatically.');
      findings.notes.push('Checkout button selector needs verification');
    }

    // If we're on checkout/delivery page, analyze it
    const currentUrl = page.url();
    if (currentUrl.includes('checkout') || currentUrl.includes('pagamento') || currentUrl.includes('entrega')) {
      console.log('\n✓ Reached checkout/delivery flow\n');
      await captureSnapshot(page, 'checkout-delivery-page', findings);

      // Look for delivery slot section
      console.log('🔍 Looking for delivery slot section...');

      // Wait a bit for any lazy-loaded content
      await page.waitForTimeout(3000);

      // Try to find slot-related elements
      await discoverSelectors(page, findings);
      await analyzeSlotUI(page, findings);

      // Capture final state
      await captureSnapshot(page, 'delivery-slots-view', findings);

      // Wait for manual inspection
      console.log('\n⏸️  Browser will remain open for 30 seconds for manual inspection...');
      console.log('   Use this time to explore the UI and note any important details.');
      await page.waitForTimeout(30000);
    } else {
      console.log('\n⚠️  Did not reach checkout flow. Current URL:', currentUrl);
      findings.notes.push('Could not reach delivery slot selection page automatically');

      // Still capture what we can see
      await captureSnapshot(page, 'final-page', findings);
    }

    // Save findings
    const findingsPath = join(RESEARCH_OUTPUT_DIR, 'research-findings.json');
    if (!existsSync(RESEARCH_OUTPUT_DIR)) {
      mkdirSync(RESEARCH_OUTPUT_DIR, { recursive: true });
    }
    writeFileSync(findingsPath, JSON.stringify(findings, null, 2), 'utf-8');
    console.log(`\n✅ Research findings saved: ${findingsPath}`);

  } catch (error) {
    console.error('❌ Research failed:', error);
    throw error;
  } finally {
    if (browser) {
      console.log('\n🔒 Closing browser...');
      await browser.close();
      console.log('✅ Browser closed');
    }
  }
}

main().catch(console.error);
