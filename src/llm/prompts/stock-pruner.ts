/**
 * StockPruner Prompts
 *
 * Specialized prompts for the StockPruner agent's LLM-enhanced decision making.
 * These prompts guide the LLM to be CONSERVATIVE - when uncertain, keep items.
 */

import { BASE_SYSTEM_PROMPT } from './system.js';
import type { ProductCategory } from '../../agents/stock-pruner/types.js';

// =============================================================================
// StockPruner System Prompt
// =============================================================================

/**
 * StockPruner system prompt.
 * Emphasizes conservative decision-making and safety for high-consequence items.
 */
export const STOCK_PRUNER_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

## Your Role: StockPruner
You analyze the shopping cart to identify items that may not be needed because the household likely has adequate stock.

## Key Responsibility
Suggest items to REMOVE from the cart that were recently purchased and are unlikely to be needed yet.

## CRITICAL: Be Conservative
- **When in doubt, KEEP the item.** A false positive (removing something needed) is worse than a false negative (keeping something unneeded).
- **Low confidence = keep the item.** Only suggest removal with HIGH confidence (>0.8).
- **Unknown patterns = keep the item.** If you don't have clear evidence, assume the item is needed.

## High-Consequence Items (EXTRA CAUTION)
These items should almost NEVER be suggested for removal:
- **Baby supplies**: Formula, diapers, baby food, wipes
- **Medication/health**: Any pharmaceutical products, first aid
- **Pet supplies**: Pet food, medication, essential care items
- **Special dietary items**: Allergy-safe foods, medical nutrition

For high-consequence items:
- Only suggest removal if confidence is > 0.95
- Always flag for explicit user review
- Explain why removal is safe in this specific case

## Product Category Cadences
Typical restock cycles to consider:

### Short Cadence (3-10 days)
- Fresh produce: 3-7 days
- Bread/bakery: 3-5 days
- Dairy: 7-10 days
- Meat/fish: 7-10 days

### Medium Cadence (14-30 days)
- Beverages: 14-21 days
- Snacks: 14-21 days
- Baby care: 14-30 days (but HIGH CONSEQUENCE)
- Pet supplies: 21-30 days (but HIGH CONSEQUENCE)

### Long Cadence (30-60 days)
- Pantry staples: 30-45 days
- Paper products: 30-45 days
- Cleaning supplies: 30-60 days
- Laundry products: 30-60 days
- Personal hygiene: 30-60 days

## Decision Framework

### Suggest PRUNE if:
1. Item was purchased within 50% of typical cadence
2. Confidence is HIGH (>0.8)
3. Item is NOT high-consequence
4. Clear evidence from purchase history

### Suggest KEEP if:
- Item is overdue (past typical cadence)
- No purchase history available
- Item is high-consequence
- Uncertainty about household patterns
- Could be a seasonal or special occasion purchase

## Output Format
For each item, provide:
1. Product name (exact match)
2. Decision: prune or keep
3. Confidence score (0-1)
4. Clear reason
5. Whether it's high-consequence
6. Any caveats or uncertainties`;

// =============================================================================
// Task-Specific Prompts
// =============================================================================

/**
 * Prompt for analyzing a single cart item.
 */
export function buildItemAnalysisPrompt(
  productName: string,
  context: {
    daysSinceLastPurchase?: number;
    purchaseCount?: number;
    lastPurchaseDate?: Date;
    category?: ProductCategory;
    typicalCadenceDays?: number;
    averageQuantity?: number;
  },
): string {
  const lines: string[] = [
    `Analyze this cart item for potential pruning:`,
    ``,
    `**Product:** ${productName}`,
  ];

  if (context.category) {
    lines.push(`**Category:** ${context.category}`);
  }

  if (context.daysSinceLastPurchase !== undefined) {
    lines.push(`**Days since last purchase:** ${context.daysSinceLastPurchase}`);
  }

  if (context.lastPurchaseDate) {
    lines.push(`**Last purchased:** ${context.lastPurchaseDate.toISOString().split('T')[0]}`);
  }

  if (context.purchaseCount !== undefined) {
    lines.push(`**Times purchased:** ${context.purchaseCount}`);
  }

  if (context.typicalCadenceDays !== undefined) {
    lines.push(`**Typical restock cadence:** ${context.typicalCadenceDays} days`);
  }

  if (context.averageQuantity !== undefined) {
    lines.push(`**Average quantity per purchase:** ${context.averageQuantity}`);
  }

  lines.push(``);
  lines.push(`Based on this information, should this item be pruned from the cart?`);
  lines.push(`Remember: when uncertain, recommend KEEPING the item.`);

  return lines.join('\n');
}

/**
 * Item context for batch analysis including heuristic decision.
 */
export interface BatchAnalysisItem {
  productName: string;
  daysSinceLastPurchase?: number;
  purchaseCount?: number;
  category?: ProductCategory;
  typicalCadenceDays?: number;
  heuristicDecision?: {
    prune: boolean;
    confidence: number;
    reason: string;
  };
}

/**
 * Prompt for batch analysis of multiple items.
 * Includes heuristic decision context so LLM can validate/refine.
 */
export function buildBatchAnalysisPrompt(items: BatchAnalysisItem[]): string {
  const lines: string[] = [
    `Analyze these cart items for potential pruning.`,
    ``,
    `**Your Task:**`,
    `A heuristic algorithm has already analyzed each item. Your job is to:`,
    `1. VALIDATE the heuristic's decision (agree or disagree)`,
    `2. REFINE the confidence if you have additional insights`,
    `3. Provide a CLEAR explanation for the user`,
    ``,
    `**Remember:**`,
    `- Be CONSERVATIVE - when in doubt, keep items`,
    `- Only suggest pruning with HIGH confidence (>0.8)`,
    `- Flag high-consequence items (baby, medication, pet) for explicit review`,
    ``,
    `## Items to Analyze`,
    ``,
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    lines.push(`### ${i + 1}. ${item.productName}`);

    if (item.category) {
      lines.push(`- Category: ${item.category}`);
    }
    if (item.daysSinceLastPurchase !== undefined) {
      lines.push(`- Days since last purchase: ${item.daysSinceLastPurchase}`);
    }
    if (item.purchaseCount !== undefined) {
      lines.push(`- Times purchased: ${item.purchaseCount}`);
    }
    if (item.typicalCadenceDays !== undefined) {
      lines.push(`- Typical cadence: ${item.typicalCadenceDays} days`);
    }
    // Include heuristic decision for LLM to validate
    if (item.heuristicDecision) {
      lines.push(`- **Heuristic decision:** ${item.heuristicDecision.prune ? 'PRUNE' : 'KEEP'}`);
      lines.push(`- **Heuristic confidence:** ${(item.heuristicDecision.confidence * 100).toFixed(0)}%`);
      lines.push(`- **Heuristic reason:** ${item.heuristicDecision.reason}`);
    }
    lines.push(``);
  }

  lines.push(`## Expected Response Format`);
  lines.push(``);
  lines.push(`CRITICAL: The "productName" must match EXACTLY as shown above (copy-paste).`);
  lines.push(``);
  lines.push(`Provide your analysis as JSON with this structure:`);
  lines.push('```json');
  lines.push(`{`);
  lines.push(`  "decisions": [`);
  lines.push(`    {`);
  lines.push(`      "productName": "EXACT product name from above",`);
  lines.push(`      "shouldPrune": true/false,`);
  lines.push(`      "confidence": 0.0-1.0,`);
  lines.push(`      "reason": "clear explanation",`);
  lines.push(`      "isHighConsequence": true/false,`);
  lines.push(`      "highConsequenceReason": "if applicable"`);
  lines.push(`    }`);
  lines.push(`  ],`);
  lines.push(`  "summary": "brief overall analysis",`);
  lines.push(`  "itemsNeedingReview": ["product names that need user attention"],`);
  lines.push(`  "analysisWarnings": ["any data quality concerns"]`);
  lines.push(`}`);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Prompt for category classification.
 */
export function buildCategoryClassificationPrompt(productNames: string[]): string {
  const lines: string[] = [
    `Classify these products into categories based on their names.`,
    `Use Portuguese product name patterns to infer categories.`,
    ``,
    `## Categories`,
    `- fresh-produce: Fruits, vegetables, salads`,
    `- dairy: Milk, yogurt, cheese, butter`,
    `- meat-fish: Fresh meat, fish, seafood`,
    `- bread-bakery: Bread, pastries`,
    `- pantry-staples: Rice, pasta, canned goods, oil`,
    `- beverages: Coffee, tea, juices`,
    `- snacks: Cookies, chips, chocolate`,
    `- laundry: Detergent, softener`,
    `- cleaning: Dish soap, cleaners`,
    `- paper-products: Toilet paper, paper towels`,
    `- personal-hygiene: Shampoo, soap, toothpaste`,
    `- baby-care: Diapers, wipes, baby food`,
    `- pet-supplies: Pet food, litter`,
    `- unknown: Cannot determine`,
    ``,
    `## Products to Classify`,
    ``,
  ];

  for (let i = 0; i < productNames.length; i++) {
    lines.push(`${i + 1}. ${productNames[i]}`);
  }

  lines.push(``);
  lines.push(`## Response Format`);
  lines.push('```json');
  lines.push(`{`);
  lines.push(`  "classifications": [`);
  lines.push(`    {`);
  lines.push(`      "productName": "exact name",`);
  lines.push(`      "primaryCategory": "category-id",`);
  lines.push(`      "confidence": 0.0-1.0,`);
  lines.push(`      "matchedKeywords": ["keywords that matched"]`);
  lines.push(`    }`);
  lines.push(`  ]`);
  lines.push(`}`);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Prompt for explaining a prune decision to the user.
 */
export function buildExplanationPrompt(
  productName: string,
  decision: {
    shouldPrune: boolean;
    confidence: number;
    reason: string;
    daysSinceLastPurchase?: number;
    typicalCadenceDays?: number;
  },
): string {
  const action = decision.shouldPrune ? 'removal' : 'keeping';

  return `
Write a clear, friendly explanation for suggesting ${action} of "${productName}" from the cart.

**Decision Details:**
- Action: ${decision.shouldPrune ? 'Remove' : 'Keep'}
- Confidence: ${(decision.confidence * 100).toFixed(0)}%
- Reason: ${decision.reason}
${decision.daysSinceLastPurchase !== undefined ? `- Days since last purchase: ${decision.daysSinceLastPurchase}` : ''}
${decision.typicalCadenceDays !== undefined ? `- Typical restock cycle: ${decision.typicalCadenceDays} days` : ''}

**Guidelines:**
- Be concise (1-2 sentences)
- Use plain language (no technical jargon)
- If suggesting removal, reassure that it's just a suggestion
- If keeping, briefly explain why it might be needed

Write the explanation now:`;
}
