/**
 * Fallback Strategies for Selector Resolution
 *
 * Provides text-based and structural heuristics as last-resort fallback strategies
 * when primary and registered fallback selectors fail.
 */

import type { Page, ElementHandle } from 'playwright';
import type { SelectorDefinition } from './types.js';

/**
 * Text-based heuristic result
 */
export interface TextHeuristicResult {
  selector: string;
  confidence: number;
  reason: string;
}

/**
 * Generate text-based heuristic selectors
 *
 * Creates selectors based on visible text content, aria-labels, and placeholder text.
 * These are last-resort selectors with lower confidence.
 */
export function generateTextHeuristics(
  selectorDef: SelectorDefinition,
  customHints: string[] = []
): TextHeuristicResult[] {
  const results: TextHeuristicResult[] = [];
  const elementType = selectorDef.elementType;
  const description = selectorDef.description.toLowerCase();

  // Extract potential text hints from description
  const descriptionWords = description
    .split(/\s+/)
    .filter((w) => w.length > 3 && !['button', 'input', 'link', 'field', 'element'].includes(w));

  const allHints = [...customHints, ...descriptionWords];

  // Strategy 1: Text content matching (for buttons, links, text elements)
  if (['button', 'link', 'text'].includes(elementType)) {
    for (const hint of allHints) {
      // Exact match
      results.push({
        selector: `${getElementTag(elementType)}:has-text("${hint}")`,
        confidence: 0.4,
        reason: `Text content exact match: "${hint}"`,
      });

      // Case-insensitive partial match
      results.push({
        selector: `${getElementTag(elementType)}:text-matches("${hint}", "i")`,
        confidence: 0.35,
        reason: `Text content case-insensitive match: "${hint}"`,
      });
    }
  }

  // Strategy 2: Aria-label matching
  for (const hint of allHints) {
    results.push({
      selector: `[aria-label*="${hint}" i]`,
      confidence: 0.5,
      reason: `Aria-label contains: "${hint}"`,
    });
  }

  // Strategy 3: Placeholder text (for inputs)
  if (elementType === 'input') {
    for (const hint of allHints) {
      results.push({
        selector: `input[placeholder*="${hint}" i]`,
        confidence: 0.45,
        reason: `Placeholder contains: "${hint}"`,
      });
    }
  }

  // Strategy 4: Title attribute matching
  for (const hint of allHints) {
    results.push({
      selector: `[title*="${hint}" i]`,
      confidence: 0.4,
      reason: `Title attribute contains: "${hint}"`,
    });
  }

  // Strategy 5: Role-based with text
  const role = getAriaRole(elementType);
  if (role) {
    for (const hint of allHints) {
      results.push({
        selector: `[role="${role}"]:has-text("${hint}")`,
        confidence: 0.45,
        reason: `Role "${role}" with text "${hint}"`,
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Generate structural heuristic selectors
 *
 * Creates selectors based on DOM structure patterns, element positions,
 * and parent-child relationships.
 */
export function generateStructuralHeuristics(
  selectorDef: SelectorDefinition
): TextHeuristicResult[] {
  const results: TextHeuristicResult[] = [];
  const elementType = selectorDef.elementType;
  const description = selectorDef.description.toLowerCase();

  // Strategy 1: Common semantic wrappers
  const semanticPatterns = [
    { pattern: 'header', selector: 'header', confidence: 0.5 },
    { pattern: 'footer', selector: 'footer', confidence: 0.5 },
    { pattern: 'navigation', selector: 'nav', confidence: 0.5 },
    { pattern: 'sidebar', selector: 'aside', confidence: 0.45 },
    { pattern: 'main', selector: 'main', confidence: 0.5 },
    { pattern: 'form', selector: 'form', confidence: 0.5 },
  ];

  for (const { pattern, selector: parentSelector, confidence } of semanticPatterns) {
    if (description.includes(pattern)) {
      const tag = getElementTag(elementType);
      results.push({
        selector: `${parentSelector} ${tag}`,
        confidence,
        reason: `Element in semantic ${pattern} section`,
      });
    }
  }

  // Strategy 2: Input type-specific patterns
  if (elementType === 'input') {
    const inputTypes = ['text', 'email', 'password', 'number', 'search', 'tel'];
    for (const type of inputTypes) {
      if (description.includes(type) || description.includes(type.slice(0, -1))) {
        results.push({
          selector: `input[type="${type}"]`,
          confidence: 0.6,
          reason: `Input type matches description: ${type}`,
        });
      }
    }
  }

  // Strategy 3: Button type patterns
  if (elementType === 'button') {
    if (description.includes('submit')) {
      results.push({
        selector: 'button[type="submit"]',
        confidence: 0.55,
        reason: 'Submit button type',
      });
      results.push({
        selector: 'input[type="submit"]',
        confidence: 0.55,
        reason: 'Submit input type',
      });
    }
  }

  // Strategy 4: Landmark regions by role
  const landmarks = [
    { keyword: 'navigation', role: 'navigation' },
    { keyword: 'search', role: 'search' },
    { keyword: 'banner', role: 'banner' },
    { keyword: 'main', role: 'main' },
    { keyword: 'footer', role: 'contentinfo' },
  ];

  for (const { keyword, role } of landmarks) {
    if (description.includes(keyword)) {
      const tag = getElementTag(elementType);
      results.push({
        selector: `[role="${role}"] ${tag}`,
        confidence: 0.5,
        reason: `Element in ${role} landmark`,
      });
    }
  }

  // Strategy 5: Common class pattern fragments
  const classPatterns = extractClassPatterns(description);
  for (const pattern of classPatterns) {
    results.push({
      selector: `[class*="${pattern}"]`,
      confidence: 0.3,
      reason: `Class contains: "${pattern}"`,
    });
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Try text-based heuristics against a page
 *
 * Attempts to find elements using text-based heuristics.
 * Returns the first matching element with metadata.
 */
export async function tryTextHeuristics(
  page: Page,
  selectorDef: SelectorDefinition,
  customHints: string[] = [],
  timeout = 2000
): Promise<{
  element: ElementHandle | null;
  selector: string | null;
  confidence: number;
  reason: string;
}> {
  const heuristics = generateTextHeuristics(selectorDef, customHints);

  for (const heuristic of heuristics) {
    try {
      const element = await page.waitForSelector(heuristic.selector, {
        timeout,
        state: 'visible',
      });

      if (element !== null) {
        return {
          element,
          selector: heuristic.selector,
          confidence: heuristic.confidence,
          reason: heuristic.reason,
        };
      }
    } catch {
      // Try next heuristic
      continue;
    }
  }

  return {
    element: null,
    selector: null,
    confidence: 0,
    reason: 'No text heuristics matched',
  };
}

/**
 * Try structural heuristics against a page
 *
 * Attempts to find elements using structural patterns.
 * Returns the first matching element with metadata.
 */
export async function tryStructuralHeuristics(
  page: Page,
  selectorDef: SelectorDefinition,
  timeout = 2000
): Promise<{
  element: ElementHandle | null;
  selector: string | null;
  confidence: number;
  reason: string;
}> {
  const heuristics = generateStructuralHeuristics(selectorDef);

  for (const heuristic of heuristics) {
    try {
      const element = await page.waitForSelector(heuristic.selector, {
        timeout,
        state: 'visible',
      });

      if (element !== null) {
        return {
          element,
          selector: heuristic.selector,
          confidence: heuristic.confidence,
          reason: heuristic.reason,
        };
      }
    } catch {
      // Try next heuristic
      continue;
    }
  }

  return {
    element: null,
    selector: null,
    confidence: 0,
    reason: 'No structural heuristics matched',
  };
}

/**
 * Handle minor DOM structure changes
 *
 * Attempts to find elements even if wrapped in additional divs or containers.
 * Uses descendant combinators and :first-of-type selectors.
 */
export function generateDomTolerantSelectors(primarySelector: string): string[] {
  const tolerant: string[] = [];

  // If selector is an ID or class, add descendant variants
  if (primarySelector.startsWith('#') || primarySelector.startsWith('.')) {
    // Try with descendant combinator (allows intermediate wrappers)
    tolerant.push(`${primarySelector} > *:first-child`);
    tolerant.push(`${primarySelector} *:first-of-type`);

    // Try parent-child relationship
    tolerant.push(`[id*="${primarySelector.slice(1)}"]`); // Partial ID match
    tolerant.push(`[class*="${primarySelector.slice(1)}"]`); // Partial class match
  }

  // Handle CSS module suffixes (e.g., .button_abc123)
  if (primarySelector.includes('[class')) {
    // Already handles dynamic classes
    return tolerant;
  }

  const classMatch = primarySelector.match(/\.([a-zA-Z0-9_-]+)/);
  if (classMatch) {
    const baseClass = classMatch[1];
    if (baseClass) {
      // Add partial class match for CSS modules
      tolerant.push(`[class^="${baseClass}"]`); // Starts with
      tolerant.push(`[class*="${baseClass}"]`); // Contains
    }
  }

  return tolerant;
}

/**
 * Helper: Get HTML tag name for element type
 */
function getElementTag(elementType: SelectorDefinition['elementType']): string {
  const tagMap: Record<SelectorDefinition['elementType'], string> = {
    button: 'button',
    input: 'input',
    link: 'a',
    container: 'div',
    text: '*',
    image: 'img',
    form: 'form',
    list: 'ul',
    item: 'li',
  };

  return tagMap[elementType] ?? '*';
}

/**
 * Helper: Get ARIA role for element type
 */
function getAriaRole(elementType: SelectorDefinition['elementType']): string | null {
  const roleMap: Record<SelectorDefinition['elementType'], string> = {
    button: 'button',
    input: 'textbox',
    link: 'link',
    container: 'region',
    text: 'text',
    image: 'img',
    form: 'form',
    list: 'list',
    item: 'listitem',
  };

  return roleMap[elementType] ?? null;
}

/**
 * Helper: Extract potential class name patterns from description
 */
function extractClassPatterns(description: string): string[] {
  const patterns: string[] = [];

  // Split on spaces and common separators
  const words = description
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter((w) => w.length > 3);

  // Common prefixes/suffixes
  const modifiers = ['btn', 'input', 'link', 'container', 'wrapper', 'header', 'footer'];

  for (const word of words) {
    // Skip common stop words
    if (['the', 'and', 'for', 'with', 'from', 'into'].includes(word)) {
      continue;
    }

    patterns.push(word);

    // Try with common prefixes
    for (const mod of modifiers) {
      if (description.includes(mod)) {
        patterns.push(`${mod}-${word}`);
        patterns.push(`${word}-${mod}`);
      }
    }
  }

  // Remove duplicates
  return [...new Set(patterns)];
}
