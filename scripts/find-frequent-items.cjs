const data = require('../data/memory/household-demo/purchase-history.json');
const records = data.records;

// Orders that still have differences after removing eco bags
const diffOrders = [
  '001634156', '001656257', '001681868', '001718976', '002019313',
  '002037449', '002084132', '002107272', '002225714', '002249391',
  '002311542', '002389794', '002429197', '002557365', '002611387',
  '002634083', '002648684', '002689237', '002789259', '002820036',
  '002853812', '002915480'
];

// Count how often each product appears across these orders
const productCounts = {};
for (const r of records) {
  const orderNum = (r.orderId || '').slice(0, 9);
  if (!diffOrders.includes(orderNum)) continue;
  if (r.productName.toLowerCase().includes('saco eco circular')) continue;

  const name = r.productName.toLowerCase();
  productCounts[name] = (productCounts[name] || 0) + 1;
}

// Find products that appear in many of these orders
const sorted = Object.entries(productCounts)
  .sort((a, b) => b[1] - a[1])
  .filter(([_, count]) => count > 5);

console.log('Products appearing in 5+ of the 22 problematic orders:');
sorted.forEach(([name, count]) => {
  console.log(`  ${count}x: ${name.slice(0, 60)}${name.length > 60 ? '...' : ''}`);
});
