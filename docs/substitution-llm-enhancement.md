# LLM-Enhanced Substitution Agent

## Overview

The Substitution agent now supports optional LLM enhancement for value-based substitute ranking. This follows the StockPruner pattern of "heuristics first, LLM optional."

## New Features

### 1. Value Analytics Module

**Location:** `src/agents/substitution/analytics/`

- **Size parsing** - Extracts weight/volume from product names (g, kg, ml, L, cl)
- **Price per unit calculation** - Normalizes to €/100g or €/L for comparison
- **Store brand detection** - Identifies Auchan, Polegar, MMM!, Rik & Rok, Cultivar, Actuel, Qilive
- **Brand tier classification** - store, budget, standard, premium, unknown
- **Value comparison** - Compares original vs substitute on price, €/unit, brand tier

### 2. LLM Enhancer

**Location:** `src/agents/substitution/llm-enhancer.ts`

Enhances substitute rankings using Claude with value heuristics:
- **Store brand preference** - Prefers Auchan/Polegar when quality is equivalent
- **Price-per-unit optimization** - Compares €/kg or €/L, not just absolute price
- **Price tolerance** - Max 20% increase unless no alternatives

**Recommendation levels:**
- `strongly_recommend` - Store brand or better value, under original price
- `recommend` - Good match, within 10% price increase
- `acceptable` - Adequate match, up to 20% price increase
- `poor` - Weak match, >20% price increase
- `reject` - Safety concern, dietary mismatch, or unacceptable price

### 3. Navigate to Replacements Tool

**Location:** `src/agents/substitution/tools/navigate-to-replacements.ts`

Navigates to Auchan's curated "Substituir" link for unavailable items. This is the preferred source for substitutes as Auchan provides relevant alternatives in the same category.

### 4. Smart Query Generation Tool

**Location:** `src/agents/substitution/tools/generate-search-query.ts`

LLM-powered Portuguese search query generation for Auchan.pt:
- Extracts core product type from complex names
- Generates alternative Portuguese terms
- Falls back to simple extraction if LLM unavailable

### 5. New LLM Tools

**Location:** `src/llm/tools.ts`

- `make_substitution_decision` - Evaluate substitutes with value optimization
- `generate_search_queries` - Generate Portuguese search queries

## Usage

### Enable LLM Enhancement

```typescript
import { Substitution } from './agents/substitution/index.js';

const substitution = new Substitution(config);

// Enable LLM enhancement (optional)
substitution.enableLLMEnhancement({
  apiKey: process.env.ANTHROPIC_API_KEY,
  priceTolerance: 0.20, // 20% max price increase
});

// Check if LLM is available
if (substitution.isLLMEnhancementAvailable()) {
  console.log('LLM enhancement active');
}

// Run substitution (will use LLM if enabled)
const result = await substitution.run(context, input);
```

### Value Analytics

```typescript
import {
  buildValueAnalytics,
  compareValues,
  isStoreBrand,
  formatPricePerUnit,
} from './agents/substitution/analytics/index.js';

const analytics = buildValueAnalytics(candidate);
console.log(analytics.normalizedPricePerUnit); // e.g., 4.99 (€/100g)
console.log(analytics.isStoreBrand); // true if Auchan/Polegar/etc
console.log(analytics.brandTier); // 'store', 'budget', 'standard', 'premium'
```

### Query Generation

```typescript
import { generateSearchQueries } from './agents/substitution/tools/index.js';

const result = await generateSearchQueries(
  { productName: 'Leite Mimosa UHT Meio Gordo 1L' },
  llmClient // optional - falls back to simple extraction
);
// result.queries = ['leite meio gordo', 'leite uht', ...]
```

## Two-Phase Substitute Finding Strategy

The `findSubstitutes` method now uses a two-phase approach:

1. **Phase 1: Auchan's "Substituir" link** (preferred)
   - Click the per-item replacement link on cart page
   - Extract products from curated category page
   - Best source for relevant substitutes

2. **Phase 2: Search query** (fallback)
   - Simple query extraction (remove size/brand patterns)
   - If no results + LLM available: smart query generation
   - Try multiple LLM-generated queries until results found

## Configuration

```typescript
const DEFAULT_CONFIG = {
  enabled: true,
  uncertaintyThreshold: 0.65,  // Invoke LLM if top score below this
  closeScoreGap: 0.10,         // Invoke LLM if top 2 scores within this gap
  sensitiveCategories: ['baby', 'pet', 'dietary'],
  fallbackToHeuristics: true,  // Use heuristics if LLM fails
  maxCandidatesPerCall: 5,
  timeoutMs: 30000,
  priceTolerance: 0.20,        // 20% max price increase
};
```

## Files Created/Modified

### New Files
- `src/agents/substitution/analytics/types.ts`
- `src/agents/substitution/analytics/value-calculator.ts`
- `src/agents/substitution/analytics/prompt-builder.ts`
- `src/agents/substitution/analytics/index.ts`
- `src/agents/substitution/llm-enhancer.ts`
- `src/agents/substitution/tools/navigate-to-replacements.ts`
- `src/agents/substitution/tools/generate-search-query.ts`

### Modified Files
- `src/llm/tools.ts` - Added substitution tools
- `src/llm/index.ts` - Exported new tools
- `src/agents/substitution/substitution.ts` - Integrated LLM enhancement
- `src/agents/substitution/tools/index.ts` - Exported new tools
- `src/agents/substitution/index.ts` - Exported new modules
- `data/selectors/pages/cart/v1.json` - Added replacementLink selector

## TODO

- Extract replacement URL from `checkAvailabilityTool` when scanning cart
- Add `replacementUrl` field to `AvailabilityResult` type
- Full integration of replacement link strategy (currently has placeholder)
