# Substitution Module

**Status:** Phase 2 - Sprint SU-R-001 Complete (Research)
**Owner:** Substitution Agent
**Dependencies:** CartBuilder (cart state), Playwright RPA (search/availability)

---

## Purpose

The Substitution module finds suitable replacements for unavailable items in the shopping cart. When a previously ordered product is out of stock, this agent searches Auchan.pt for similar alternatives based on product attributes, category, and user preferences.

---

## Core Responsibilities

1. **Availability Detection** - Identify unavailable items in cart
2. **Substitute Search** - Find similar products by category, brand, attributes
3. **Ranking & Scoring** - Score substitutes by similarity, price, availability
4. **User Preference Learning** - Learn from past substitution acceptances/rejections

---

## Research Findings (Sprint SU-R-001)

### Product Search Functionality

**URL Pattern:**
```
https://www.auchan.pt/pt/pesquisa?q={query}
```

**Search Capabilities:**
- Full-text search across product catalog
- Returns grid of product tiles with images, prices, ratings
- Pagination: 72 products per page (default)
- Sort options: relevance, price (low-high, high-low), name (A-Z, Z-A)
- Filters: category, price range, brand, product attributes

**Key Search Results Selectors:**
- Product tile: `.auc-product-tile` with `[data-pid]` attribute
- Product name: `.auc-product-tile__name`
- Product price: `.auc-product-tile__prices .price`
- Product image: `.auc-product-tile__image-container__image img`
- Add to cart: `.auc-js-add-to-cart` button
- Results count: `.search-result-count`

**Search Results Page Structure:**
```
/pt/pesquisa?q={query}
├── .search-result-count (e.g., "1,059 resultados para:")
├── .search-keywords (e.g., "leite")
├── .product-grid
    └── .auc-product-tile (×72 per page)
        ├── [data-pid="3010403"]
        ├── .auc-product-tile__name
        ├── .auc-product-tile__image-container
        ├── .auc-product-tile__prices
        │   └── .price (e.g., "0,86 €")
        ├── .auc-product-tile__rating (BazaarVoice)
        ├── .auc-product-tile__labels (badges: "Produto Nacional")
        └── .auc-product-tile__quantity-selector
            └── button.auc-js-add-to-cart
```

### Availability Indicators

**On Search Results Page:**
- **Available products:** Add to cart button enabled (`button.auc-js-add-to-cart:not([disabled])`)
- **Out of stock:** Button disabled or class modifier `.auc-product-tile--unavailable` (NOT VERIFIED - no unavailable products found in test searches)
- **Low stock warnings:** NOT FOUND in search results

**On Product Detail Page:**
- **Available:** Add to cart button enabled (`button.auc-js-add-to-cart:not([disabled])`)
- **Out of stock:** Button disabled + text indicators:
  - Portuguese: "esgotado" (out of stock) or "indisponível" (unavailable)
  - Element: `.availability` or text content check
- **Low stock:** "Últimas unidades" or "Stock limitado" (NOT VERIFIED)

**Primary Availability Check Logic:**
```typescript
// Most reliable: check button disabled state
const isAvailable = !(await addToCartButton.isDisabled());

// Fallback: check for out-of-stock text
const hasOutOfStockText = await page.locator('text=/esgotado|indisponível/i').count() > 0;
```

### Substitution Affordances

**Built-in Recommendations:**

Auchan.pt provides a native recommendation system on product detail pages:

**Section:** "A Auchan sugere isto..." (Auchan suggests this...)
- **Location:** Bottom of product detail page
- **Format:** Horizontal carousel of product tiles
- **Structure:** Same as search results (`.auc-product-tile`)
- **Count:** 6-8 similar products
- **Selector:** `[class*='recommend'] .auc-product-tile`

**Product Detail Page Structure:**
```
/pt/{category-path}/{product-slug}/{pid}.html
├── h1.product-name
├── .price
├── button.auc-js-add-to-cart (disabled if unavailable)
├── .availability
├── .product-description
└── [class*='recommend'] (recommendations section)
    └── .auc-product-tile (×6-8)
        └── [same structure as search results]
```

**Recommendation Quality:**
- Products appear to be category-based (e.g., other milk products when viewing milk)
- Similar price points
- Same or similar brands
- Comparable package sizes

**No Other Built-in Substitution Features Found:**
- No "frequently bought together"
- No "customers also bought"
- No explicit "alternative products" section
- Categories are structured but not exposed in product data

### Product Attributes for Matching

**Extractable from Product Name:**
- Brand (e.g., "Auchan", "Mimosa", "Gallo")
- Product type (e.g., "leite", "azeite", "arroz")
- Attributes (e.g., "meio gordo", "virgem extra", "magro")
- Size/quantity (e.g., "1L", "3L", "500g")

**Extractable from Product Detail:**
- Category (from breadcrumbs or URL path)
- Price
- Rating (if available)
- Labels/badges (e.g., "Produto Nacional", "Bio", "Promoção")

**Example Product Name Parsing:**
```
"leite auchan uht meio gordo slim 1l"
→ type: "leite"
→ brand: "auchan"
→ attributes: ["uht", "meio gordo", "slim"]
→ size: "1l"

"azeite virgem extra auchan 3 l"
→ type: "azeite"
→ brand: "auchan"
→ attributes: ["virgem extra"]
→ size: "3 l"
```

### Category Structure

**URL Pattern Reveals Hierarchy:**
```
/pt/alimentacao/produtos-lacteos/leites/leite-uht/leite-auchan.../3010403.html
    ↓           ↓                ↓       ↓
    dept        category        subcat  product-type
```

**Navigation Strategy for Substitutes:**
1. **Same subcategory:** Navigate to category page, get all products
2. **Same brand + attributes:** Search for "{brand} {type} {attributes}"
3. **Broader search:** Search for just "{type} {key_attribute}"

---

## Substitution Strategy

### Phase 1: Direct Search
1. Extract product attributes from unavailable item name
2. Search Auchan.pt: `{brand} {type} {attributes}`
3. Filter by availability (button not disabled)
4. Rank by similarity score

### Phase 2: Category Exploration
1. Parse category from product URL or breadcrumbs
2. Navigate to category page
3. Apply filters (brand, price range, attributes)
4. Collect available alternatives

### Phase 3: Auchan Recommendations
1. Navigate to unavailable product detail page
2. Extract products from recommendations section (`[class*='recommend'] .auc-product-tile`)
3. Filter by availability
4. Use as high-quality substitutes (Auchan's algorithm already did the matching)

### Ranking Criteria

**Similarity Score (0-100):**
- Brand match: +30 points
- Exact attribute match: +25 points
- Size/quantity match: +20 points
- Price within 20%: +15 points
- Same category: +10 points

**Filters:**
- Must be available (button not disabled)
- Price < 2x original (unless user-configured otherwise)
- Same product type (e.g., don't substitute milk with juice)

**Final Ranking:**
```
score = similarity_score + (rating * 2) - (price_diff_pct * 0.5)
```

---

## Tool Requirements

### Search Tools
- `search_products(query, filters)` → returns list of products
- `get_product_detail(pid_or_url)` → returns product info + recommendations
- `check_availability(pid)` → returns boolean
- `check_availability_batch(pids[])` → returns {available: [], unavailable: []}

### Substitution Tools
- `find_substitutes(unavailable_item, options)` → returns ranked list
- `get_category_products(category_url)` → returns products in category
- `score_substitute(original, candidate)` → returns similarity score

### Selector Usage
```typescript
import { SelectorResolver } from '../selectors/resolver.js';

const resolver = new SelectorResolver();

// Search results
const results = await resolver.tryResolve(page, 'search', 'productTile');
const tiles = await page.locator(results.selector).all();

for (const tile of tiles) {
  const pid = await tile.getAttribute('data-pid');
  const name = await tile.locator('.auc-product-tile__name').textContent();
  const price = await tile.locator('.auc-product-tile__prices .price').textContent();
  const addButton = tile.locator('button.auc-js-add-to-cart');
  const available = !(await addButton.isDisabled());
}

// Product detail recommendations
const recSection = await resolver.tryResolve(page, 'product-detail', 'recommendationsSection');
if (recSection) {
  const recProducts = await page.locator('[class*="recommend"] .auc-product-tile').all();
  // Extract substitute candidates
}
```

---

## Integration with CartBuilder

**Flow:**
1. CartBuilder identifies unavailable items in cart
2. Substitution agent receives list of unavailable items
3. For each unavailable item:
   - Search for substitutes (3 strategies)
   - Score and rank candidates
   - Return top 3-5 options
4. CartBuilder presents options to user (or applies auto-substitution rules)
5. User approves/rejects substitutions
6. CartBuilder updates cart with approved substitutes

**Data Exchange:**
```typescript
interface UnavailableItem {
  pid: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  url?: string;
}

interface SubstituteCandidate {
  pid: string;
  name: string;
  price: number;
  imageUrl: string;
  productUrl: string;
  available: boolean;
  similarityScore: number;
  priceDiffPct: number;
  matchReason: string; // "same brand", "same category", "Auchan recommendation"
}

interface SubstitutionResult {
  original: UnavailableItem;
  substitutes: SubstituteCandidate[];
  strategy: 'search' | 'category' | 'recommendations';
}
```

---

## User Preferences & Learning

**Preference Storage (Future):**
- Track accepted/rejected substitutions
- Learn brand preferences (e.g., always prefer Auchan brand)
- Learn attribute preferences (e.g., always substitute "meio gordo" with "magro")
- Price sensitivity (max % increase user will accept)

**Auto-Substitution Rules (Future):**
- If substitute score > 90 and price diff < 10%, auto-apply
- If only one high-quality substitute (score > 80), suggest as default
- If no good substitutes (all scores < 50), flag for user decision

---

## Error Handling & Edge Cases

**No Substitutes Found:**
- Log item for manual review
- Suggest broader search (e.g., remove brand constraint)
- Offer to notify user when back in stock

**Multiple Unavailable Items:**
- Process in parallel (up to 5 concurrent searches)
- Implement circuit breaker (stop after 3 consecutive search failures)

**Search Returns Too Many Results:**
- Limit to first 72 results (1 page)
- Apply stricter filters (exact brand + attributes)
- Use pagination if needed (future enhancement)

**Product Changed Format:**
- Selector fallback chains handle minor UI changes
- If all selectors fail, capture diagnostic screenshot
- Log failure for selector registry update

---

## Testing Approach

**Test Cases:**
1. **Available product search** - "leite mimosa" → should return multiple results
2. **Specific product search** - "azeite gallo 3l" → should return exact match + similar
3. **Unavailable product** - (need to find an actually out-of-stock item)
4. **Recommendations extraction** - Navigate to product detail, extract "sugere isto" section
5. **Similarity scoring** - Test ranking algorithm with known product pairs

**Test Data:**
```typescript
const testScenarios = [
  {
    unavailable: { name: "leite mimosa magro 1l", price: 1.20 },
    expectedSubstitutes: ["leite auchan magro 1l", "leite agros magro 1l"],
  },
  {
    unavailable: { name: "azeite gallo 3l", price: 12.50 },
    expectedSubstitutes: ["azeite auchan 3l", "azeite serra da estrela 3l"],
  },
];
```

---

## Implementation Roadmap

### Sprint SU-I-001: Core Search & Availability
- Implement `search_products(query)` tool
- Implement availability checking (button disabled state)
- Implement product data extraction from search results
- Unit tests for search and extraction

### Sprint SU-I-002: Substitution Logic
- Implement substitute ranking algorithm
- Implement `find_substitutes(item)` tool
- Parse product names for attributes
- Integration tests with real search data

### Sprint SU-I-003: Recommendations Integration
- Extract Auchan recommendations from product detail page
- Implement recommendation-based substitution strategy
- Compare recommendation quality vs. search-based

### Sprint SU-I-004: Preference Learning (Future)
- Track substitution acceptance/rejection
- Implement preference-based ranking adjustments
- Auto-substitution rules

---

## Selector Registry Reference

**Pages:**
- `search` - Product search results page (`/pt/pesquisa?q={query}`)
- `product-detail` - Product detail page (`/pt/.../product/{pid}.html`)

**Key Selectors:**
- `search/productTile` - Individual product card in search results
- `search/productName` - Product name text
- `search/productPrice` - Product price
- `search/addToCartButton` - Add to cart button (check disabled state)
- `product-detail/recommendationsSection` - Recommendations container
- `product-detail/recommendationProducts` - Individual recommended products
- `product-detail/unavailableIndicator` - Out of stock indicator

**Full documentation:**
- `data/selectors/pages/search/v1.json`
- `data/selectors/pages/product-detail/v1.json`

---

## Known Issues & Limitations

1. **Unavailable product indicators NOT VERIFIED** - No out-of-stock products found during research
2. **Low stock warnings** - No evidence of "últimas unidades" or similar warnings in UI
3. **Category structure** - Not exposed in product data, must parse from URL
4. **Recommendation section** - Only visible on product detail page, not in search results
5. **Search pagination** - Limited to 72 results per page, pagination not tested

---

**Last Updated:** 2026-01-11
**Sprint:** SU-R-001 (Research Complete)
**Next Sprint:** SU-I-001 (Implementation - Core Search & Availability)
