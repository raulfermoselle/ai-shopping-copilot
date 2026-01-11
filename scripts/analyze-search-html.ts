/**
 * Analyze captured search results HTML to find selector patterns
 */

import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';

const HTML_PATH = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\search\\search-results-leite_2026-01-11T22-23-46-036Z.html';

async function main() {
  console.log('Loading HTML...');
  const html = await readFile(HTML_PATH, 'utf-8');

  const dom = new JSDOM(html);
  const document = dom.window.document;

  console.log('\n=== SEARCH RESULTS PAGE ANALYSIS ===\n');

  // Find results count
  const resultsCount = document.querySelector('.search-result-count');
  console.log('Results count element:', resultsCount?.textContent?.trim());

  // Find search keywords
  const keywords = document.querySelector('.search-keywords');
  console.log('Search keywords:', keywords?.textContent?.trim());

  // Find main product container
  const productContainer = document.querySelector('.auc-product');
  console.log('\nMain product container (.auc-product):', !!productContainer);

  // Look for product grid/list
  const possibleGrids = [
    '.auc-product-grid',
    '.product-grid',
    '.search-result-items',
    '[class*="grid"]',
  ];

  console.log('\n--- Looking for product grid ---');
  for (const selector of possibleGrids) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`${selector}: ${elements.length} elements`);
    }
  }

  // Find all divs with class starting with 'auc-'
  console.log('\n--- All Auchan-specific classes (auc-*) ---');
  const aucElements = document.querySelectorAll('[class*="auc-"]');
  const aucClasses = new Set<string>();
  aucElements.forEach(el => {
    const classes = el.className.toString().split(' ');
    classes.forEach(cls => {
      if (cls.startsWith('auc-')) {
        aucClasses.add(cls);
      }
    });
  });

  const relevantAucClasses = Array.from(aucClasses)
    .filter(cls => cls.includes('product') || cls.includes('search') || cls.includes('result') || cls.includes('item') || cls.includes('tile'))
    .sort();

  console.log('Relevant auc-* classes:');
  relevantAucClasses.forEach(cls => console.log(`  .${cls}`));

  // Look for repeated div structures (likely product cards)
  console.log('\n--- Looking for repeated elements (product cards) ---');

  // Check for data attributes
  const dataAttributes = ['data-pid', 'data-product-id', 'data-itemid', 'data-sku'];
  for (const attr of dataAttributes) {
    const elements = document.querySelectorAll(`[${attr}]`);
    if (elements.length > 0) {
      console.log(`[${attr}]: ${elements.length} elements`);
      if (elements.length > 0) {
        console.log(`  First element tag: ${elements[0].tagName}`);
        console.log(`  First element classes: ${elements[0].className}`);
      }
    }
  }

  // Look for links to product pages
  console.log('\n--- Product links ---');
  const productLinks = document.querySelectorAll('a[href*="/produtos/"], a[href*="/product/"]');
  console.log(`Product links found: ${productLinks.length}`);
  if (productLinks.length > 0) {
    console.log(`  First link href: ${productLinks[0].getAttribute('href')}`);
    console.log(`  First link classes: ${productLinks[0].className}`);
    console.log(`  Parent element tag: ${productLinks[0].parentElement?.tagName}`);
    console.log(`  Parent element classes: ${productLinks[0].parentElement?.className}`);
  }

  // Look for images (product images)
  console.log('\n--- Product images ---');
  const images = document.querySelectorAll('img[alt], img[src*="product"], img[src*="image"]');
  console.log(`Images found: ${images.length}`);
  if (images.length > 5) {
    console.log(`  Sample image parent classes:`);
    for (let i = 0; i < 3; i++) {
      const img = images[i];
      console.log(`    Image ${i + 1}:`);
      console.log(`      Parent: ${img.parentElement?.tagName}.${img.parentElement?.className}`);
      console.log(`      Grandparent: ${img.parentElement?.parentElement?.tagName}.${img.parentElement?.parentElement?.className}`);
    }
  }

  // Look for price elements
  console.log('\n--- Price elements ---');
  const pricePatterns = [
    '.price',
    '[class*="price"]',
    '[class*="Price"]',
    'span:has-text("€")',
  ];

  for (const pattern of pricePatterns.slice(0, 2)) {
    const elements = document.querySelectorAll(pattern);
    if (elements.length > 0) {
      console.log(`${pattern}: ${elements.length} elements`);
      if (elements.length > 0) {
        const firstPrice = elements[0];
        console.log(`  First price text: "${firstPrice.textContent?.trim()}"`);
        console.log(`  Classes: ${firstPrice.className}`);
      }
    }
  }

  // Look for buttons (add to cart, etc.)
  console.log('\n--- Buttons ---');
  const buttons = document.querySelectorAll('button');
  console.log(`Total buttons: ${buttons.length}`);

  const buttonTexts = new Set<string>();
  buttons.forEach(btn => {
    const text = btn.textContent?.trim();
    if (text && text.length < 50) {
      buttonTexts.add(text);
    }
  });

  console.log('Unique button texts (sample):');
  Array.from(buttonTexts).slice(0, 10).forEach(text => {
    console.log(`  "${text}"`);
  });

  // Look for add to cart buttons specifically
  const addToCartButtons = document.querySelectorAll('button[class*="add"], button[class*="cart"], button[data-action*="add"]');
  console.log(`\nAdd to cart buttons: ${addToCartButtons.length}`);
  if (addToCartButtons.length > 0) {
    console.log(`  First button classes: ${addToCartButtons[0].className}`);
    console.log(`  First button text: "${addToCartButtons[0].textContent?.trim()}"`);
  }

  console.log('\n=== ANALYSIS COMPLETE ===\n');
}

main().catch(console.error);
