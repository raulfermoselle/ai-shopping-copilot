const fs = require('fs');
const html = fs.readFileSync('prompts/past-orders-list.txt', 'utf8');
const data = require('../data/memory/household-demo/purchase-history.json');

// Extract order numbers and counts from HTML
const orderMatches = [...html.matchAll(/Encomenda<\/span>\s*<span>(\d+)<\/span>.*?(\d+)\s*Produtos/gs)];
const htmlOrders = {};
orderMatches.forEach(m => {
  htmlOrders[m[1]] = parseInt(m[2]);
});

// Count per orderId in JSON, EXCLUDING eco delivery bags
const jsonOrders = {};
for (const r of data.records) {
  // Skip eco delivery bags - they're not counted in Produtos
  if (r.productName && r.productName.toLowerCase().includes('saco eco circular')) continue;

  const orderId = r.orderId || '';
  const orderNum = orderId.slice(0, 9);
  jsonOrders[orderNum] = (jsonOrders[orderNum] || 0) + 1;
}

console.log('Comparison EXCLUDING eco bags (Order# | HTML | JSON | Diff):');
let totalDiff = 0;
let ordersWithDiff = 0;
const orderNums = Object.keys(htmlOrders).sort();
for (const orderNum of orderNums) {
  const htmlCount = htmlOrders[orderNum];
  const jsonCount = jsonOrders[orderNum] || 0;
  const diff = jsonCount - htmlCount;
  totalDiff += diff;
  if (diff !== 0) {
    ordersWithDiff++;
    console.log(`${orderNum} | ${htmlCount} | ${jsonCount} | ${diff > 0 ? '+' : ''}${diff}`);
  }
}
console.log('');
console.log(`Orders with remaining differences: ${ordersWithDiff}`);
console.log(`Remaining total difference: ${totalDiff > 0 ? '+' : ''}${totalDiff}`);
