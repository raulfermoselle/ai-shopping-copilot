/**
 * Extract detailed product tile structure from search results
 */

import { readFile, writeFile } from 'fs/promises';
import { JSDOM } from 'jsdom';

const HTML_PATH = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\search\\search-results-leite_2026-01-11T22-23-46-036Z.html';
const OUTPUT_PATH = 'C:\\Users\\rcoelho\\Desktop\\ai-shopping-copilot\\data\\selectors\\pages\\search\\analysis.json';

async function main() {
  console.log('Loading HTML...');
  const html = await readFile(HTML_PATH, 'utf-8');

  const dom = new JSDOM(html);
  const document = dom.window.document;

  console.log('\n=== EXTRACTING PRODUCT TILE STRUCTURE ===\n');

  // Find first product tile
  const firstTile = document.querySelector('.auc-product-tile');

  if (!firstTile) {
    console.log('No product tile found!');
    return;
  }

  console.log('Found product tile. Analyzing structure...\n');

  const analysis: any = {
    pageType: 'search-results',
    url: 'https://www.auchan.pt/pt/pesquisa?q=leite',
    urlPattern: '^https://(www\\.)?auchan\\.pt/pt/pesquisa',
    searchQuery: document.querySelector('.search-keywords')?.textContent?.trim(),
    resultsCount: document.querySelector('.search-result-count')?.textContent?.trim(),
    productTileSelector: '.auc-product-tile',
    productTileCount: document.querySelectorAll('.auc-product-tile').length,
    sampleProduct: {},
    selectors: {},
  };

  // Extract data from first product tile
  const pid = firstTile.getAttribute('data-pid');
  console.log(`Product ID (data-pid): ${pid}`);

  // Product name
  const nameEl = firstTile.querySelector('.auc-product-tile__name');
  const name = nameEl?.textContent?.trim();
  console.log(`Product name: "${name}"`);

  // Product image
  const imageEl = firstTile.querySelector('.auc-product-tile__image-container__image img');
  const imageSrc = imageEl?.getAttribute('src');
  const imageAlt = imageEl?.getAttribute('alt');
  console.log(`Image: ${imageSrc}`);
  console.log(`Image alt: "${imageAlt}"`);

  // Product price
  const priceContainer = firstTile.querySelector('.auc-product-tile__prices');
  const priceEl = priceContainer?.querySelector('.price');
  const priceText = priceEl?.textContent?.trim().split('\n')[0];
  console.log(`Price: "${priceText}"`);

  // Rating
  const ratingEl = firstTile.querySelector('.auc-product-tile__bazaarvoice--ratings');
  const hasRating = !!ratingEl;
  console.log(`Has rating: ${hasRating}`);

  // Labels (promotions, etc.)
  const labels = firstTile.querySelectorAll('.auc-product-tile__labels img');
  console.log(`Labels/badges: ${labels.length}`);
  labels.forEach((label, i) => {
    const alt = label.getAttribute('alt');
    console.log(`  Label ${i + 1}: "${alt}"`);
  });

  // Quantity selector
  const qtySelector = firstTile.querySelector('.auc-product-tile__quantity-selector');
  console.log(`Has quantity selector: ${!!qtySelector}`);

  // Add to cart button (might be in quantity selector)
  const addButton = qtySelector?.querySelector('button');
  const addButtonText = addButton?.textContent?.trim();
  const addButtonClass = addButton?.className;
  console.log(`Add to cart button: "${addButtonText}"`);
  console.log(`Add to cart button classes: ${addButtonClass}`);

  // Wishlist button
  const wishlistButton = firstTile.querySelector('.auc-product__add-to-wishlist__button');
  console.log(`Has wishlist button: ${!!wishlistButton}`);

  // Check for unavailable/out-of-stock indicators
  const unavailableClass = firstTile.className.includes('unavailable') || firstTile.className.includes('out-of-stock');
  console.log(`Has unavailable class: ${unavailableClass}`);

  // Store sample data
  analysis.sampleProduct = {
    pid,
    name,
    imageSrc,
    imageAlt,
    price: priceText,
    hasRating,
    labelCount: labels.length,
    hasQuantitySelector: !!qtySelector,
    addButtonText,
    hasWishlist: !!wishlistButton,
  };

  // Build selector definitions
  analysis.selectors = {
    resultsContainer: {
      primary: '.product-grid',
      fallbacks: ['.auc-product', '.search-results'],
      score: 75,
      notes: 'Main container for search results',
    },
    resultsCount: {
      primary: '.search-result-count',
      fallbacks: ['.auc-search-results', '.auc-js-search-results-count'],
      score: 70,
      notes: 'Displays total number of results',
    },
    searchKeywords: {
      primary: '.search-keywords',
      fallbacks: [],
      score: 70,
      notes: 'Displays the search query',
    },
    productTile: {
      primary: '.auc-product-tile',
      fallbacks: ['.auc-js-product-tile', '[data-pid]'],
      score: 85,
      notes: 'Individual product card. Has data-pid attribute with product ID',
    },
    productName: {
      primary: '.auc-product-tile__name',
      fallbacks: ['.auc-product-tile .product-name'],
      score: 80,
      notes: 'Product name/title within product tile',
    },
    productImage: {
      primary: '.auc-product-tile__image-container__image img',
      fallbacks: ['.auc-product-tile img[alt]'],
      score: 75,
      notes: 'Product image within tile',
    },
    productImageContainer: {
      primary: '.auc-product-tile__image-container',
      fallbacks: ['.product-image'],
      score: 75,
      notes: 'Container for product image',
    },
    productPrice: {
      primary: '.auc-product-tile__prices .price',
      fallbacks: ['.auc-product-tile .price', '[class*="price"]'],
      score: 80,
      notes: 'Product price element',
    },
    productPriceContainer: {
      primary: '.auc-product-tile__prices',
      fallbacks: ['.price-container'],
      score: 75,
      notes: 'Container for price information',
    },
    productRating: {
      primary: '.auc-product-tile__bazaarvoice--ratings',
      fallbacks: ['.ratings', '[class*="rating"]'],
      score: 70,
      notes: 'Product rating/reviews (may not be present for all products)',
    },
    productLabels: {
      primary: '.auc-product-tile__labels',
      fallbacks: ['.product-labels', '.auc-product-labels'],
      score: 75,
      notes: 'Container for promotional badges/labels',
    },
    productQuantitySelector: {
      primary: '.auc-product-tile__quantity-selector',
      fallbacks: ['.quantity-selector'],
      score: 75,
      notes: 'Quantity selection and add to cart controls',
    },
    addToCartButton: {
      primary: '.auc-product-tile__quantity-selector button',
      fallbacks: ['button[class*="add"]', 'button:has-text("Adicionar")'],
      score: 70,
      notes: 'Add to cart button within product tile',
    },
    wishlistButton: {
      primary: '.auc-product__add-to-wishlist__button',
      fallbacks: ['.auc-js-product-add-to-wishlist', '[class*="wishlist"]'],
      score: 75,
      notes: 'Add to wishlist button',
    },
    productMeasures: {
      primary: '.auc-product-tile__measures',
      fallbacks: ['.product-measures'],
      score: 70,
      notes: 'Product unit/measure information (e.g., "1L", "500g")',
    },
    productNotes: {
      primary: '.auc-product-tile__notes',
      fallbacks: ['.product-notes'],
      score: 65,
      notes: 'Additional product notes or information',
    },
    productPromoBadges: {
      primary: '.auc-product-tile__promo-badges',
      fallbacks: ['.promo-badges', '[class*="promo"]'],
      score: 70,
      notes: 'Promotional badge container',
    },
  };

  // Check for availability indicators by looking at multiple products
  console.log('\n--- Checking for availability indicators ---');
  const allTiles = document.querySelectorAll('.auc-product-tile');
  let foundUnavailable = false;

  for (let i = 0; i < Math.min(20, allTiles.length); i++) {
    const tile = allTiles[i];
    const classes = tile.className;
    const addBtn = tile.querySelector('.auc-product-tile__quantity-selector button');
    const btnDisabled = addBtn?.hasAttribute('disabled');

    if (btnDisabled || classes.includes('unavailable') || classes.includes('out-of-stock')) {
      foundUnavailable = true;
      console.log(`Product ${i + 1}: appears unavailable`);
      console.log(`  Classes: ${classes}`);
      console.log(`  Button disabled: ${btnDisabled}`);
    }
  }

  if (!foundUnavailable) {
    console.log('No unavailable products found in first 20 results');
  }

  // Add availability selectors
  analysis.selectors.unavailableIndicator = {
    primary: '.auc-product-tile--unavailable',
    fallbacks: ['.auc-product-tile[class*="unavailable"]', '.auc-product-tile button[disabled]'],
    score: 65,
    notes: 'Indicates product is out of stock (class modifier or disabled button)',
  };

  // Write analysis to file
  await writeFile(OUTPUT_PATH, JSON.stringify(analysis, null, 2), 'utf-8');
  console.log(`\n=== ANALYSIS SAVED ===`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch(console.error);
