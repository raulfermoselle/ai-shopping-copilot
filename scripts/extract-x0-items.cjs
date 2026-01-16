const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve('data/artifacts/order-html-sample.html'), 'utf8');

// Find all product cards and their quantities
const cardRegex = /<div[^>]*auc-orders__product-card[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
const cards = html.match(cardRegex) || [];

console.log(`Total product cards found: ${cards.length}\n`);

// Extract quantity and name from each card
let x0Count = 0;
const x0Items = [];

// Simple approach: find all x0 quantities and their context
const lines = html.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line === 'x0') {
    // Look back for the product name
    for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
      const prevLine = lines[j];
      const nameMatch = prevLine.match(/aria-label="([^"]+)"/);
      if (nameMatch) {
        x0Count++;
        x0Items.push(nameMatch[1].trim());
        break;
      }
    }
  }
}

console.log(`Items with x0 quantity (unavailable/refunded): ${x0Count}`);
x0Items.forEach((item, i) => {
  console.log(`  ${i + 1}. ${item}`);
});

// Also count non-x0 items
let normalCount = 0;
const quantityMatches = html.match(/auc-orders__product-quantity[^>]*>\s*x(\d+)/gi) || [];
quantityMatches.forEach(m => {
  const qty = parseInt(m.match(/x(\d+)/i)[1]);
  if (qty > 0) normalCount++;
});

console.log(`\nItems with x1+ quantity: ${normalCount}`);
console.log(`Total items displayed: ${normalCount + x0Count}`);
console.log(`Header says: 35 Produtos`);
console.log(`Eco bag is: 1 of the x1+ items`);
console.log(`Actual products: ${normalCount - 1} (excluding eco bag)`);
