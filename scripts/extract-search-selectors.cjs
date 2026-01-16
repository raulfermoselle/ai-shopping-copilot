/**
 * Extract key selectors from search page HTML snapshot
 */

const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(
  __dirname,
  '..',
  'data',
  'selectors',
  'pages',
  'search',
  'snapshots',
  'search-leite-initial_2026-01-14T06-19-44.html'
);

const html = fs.readFileSync(snapshotPath, 'utf-8');

// Extract key patterns
const patterns = {
  searchInput: html.match(/<input[^>]*name="q"[^>]*>/i),
  productTile: html.match(/<div[^>]*class="[^"]*product-tile[^"]*"[^>]*>/i),
  productName: html.match(/<[^>]*class="[^"]*auc-product-tile__name[^"]*"[^>]*>/i),
  productPrice: html.match(/<[^>]*class="[^"]*auc-product-tile__prices[^"]*"[^>]*>/i),
  productPID: html.match(/data-pid="[^"]*"/i),
  addToCartButton: html.match(/<button[^>]*class="[^"]*auc-button__rounded--primary[^"]*"[^>]*>/i),
  quantitySelector: html.match(/<[^>]*class="[^"]*auc-product-tile__quantity-selector[^"]*"[^>]*>/i),
};

console.log('=== SEARCH PAGE SELECTORS ===\n');

Object.entries(patterns).forEach(([key, match]) => {
  console.log(`${key}:`);
  console.log(match ? match[0] : 'NOT FOUND');
  console.log('');
});

// Count products
const productMatches = html.match(/data-pid="[^"]*"/g);
const uniquePIDs = [...new Set(productMatches || [])];
console.log(`\nTotal products found: ${uniquePIDs.length}`);
console.log('Sample PIDs:', uniquePIDs.slice(0, 5));

// Look for the search results container
const searchResultsPattern = html.match(/<div[^>]*class="[^"]*product-grid[^"]*"[^>]*>/i);
console.log('\nSearch results container:');
console.log(searchResultsPattern ? searchResultsPattern[0] : 'NOT FOUND');

// Look for result count
const resultCountPattern = html.match(/(\d+)\s*resultados?\s*para/i);
console.log('\nResult count pattern:');
console.log(resultCountPattern ? resultCountPattern[0] : 'NOT FOUND');
