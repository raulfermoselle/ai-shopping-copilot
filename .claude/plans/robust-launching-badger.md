# Plan: Update Demo Script for LLM-Enhanced Substitution

## Overview

Update `scripts/demo-substitution-flow.ts` to demonstrate the new LLM-enhanced substitution features:
- Value-based ranking (store brand preference, €/unit optimization)
- LLM-powered intelligent query generation
- Enhanced reasoning and recommendations

## Current State

The demo currently:
1. Logs in to Auchan.pt
2. Loads items via reorder from past orders
3. Scans cart for unavailable items
4. Searches for substitutes using `searchProductsTool` directly
5. Ranks with basic heuristics (brand, size, price, category)
6. Displays simple recommendations

**Limitations:**
- Uses inline ranking functions instead of the Substitution agent
- No value analytics (no €/unit, no store brand detection)
- No LLM enhancement
- Basic query building (just removes size patterns)

## Proposed Changes

### 1. Use the Substitution Agent Class

Replace direct tool calls with the `Substitution` class:
```typescript
import { Substitution } from '../dist/agents/substitution/index.js';

const substitution = new Substitution(config);
```

### 2. Enable LLM Enhancement (Optional)

If `ANTHROPIC_API_KEY` is available, enable LLM enhancement:
```typescript
if (process.env.ANTHROPIC_API_KEY) {
  substitution.enableLLMEnhancement({
    apiKey: process.env.ANTHROPIC_API_KEY,
    priceTolerance: 0.20,
  });
  console.log('LLM enhancement enabled');
}
```

### 3. Add Value Analytics Display

Show the new value metrics in recommendations:
- Store brand indicator (Auchan, Polegar, etc.)
- Price per unit (€/kg, €/L)
- Price change percentage
- Value rating (excellent, good, acceptable, poor)

### 4. Add CLI Flag for LLM Mode

Add `--llm` flag to explicitly enable LLM features:
```bash
npx tsx scripts/demo-substitution-flow.ts --llm
```

### 5. Enhanced Output Format

Update the recommendation display:
```
   1. Iogurte Grego Auchan 500g
      Price: 2,49 € (+0,30 €, +13.6%)
      Score: 85% | Value: Good
      €/unit: 4,98 €/kg (vs 5,23 €/kg original)
      🏪 STORE BRAND - Potential savings
      Reason: Good match. Similar size. Store brand option.
```

---

## Files to Modify

### `scripts/demo-substitution-flow.ts`

**Changes:**

1. **Add imports** (~line 28-37):
```typescript
import { Substitution, type RankedSubstitute } from '../dist/agents/substitution/index.js';
import {
  buildValueAnalytics,
  compareValues,
  isStoreBrand,
  formatPricePerUnit,
} from '../dist/agents/substitution/analytics/index.js';
```

2. **Remove inline ranking functions** (lines 92-259):
   - Delete `buildSearchQuery`, `calculateBrandSimilarity`, `calculateSizeSimilarity`, `calculatePriceSimilarity`, `calculateCategoryMatch`, `rankSubstitutes`, and the inline `RankedSubstitute` interface
   - Use the agent's built-in ranking instead

3. **Add CLI argument** (~line 62):
```typescript
const USE_LLM = args.includes('--llm');
```

4. **Create Substitution agent** (after login, ~line 370):
```typescript
const substitution = new Substitution({
  maxSubstitutesPerItem: 5,
  searchTimeout: 15000,
});

if (USE_LLM && process.env.ANTHROPIC_API_KEY) {
  substitution.enableLLMEnhancement({
    apiKey: process.env.ANTHROPIC_API_KEY,
    priceTolerance: 0.20,
  });
  console.log(`${colors.cyan}   LLM enhancement enabled${colors.reset}`);
}
```

5. **Replace manual search loop** (lines 493-549):
   - Instead of calling `searchProductsTool` directly and using inline `rankSubstitutes`
   - Build input for `substitution.run()` and call it once for all unavailable items

```typescript
// Build input for substitution agent
const substitutionInput = {
  items: unavailableItems.map(item => ({
    productId: item.productId,
    name: item.name,
    productUrl: item.productUrl,
    brand: extractBrand(item.name),
    size: extractSize(item.name),
    unitPrice: item.unitPrice,
    quantity: item.quantity,
  })),
};

// Run substitution agent
const result = await substitution.run(
  { page, logger } as AgentContext,
  substitutionInput
);
```

6. **Update recommendation display** (lines 559-586):
   - Show value analytics (€/unit, store brand indicator)
   - Show LLM reasoning if available
   - Color-code based on value rating

---

## Implementation Details

### Helper Functions to Add

```typescript
/**
 * Extract brand from product name (first word typically)
 */
function extractBrand(name: string): string | undefined {
  const parts = name.split(' ');
  return parts.length > 0 ? parts[0] : undefined;
}

/**
 * Extract size from product name
 */
function extractSize(name: string): string | undefined {
  const match = name.match(/(\d+(?:,\d+)?\s*(?:g|kg|ml|l|cl|un))/i);
  return match?.[1];
}

/**
 * Format price change with color
 */
function formatPriceChange(delta: number, percent: number): string {
  const sign = delta >= 0 ? '+' : '';
  const color = delta <= 0 ? colors.green : (percent <= 10 ? colors.yellow : colors.red);
  return `${color}${sign}${formatPrice(delta)} (${sign}${percent.toFixed(1)}%)${colors.reset}`;
}
```

### Enhanced Display Format

```typescript
for (let i = 0; i < rec.substitutes.length && i < 3; i++) {
  const sub = rec.substitutes[i];
  if (!sub) continue;

  const { candidate, score, reason } = sub;
  const valueAnalytics = buildValueAnalytics(candidate);

  console.log(`\n   ${i + 1}. ${candidate.name}`);

  // Price with delta
  const priceDelta = candidate.unitPrice - rec.originalItem.unitPrice;
  const pricePercent = (priceDelta / rec.originalItem.unitPrice) * 100;
  console.log(`      Price: ${formatPrice(candidate.unitPrice)} ${formatPriceChange(priceDelta, pricePercent)}`);

  // Score
  console.log(`      Score: ${colors.cyan}${(score.overall * 100).toFixed(0)}%${colors.reset}`);

  // Price per unit if available
  if (valueAnalytics.normalizedPricePerUnit) {
    console.log(`      €/unit: ${formatPricePerUnit(valueAnalytics.normalizedPricePerUnit, valueAnalytics.pricePerUnitLabel)}`);
  }

  // Store brand indicator
  if (valueAnalytics.isStoreBrand) {
    console.log(`      ${colors.green}🏪 STORE BRAND - Potential savings${colors.reset}`);
  }

  // Reason
  console.log(`      ${colors.dim}${reason}${colors.reset}`);
}
```

---

## Banner Update

Update banner to mention LLM capability:
```
║   Detects unavailable items in your cart and finds suitable    ║
║   substitutes with VALUE-BASED ranking:                        ║
║   • Store brand preference (Auchan/Polegar)                    ║
║   • Price per unit optimization (€/kg, €/L)                    ║
║   • Optional LLM enhancement (--llm flag)                      ║
```

---

## Verification

### Test Without LLM
```bash
npm run build
npx tsx scripts/demo-substitution-flow.ts --skip-reorder
```
Expected: Demo runs with heuristic-based ranking, shows value analytics

### Test With LLM
```bash
npm run build
ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/demo-substitution-flow.ts --skip-reorder --llm
```
Expected: Demo shows LLM-enhanced reasoning and smart query generation

### Verify Output Includes:
- [ ] Store brand indicators for Auchan/Polegar products
- [ ] Price per unit (€/kg or €/L) when parseable
- [ ] Price change percentages
- [ ] LLM reasoning (when --llm enabled)
- [ ] Fallback message if LLM unavailable

---

## Summary

| Change | Location | Purpose |
|--------|----------|---------|
| Import Substitution class | Lines 28-37 | Use agent instead of inline code |
| Add --llm flag | Line 62 | Control LLM enhancement |
| Create agent instance | After login | Initialize with config |
| Enable LLM if available | After agent creation | Optional enhancement |
| Remove inline functions | Lines 92-259 | Use agent's built-in ranking |
| Replace search loop | Lines 493-549 | Use agent.run() |
| Enhanced display | Lines 559-586 | Show value analytics |
| Update banner | Lines 68-80 | Mention new features |
