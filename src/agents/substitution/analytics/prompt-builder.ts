/**
 * Prompt Builder for Substitution LLM Enhancement
 *
 * Builds rich prompts for Claude to evaluate substitute candidates.
 * Includes value analytics, store brand information, and comparison metrics.
 */

import type { RankedSubstitute } from '../types.js';
import type {
  SubstitutionContext,
  SubstituteCandidateWithAnalytics,
  OriginalProductContext,
} from './types.js';
import { formatPriceChange, formatPricePerUnit } from './value-calculator.js';

// =============================================================================
// System Prompt
// =============================================================================

/**
 * Build system prompt for substitution LLM enhancement.
 */
export function buildSubstitutionSystemPrompt(): string {
  return `You are a grocery shopping assistant helping a Portuguese household find good substitutes for unavailable products.

## Your Role
Evaluate substitute candidates to find the BEST VALUE option that meets the household's needs.

## Value Heuristics (CRITICAL - Portuguese household preferences)

### 1. Store Brand Preference
- PREFER Auchan or Polegar (store) brands over name brands when quality is equivalent
- Store brands typically offer 20-40% savings with comparable quality
- Exception: Baby products, pet food, and specific dietary needs may require name brands

### 2. Price-Per-Unit Optimization
- Always compare €/kg or €/L, not just total price
- A larger package at better €/unit is often better value
- Example: 1kg at €3.50 (€3.50/kg) beats 500g at €2.00 (€4.00/kg)

### 3. Price Tolerance
- Default maximum: 20% price increase from original
- If all options exceed 20%, recommend the cheapest acceptable option
- Never recommend >30% increase without explicit safety/dietary reason

### 4. Size Preference
- Same or larger quantity preferred at similar €/unit
- Smaller quantity acceptable if €/unit is significantly better
- Pack bundles (e.g., 6x330ml vs 1L) need careful €/unit calculation

## Decision Framework

For each candidate, call make_substitution_decision with your evaluation.

Rating guidelines:
- **STRONGLY_RECOMMEND**: Store brand or better value, good match, under original price
- **RECOMMEND**: Good match, within 10% price increase, reasonable value
- **ACCEPTABLE**: Adequate match, up to 20% price increase
- **POOR**: Weak match, >20% price increase, or questionable value
- **REJECT**: Safety concern, dietary mismatch, or unacceptable price

Be CONSERVATIVE with recommendations:
- User will review all suggestions
- It's better to rank a good option as "acceptable" than miss a concern`;
}

// =============================================================================
// User Prompt Builder
// =============================================================================

/**
 * Build user prompt for substitution evaluation.
 */
export function buildSubstitutionUserPrompt(context: SubstitutionContext): string {
  const lines: string[] = [];

  // Header
  lines.push('# Substitution Request');
  lines.push('');

  // Original product
  lines.push('## Original Product (Unavailable)');
  lines.push(`- **Name:** ${context.original.name}`);
  if (context.original.brand) {
    lines.push(`- **Brand:** ${context.original.brand}`);
  }
  lines.push(`- **Price:** €${context.original.price.toFixed(2)}`);
  if (context.original.pricePerUnit) {
    lines.push(`- **Price per unit:** ${context.original.pricePerUnit}`);
  }
  if (context.original.size) {
    lines.push(`- **Size:** ${context.original.size}`);
  }
  if (context.original.category) {
    lines.push(`- **Category:** ${context.original.category}`);
  }
  lines.push('');

  // User preferences (if learned)
  if (context.userPreferences) {
    lines.push('## User Preferences (Learned)');
    lines.push(`- Brand tolerance: ${context.userPreferences.brandTolerance}`);
    lines.push(`- Max price increase: ${(context.userPreferences.maxPriceIncrease * 100).toFixed(0)}%`);
    lines.push(`- Prefers store brands: ${context.userPreferences.prefersStoreBrand ? 'Yes' : 'No'}`);
    lines.push(`- Confidence: ${(context.userPreferences.confidence * 100).toFixed(0)}%`);
    lines.push('');
  }

  // Price tolerance
  lines.push(`## Price Tolerance: ${(context.priceTolerance * 100).toFixed(0)}%`);
  lines.push('');

  // Candidates to evaluate
  lines.push(`## Candidates to Evaluate (${context.candidates.length})`);
  lines.push('');

  for (let i = 0; i < context.candidates.length; i++) {
    const c = context.candidates[i]!;
    const { candidate, valueAnalytics, valueComparison, heuristicScore, heuristicReason } = c;

    lines.push(`### ${i + 1}. ${candidate.name}`);
    lines.push('');

    // Basic info
    if (candidate.brand) {
      const brandNote = valueAnalytics.isStoreBrand ? ' **(STORE BRAND)**' : '';
      lines.push(`- **Brand:** ${candidate.brand}${brandNote}`);
    }
    lines.push(`- **Price:** €${candidate.unitPrice.toFixed(2)}`);

    // Value analytics
    const pricePerUnit = formatPricePerUnit(
      valueAnalytics.normalizedPricePerUnit,
      valueAnalytics.pricePerUnitLabel
    );
    if (pricePerUnit !== 'N/A') {
      lines.push(`- **Price per unit:** ${pricePerUnit}`);
    }

    if (candidate.size) {
      lines.push(`- **Size:** ${candidate.size}`);
    }

    // Value comparison
    lines.push('');
    lines.push('**Value Analysis:**');
    lines.push(`- Price change: ${formatPriceChange(valueComparison.priceChangePercent)}`);

    if (valueComparison.pricePerUnitDelta !== null) {
      const direction = valueComparison.isBetterValuePerUnit ? 'BETTER' : 'WORSE';
      lines.push(`- Price/unit: ${direction} by ${Math.abs(valueComparison.pricePerUnitChangePercent ?? 0).toFixed(1)}%`);
    }

    if (valueComparison.isStoreBrandSwitch) {
      lines.push('- **Store brand option (potential savings)**');
    }

    if (valueComparison.exceedsPriceTolerance) {
      lines.push('- **WARNING:** Exceeds price tolerance');
    }

    lines.push(`- Value rating: ${valueComparison.valueRating.toUpperCase()}`);

    // Heuristic baseline
    lines.push('');
    lines.push('**Heuristic Analysis:**');
    lines.push(`- Overall score: ${(heuristicScore.overall * 100).toFixed(0)}%`);
    lines.push(`- Brand match: ${(heuristicScore.brandSimilarity * 100).toFixed(0)}%`);
    lines.push(`- Size match: ${(heuristicScore.sizeSimilarity * 100).toFixed(0)}%`);
    lines.push(`- Price match: ${(heuristicScore.priceSimilarity * 100).toFixed(0)}%`);
    lines.push(`- Reason: ${heuristicReason}`);
    lines.push('');
  }

  // Instructions
  lines.push('## Your Task');
  lines.push('');
  lines.push('Call make_substitution_decision for each candidate above.');
  lines.push('');
  lines.push('Remember:');
  lines.push('1. Prioritize €/unit value over absolute price');
  lines.push('2. Prefer store brands when quality is equivalent');
  lines.push(`3. Stay within ${(context.priceTolerance * 100).toFixed(0)}% price increase unless no alternatives`);
  lines.push('4. Be conservative - user will review all suggestions');

  return lines.join('\n');
}

// =============================================================================
// Query Generation Prompt
// =============================================================================

/**
 * Build prompt for LLM-powered query generation.
 */
export function buildQueryGenerationPrompt(
  productName: string,
  brand?: string,
  category?: string,
  previousQuery?: string,
  previousResultCount?: number
): string {
  const lines: string[] = [];

  lines.push('# Search Query Generation Request');
  lines.push('');
  lines.push('Generate Portuguese search queries for Auchan.pt grocery search.');
  lines.push('');
  lines.push('## Product Information');
  lines.push(`- **Product Name:** ${productName}`);
  if (brand) {
    lines.push(`- **Brand:** ${brand}`);
  }
  if (category) {
    lines.push(`- **Category:** ${category}`);
  }
  lines.push('');

  if (previousQuery !== undefined) {
    lines.push('## Previous Attempt');
    lines.push(`- **Query used:** "${previousQuery}"`);
    lines.push(`- **Results found:** ${previousResultCount ?? 0}`);
    lines.push('');
    lines.push('The previous query did not return enough results. Generate alternative queries.');
    lines.push('');
  }

  lines.push('## Rules');
  lines.push('1. Remove size/weight units (g, kg, ml, l, etc.)');
  lines.push('2. Extract the core product type');
  lines.push('3. Include relevant category terms');
  lines.push('4. Try brand alternatives if the original brand is known');
  lines.push('5. Use Portuguese terms only');
  lines.push('6. Keep queries 2-4 words for best results');
  lines.push('');
  lines.push('## Examples');
  lines.push('- "Queijo Fresco Magro Auchan 200g" → ["queijo fresco", "queijo magro"]');
  lines.push('- "Leite Mimosa UHT Meio Gordo 1L" → ["leite meio gordo", "leite uht"]');
  lines.push('- "Iogurte Grego Natural 500g" → ["iogurte grego", "iogurte natural"]');
  lines.push('');
  lines.push('Call generate_search_queries with your suggested queries (best first).');

  return lines.join('\n');
}

// =============================================================================
// Filtering Logic
// =============================================================================

/**
 * Configuration for LLM invocation filtering.
 */
export interface SubstitutionFilterConfig {
  /** Score threshold below which to invoke LLM */
  uncertaintyThreshold: number;
  /** Score gap threshold - invoke LLM if top scores are close */
  closeScoreGap: number;
  /** Categories that always get LLM review */
  sensitiveCategories: string[];
  /** Price increase threshold to trigger LLM review */
  priceIncreaseThreshold: number;
}

/**
 * Default filter configuration.
 */
export const DEFAULT_FILTER_CONFIG: SubstitutionFilterConfig = {
  uncertaintyThreshold: 0.65,
  closeScoreGap: 0.10,
  sensitiveCategories: ['baby', 'pet', 'dietary', 'allergen'],
  priceIncreaseThreshold: 0.10,
};

/**
 * Determine if LLM should be invoked for this substitution search.
 */
export function shouldInvokeLLM(
  candidates: SubstituteCandidateWithAnalytics[],
  original: OriginalProductContext,
  config: SubstitutionFilterConfig = DEFAULT_FILTER_CONFIG
): { invoke: boolean; reason: string } {
  // No candidates - nothing to enhance
  if (candidates.length === 0) {
    return { invoke: false, reason: 'No candidates to evaluate' };
  }

  // Single candidate with high confidence
  if (candidates.length === 1) {
    const score = candidates[0]!.heuristicScore.overall;
    if (score >= 0.8) {
      return { invoke: false, reason: 'Single high-confidence candidate' };
    }
    return { invoke: true, reason: 'Single candidate needs validation' };
  }

  // Check for sensitive category (skip if category not provided)
  const originalCategory = original.category;
  if (originalCategory) {
    const isSensitiveCategory = config.sensitiveCategories.some(
      cat => originalCategory.toLowerCase().includes(cat)
    );
    if (isSensitiveCategory) {
      return { invoke: true, reason: `Sensitive category: ${originalCategory}` };
    }
  }

  // Check for close scores (top 2 within gap threshold)
  const topScore = candidates[0]!.heuristicScore.overall;
  const secondScore = candidates[1]!.heuristicScore.overall;
  if (topScore - secondScore < config.closeScoreGap) {
    return {
      invoke: true,
      reason: `Top scores are close (${(topScore - secondScore).toFixed(2)} gap)`,
    };
  }

  // Check for low confidence on top candidate
  if (topScore < config.uncertaintyThreshold) {
    return {
      invoke: true,
      reason: `Top score below threshold (${topScore.toFixed(2)})`,
    };
  }

  // Check for price tolerance concerns
  const topCandidate = candidates[0]!;
  const priceChange = topCandidate.valueComparison.priceChangePercent / 100;
  if (priceChange > config.priceIncreaseThreshold) {
    return {
      invoke: true,
      reason: `Price increase needs value assessment (${(priceChange * 100).toFixed(1)}%)`,
    };
  }

  // Check for store brand opportunity
  const hasStoreBrand = candidates.some(c => c.valueAnalytics.isStoreBrand);
  const topIsStoreBrand = topCandidate.valueAnalytics.isStoreBrand;
  if (hasStoreBrand && !topIsStoreBrand) {
    return { invoke: true, reason: 'Store brand option available but not ranked first' };
  }

  return { invoke: false, reason: 'High-confidence heuristic result' };
}

/**
 * Prepare candidates for LLM prompt, filtering if needed.
 */
export function prepareSubstitutesForPrompt(
  _rankedSubstitutes: RankedSubstitute[],
  candidatesWithAnalytics: SubstituteCandidateWithAnalytics[],
  maxCandidates: number = 5
): SubstituteCandidateWithAnalytics[] {
  // Sort by heuristic score descending
  const sorted = [...candidatesWithAnalytics].sort(
    (a, b) => b.heuristicScore.overall - a.heuristicScore.overall
  );

  // Take top N candidates
  return sorted.slice(0, maxCandidates);
}
