# Plan: LLM-Powered Substitution Worker Agent

**Goal**: Design and implement the "Availability & Substitution" worker agent with LLM power, applying value heuristics (store brand preference, capacity/cost optimization) as specified in the solution architecture.

---

## 1. Current State Analysis

### What Exists
- `src/agents/substitution/substitution.ts` - Basic substitution agent with heuristic scoring
- `src/agents/substitution/tools/` - Tools for search, availability check, product extraction
- Ranking based on: brand similarity, size match, price similarity, category overlap

### What's Missing
1. **LLM integration** - No semantic understanding for queries or ranking
2. **Value heuristics** - No store brand preference or capacity/cost optimization
3. **Smart query generation** - Too literal (returns only the unavailable item)
4. **Proper worker interface** - Needs to integrate with Coordinator properly

---

## 2. Architecture Design

### Worker Position in CWD Pattern

```
Coordinator
    ↓
    ├── CartBuilder (merge past orders)
    ↓
    ├── Substitution Worker ← THIS
    │   ├── Detect unavailable items in cart
    │   ├── LLM: Generate smart search queries
    │   ├── Search for candidates
    │   ├── LLM: Apply value heuristics & rank
    │   └── Return recommendations with reasoning
    ↓
    ├── StockPruner (remove unlikely items)
    ↓
    └── SlotScout (delivery options)
```

### LLM Integration Architecture

```
Substitution Worker
    │
    ├── Tool Layer (Playwright RPA)
    │   ├── scanCartTool - Get cart items with availability
    │   ├── searchProductsTool - Search Auchan.pt
    │   └── extractProductInfoTool - Get detailed product data
    │
    └── LLM Layer (Claude)
        ├── QueryGenerator - Semantic query building
        ├── ValueRanker - Apply value heuristics
        └── ReasonGenerator - Explain recommendations
```

---

## 3. LLM Components Design

### 3.1 Query Generator

**Purpose**: Generate semantically smart search queries that find alternatives, not the same product.

**File**: `src/agents/substitution/llm/query-generator.ts`

```typescript
interface QueryGeneratorInput {
  productName: string;      // "batata doce auchan em cubos para cozer 400g"
  productCategory?: string; // Inferred: "frozen vegetables"
  originalPrice?: number;   // For price-range filtering
}

interface QueryGeneratorOutput {
  primaryQuery: string;     // "batata doce cubos congelada"
  fallbackQueries: string[]; // ["batata doce congelada", "batata doce"]
  inferredCategory: string;
  searchStrategy: 'exact' | 'category' | 'broad';
}
```

**LLM Tool**:
```typescript
const generateSearchQueryTool = {
  name: 'generate_search_query',
  description: 'Generate search queries to find substitute products on Auchan.pt',
  input_schema: {
    type: 'object',
    properties: {
      primaryQuery: { type: 'string' },
      fallbackQueries: { type: 'array', items: { type: 'string' } },
      inferredCategory: { type: 'string' },
      reasoning: { type: 'string' },
    },
    required: ['primaryQuery', 'fallbackQueries', 'inferredCategory', 'reasoning'],
  },
};
```

**System Prompt** (key rules):
```
You are finding ALTERNATIVES for unavailable grocery products on Auchan.pt (Portugal).

Query Generation Rules:
1. REMOVE brand names (Auchan, Mimosa, Iglo, etc.) - we want ANY brand
2. REMOVE size/weight (400g, 1L, etc.) - already stripped
3. KEEP core product type + key attributes (e.g., "batata doce cubos congelada")
4. Generate 2-3 progressively broader fallback queries
5. Use Portuguese product naming conventions

Examples:
- "batata doce auchan em cubos para cozer 400g"
  → Primary: "batata doce cubos congelada"
  → Fallbacks: ["batata doce congelada", "legumes congelados cubos"]

- "requeijão de ovelha auchan à mesa em portugal cultivamos o bom seia 200g"
  → Primary: "requeijão ovelha"
  → Fallbacks: ["requeijão", "queijo fresco ovelha"]

- "fiambre da pá auchan fatias 200g"
  → Primary: "fiambre pá fatiado"
  → Fallbacks: ["fiambre fatiado", "fiambre"]
```

### 3.2 Value Ranker

**Purpose**: Apply household value heuristics to rank substitutes.

**File**: `src/agents/substitution/llm/value-ranker.ts`

**Value Heuristics** (from problem-statement.md):
1. **Store brand preference**: Auchan brand > National brand > Premium brand
2. **Price optimization**: Prefer next-cheapest when quality similar
3. **Capacity/cost ratio**: Optimize €/kg, €/L, €/unit
4. **Size flexibility**: Accept larger packs if better €/unit

```typescript
interface ValueRankerInput {
  originalProduct: {
    name: string;
    price: number;
    pricePerUnit?: string;  // "2,97€/kg"
    size?: string;
  };
  candidates: Array<{
    productId: string;
    name: string;
    price: number;
    pricePerUnit?: string;
    brand?: string;
    size?: string;
    available: boolean;
  }>;
}

interface ValueRankerOutput {
  rankings: Array<{
    productId: string;
    rank: number;
    valueScore: number;      // 0-1, capacity/cost optimization
    brandPreference: 'store' | 'national' | 'premium' | 'unknown';
    priceComparison: 'cheaper' | 'similar' | 'more_expensive';
    capacityCostRatio: number;  // Normalized €/unit score
    recommendation: 'strong' | 'acceptable' | 'weak';
    reason: string;          // Human-readable explanation
  }>;
  summary: string;
}
```

**LLM Tool**:
```typescript
const rankSubstitutesByValueTool = {
  name: 'rank_substitutes_by_value',
  description: 'Rank substitute candidates using household value heuristics',
  input_schema: {
    type: 'object',
    properties: {
      rankings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string' },
            rank: { type: 'number' },
            valueScore: { type: 'number' },
            brandPreference: { type: 'string', enum: ['store', 'national', 'premium', 'unknown'] },
            recommendation: { type: 'string', enum: ['strong', 'acceptable', 'weak'] },
            reason: { type: 'string' },
          },
        },
      },
      summary: { type: 'string' },
    },
  },
};
```

**System Prompt** (value heuristics):
```
You are ranking substitute products for a Portuguese household that prioritizes VALUE.

VALUE HEURISTICS (in order of importance):
1. STORE BRAND PREFERENCE
   - Auchan, Polegar, Amanhecer = store brands (BEST value)
   - Mimosa, Iglo, Compal = national brands (good)
   - Premium/organic = only if similar price

2. CAPACITY/COST OPTIMIZATION
   - Calculate €/kg or €/L or €/unit
   - Prefer better ratio even if larger pack
   - Example: 1kg at 3€ (3€/kg) beats 500g at 2€ (4€/kg)

3. PRICE COMPARISON
   - Cheaper or similar price = preferred
   - More expensive only if significantly better value ratio

4. TRUE SUBSTITUTE CHECK
   - Must serve same purpose (frozen veg → frozen veg, not fresh)
   - Same category (dairy → dairy, not plant-based unless specified)

For each candidate, provide:
- Value score (0-1): How good is the capacity/cost ratio?
- Brand preference: store/national/premium
- Recommendation: strong (>0.8), acceptable (0.5-0.8), weak (<0.5)
- Reason: Clear explanation in Portuguese context
```

### 3.3 Substitution LLM Enhancer

**Purpose**: Orchestrate LLM calls following StockPruner pattern.

**File**: `src/agents/substitution/llm/enhancer.ts`

```typescript
export class SubstitutionLLMEnhancer {
  private client: LLMClient;
  private queryGenerator: QueryGenerator;
  private valueRanker: ValueRanker;

  constructor(config: SubstitutionLLMConfig) {
    this.client = createLLMClient({
      model: config.model ?? 'claude-3-haiku-20240307',
      maxTokens: 1024,
      temperature: 0.3,
    });
    this.queryGenerator = new QueryGenerator(this.client);
    this.valueRanker = new ValueRanker(this.client);
  }

  /**
   * Generate smart search queries for an unavailable product
   */
  async generateQueries(productName: string): Promise<QueryGeneratorOutput> {
    // Graceful degradation: fall back to heuristic if LLM fails
    try {
      return await this.queryGenerator.generate(productName);
    } catch (error) {
      this.logger.warn('LLM query generation failed, using heuristic', { error });
      return this.heuristicQueryBuilder(productName);
    }
  }

  /**
   * Rank candidates using value heuristics
   */
  async rankByValue(
    original: OriginalProduct,
    candidates: SubstituteCandidate[]
  ): Promise<ValueRankerOutput> {
    // Graceful degradation: fall back to heuristic scoring
    try {
      return await this.valueRanker.rank(original, candidates);
    } catch (error) {
      this.logger.warn('LLM ranking failed, using heuristic', { error });
      return this.heuristicRanker(original, candidates);
    }
  }

  // Heuristic fallbacks...
}
```

---

## 4. Updated Worker Flow

### Main `run()` Method

```typescript
async run(context: AgentContext, input: SubstitutionInput): Promise<SubstitutionResult> {
  const { logger } = context;
  const toolContext = this.createToolContext(context);

  // Step 1: Get cart items with availability status
  logger.info('Scanning cart for unavailable items');
  const cartScan = await scanCartTool.execute({ expandAll: true }, toolContext);

  const unavailableItems = cartScan.data.items.filter(item => !item.available);
  logger.info('Found unavailable items', { count: unavailableItems.length });

  if (unavailableItems.length === 0) {
    return { success: true, data: { substitutions: [], summary: 'All items available' } };
  }

  // Step 2: Find substitutes for each unavailable item
  const substitutions: SubstitutionRecommendation[] = [];

  for (const item of unavailableItems) {
    logger.info('Finding substitutes', { item: item.name });

    // 2a: Generate smart search queries (LLM-enhanced)
    const queries = await this.llmEnhancer.generateQueries(item.name);
    logger.debug('Generated queries', { queries });

    // 2b: Search with fallback strategy
    let candidates: SubstituteCandidate[] = [];
    for (const query of [queries.primaryQuery, ...queries.fallbackQueries]) {
      const searchResult = await searchProductsTool.execute(
        { query, maxResults: 10, availableOnly: true },
        toolContext
      );

      if (searchResult.success && searchResult.data.products.length > 0) {
        candidates.push(...searchResult.data.products);
        if (candidates.length >= 8) break; // Enough candidates
      }
    }

    // 2c: Remove the original product from candidates (if it appears)
    candidates = candidates.filter(c =>
      !this.isSameProduct(c, item)
    );

    if (candidates.length === 0) {
      substitutions.push({
        originalItem: item,
        status: 'no_substitutes',
        candidates: [],
        reason: 'No suitable alternatives found',
      });
      continue;
    }

    // 2d: Apply value-based ranking (LLM-enhanced)
    const ranked = await this.llmEnhancer.rankByValue(item, candidates);

    substitutions.push({
      originalItem: item,
      status: 'substitutes_found',
      candidates: ranked.rankings,
      reason: ranked.summary,
    });
  }

  // Step 3: Generate summary
  const summary = this.generateSummary(substitutions);

  return {
    success: true,
    data: {
      substitutions,
      summary,
      totalUnavailable: unavailableItems.length,
      totalWithSubstitutes: substitutions.filter(s => s.status === 'substitutes_found').length,
    },
  };
}
```

---

## 5. Value Heuristics Implementation

### Brand Classification

```typescript
const STORE_BRANDS = ['auchan', 'polegar', 'amanhecer', 'produto branco'];
const NATIONAL_BRANDS = ['mimosa', 'iglo', 'compal', 'licor beirão', 'gallo', 'lusiaves'];
const PREMIUM_BRANDS = ['bio', 'organic', 'premium', 'gourmet', 'deluxe'];

function classifyBrand(productName: string): 'store' | 'national' | 'premium' | 'unknown' {
  const nameLower = productName.toLowerCase();

  if (STORE_BRANDS.some(b => nameLower.includes(b))) return 'store';
  if (PREMIUM_BRANDS.some(b => nameLower.includes(b))) return 'premium';
  if (NATIONAL_BRANDS.some(b => nameLower.includes(b))) return 'national';

  return 'unknown';
}
```

### Capacity/Cost Ratio

```typescript
function calculateCapacityCostRatio(
  price: number,
  pricePerUnit?: string,
  size?: string
): number {
  // Parse pricePerUnit if available (e.g., "2,97€/kg")
  if (pricePerUnit) {
    const match = pricePerUnit.match(/(\d+[,.]?\d*)\s*€\s*\/\s*(kg|l|un)/i);
    if (match) {
      const pricePerUnitValue = parseFloat(match[1].replace(',', '.'));
      // Lower €/unit = better value = higher score
      // Normalize: 0€/kg = 1.0, 10€/kg = 0.0
      return Math.max(0, 1 - (pricePerUnitValue / 10));
    }
  }

  // Fallback: use absolute price (lower = better)
  return Math.max(0, 1 - (price / 20));
}
```

### Value Score Calculation

```typescript
function calculateValueScore(
  candidate: SubstituteCandidate,
  original: OriginalProduct
): number {
  const brandScore = {
    'store': 1.0,      // Best value
    'national': 0.7,
    'premium': 0.4,
    'unknown': 0.6,
  }[classifyBrand(candidate.name)];

  const capacityCostScore = calculateCapacityCostRatio(
    candidate.unitPrice,
    candidate.pricePerUnit,
    candidate.size
  );

  const priceScore = candidate.unitPrice <= (original.unitPrice * 1.1)
    ? 1.0  // Same or cheaper
    : Math.max(0, 1 - ((candidate.unitPrice - original.unitPrice) / original.unitPrice));

  // Weighted value score
  return (
    brandScore * 0.35 +        // Store brand preference
    capacityCostScore * 0.40 + // Capacity/cost optimization
    priceScore * 0.25          // Price comparison
  );
}
```

---

## 6. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/agents/substitution/llm/query-generator.ts` | Create | LLM-powered semantic query generation |
| `src/agents/substitution/llm/value-ranker.ts` | Create | LLM-powered value-based ranking |
| `src/agents/substitution/llm/enhancer.ts` | Create | Orchestrates LLM calls with graceful degradation |
| `src/agents/substitution/llm/prompts.ts` | Create | System prompts for substitution LLM |
| `src/agents/substitution/llm/index.ts` | Create | Module exports |
| `src/agents/substitution/value-heuristics.ts` | Create | Brand classification, capacity/cost calculation |
| `src/agents/substitution/substitution.ts` | Modify | Integrate LLM enhancer into worker flow |
| `src/agents/substitution/types.ts` | Modify | Add value-related types |
| `scripts/demo-substitution-flow.ts` | Modify | Use new LLM-enhanced flow |

---

## 7. Expected Results

### Before (Current)
```
Search: "batata doce auchan em cubos para cozer"
Results: 1 (the unavailable item itself)
Substitutes: None
```

### After (LLM-Enhanced)
```
LLM Query Generation:
  Primary: "batata doce cubos congelada"
  Fallbacks: ["batata doce congelada", "legumes congelados"]

Search: "batata doce cubos congelada"
Results: 6 candidates

Value-Based Ranking:
1. Batata Doce Auchan Rodelas Congelada 450g - 2,29€
   Brand: STORE (Auchan) ⭐
   Value: 5,09€/kg
   Score: 92% | Recommendation: STRONG
   Reason: "Marca Auchan (melhor valor), formato similar, bom €/kg"

2. Batata Doce Iglo Cubos 400g - 2,99€
   Brand: NATIONAL
   Value: 7,48€/kg
   Score: 71% | Recommendation: ACCEPTABLE
   Reason: "Marca nacional, tamanho igual, €/kg superior"

3. Batata Doce Bio Congelada 300g - 3,49€
   Brand: PREMIUM
   Value: 11,63€/kg
   Score: 45% | Recommendation: WEAK
   Reason: "Marca premium, preço elevado, €/kg não otimizado"
```

---

## 8. Verification Steps

1. **Build**: `npm run build` - no TypeScript errors
2. **Unit tests**: Test query generator and value ranker in isolation
3. **Integration test**: Run demo with all 5 unavailable items
4. **Check**:
   - All items should have substitute suggestions
   - Auchan brand products should rank higher
   - Capacity/cost ratio should influence ranking
   - Reasons should be clear and in Portuguese context

---

## 9. Graceful Degradation

If LLM unavailable:
- Query generation → Falls back to heuristic (strip brand + size)
- Value ranking → Falls back to existing scoring (brand similarity, price)
- Logs warning but continues operation
- No user-facing errors

This matches StockPruner pattern: **LLM enhances, heuristics always work**.
