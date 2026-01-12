/**
 * Preference Display Component
 *
 * Data layer for displaying learned preferences and their influence
 * on the current shopping session.
 *
 * Features:
 * - List active preference rules
 * - Show which preferences influenced the current run
 * - Track preference application history
 * - Support for both manual and learned preferences
 *
 * This is a data/logic layer - actual rendering will be done by UI components.
 */

import type {
  PreferenceRule,
  PreferenceRuleType,
  PreferenceApplication,
  PreferenceDisplay,
} from '../types.js';

// =============================================================================
// Preference Rule Definitions
// =============================================================================

/**
 * Human-readable labels for preference rule types.
 */
export const PREFERENCE_TYPE_LABELS: Record<PreferenceRuleType, string> = {
  brand_preference: 'Brand Preference',
  category_exclusion: 'Category Exclusion',
  price_limit: 'Price Limit',
  quantity_default: 'Default Quantity',
  substitute_rule: 'Substitution Rule',
  timing_preference: 'Timing Preference',
  dietary_restriction: 'Dietary Restriction',
  quality_tier: 'Quality Tier',
};

/**
 * Icons for preference rule types (for UI rendering).
 */
export const PREFERENCE_TYPE_ICONS: Record<PreferenceRuleType, string> = {
  brand_preference: 'star',
  category_exclusion: 'ban',
  price_limit: 'euro',
  quantity_default: 'hash',
  substitute_rule: 'swap',
  timing_preference: 'clock',
  dietary_restriction: 'leaf',
  quality_tier: 'medal',
};

/**
 * Get display label for a preference type.
 */
export function getPreferenceTypeLabel(type: PreferenceRuleType): string {
  return PREFERENCE_TYPE_LABELS[type];
}

/**
 * Get icon for a preference type.
 */
export function getPreferenceTypeIcon(type: PreferenceRuleType): string {
  return PREFERENCE_TYPE_ICONS[type];
}

// =============================================================================
// Preference Rule Builder
// =============================================================================

/**
 * Builder class for constructing preference rules.
 */
export class PreferenceRuleBuilder {
  private id: string = '';
  private type: PreferenceRuleType = 'brand_preference';
  private name: string = '';
  private description: string = '';
  private active: boolean = true;
  private createdAt: Date = new Date();
  private lastApplied?: Date;
  private applicationCount: number = 0;
  private source: 'manual' | 'learned' = 'learned';
  private confidence?: number;

  /**
   * Set the rule ID.
   */
  withId(id: string): this {
    this.id = id;
    return this;
  }

  /**
   * Set the rule type.
   */
  ofType(type: PreferenceRuleType): this {
    this.type = type;
    return this;
  }

  /**
   * Set the rule name.
   */
  named(name: string): this {
    this.name = name;
    return this;
  }

  /**
   * Set the rule description.
   */
  describedAs(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Set whether the rule is active.
   */
  setActive(active: boolean): this {
    this.active = active;
    return this;
  }

  /**
   * Set when the rule was created.
   */
  createdOn(date: Date): this {
    this.createdAt = date;
    return this;
  }

  /**
   * Set when the rule was last applied.
   */
  lastAppliedOn(date: Date): this {
    this.lastApplied = date;
    return this;
  }

  /**
   * Set the application count.
   */
  appliedTimes(count: number): this {
    this.applicationCount = count;
    return this;
  }

  /**
   * Mark as manually created.
   */
  manual(): this {
    this.source = 'manual';
    return this;
  }

  /**
   * Mark as learned from history.
   */
  learned(confidence: number): this {
    this.source = 'learned';
    this.confidence = confidence;
    return this;
  }

  /**
   * Build the final PreferenceRule.
   */
  build(): PreferenceRule {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      description: this.description,
      active: this.active,
      createdAt: this.createdAt,
      lastApplied: this.lastApplied,
      applicationCount: this.applicationCount,
      source: this.source,
      confidence: this.confidence,
    };
  }
}

/**
 * Create a new preference rule builder.
 */
export function preferenceRuleBuilder(): PreferenceRuleBuilder {
  return new PreferenceRuleBuilder();
}

// =============================================================================
// Pre-built Preference Rules
// =============================================================================

/**
 * Create a brand preference rule.
 */
export function createBrandPreference(
  id: string,
  brandName: string,
  category: string,
  confidence: number
): PreferenceRule {
  return preferenceRuleBuilder()
    .withId(id)
    .ofType('brand_preference')
    .named(`Prefer ${brandName}`)
    .describedAs(`Prefer ${brandName} products in ${category} category`)
    .learned(confidence)
    .build();
}

/**
 * Create a category exclusion rule.
 */
export function createCategoryExclusion(
  id: string,
  category: string,
  reason: string
): PreferenceRule {
  return preferenceRuleBuilder()
    .withId(id)
    .ofType('category_exclusion')
    .named(`Exclude ${category}`)
    .describedAs(`Do not include ${category} items: ${reason}`)
    .manual()
    .build();
}

/**
 * Create a price limit rule.
 */
export function createPriceLimit(
  id: string,
  category: string,
  maxPrice: number
): PreferenceRule {
  return preferenceRuleBuilder()
    .withId(id)
    .ofType('price_limit')
    .named(`Max price for ${category}`)
    .describedAs(`Maximum price of ${maxPrice.toFixed(2)} for ${category} items`)
    .manual()
    .build();
}

/**
 * Create a default quantity rule.
 */
export function createQuantityDefault(
  id: string,
  productName: string,
  quantity: number,
  confidence: number
): PreferenceRule {
  return preferenceRuleBuilder()
    .withId(id)
    .ofType('quantity_default')
    .named(`${productName} quantity`)
    .describedAs(`Default quantity of ${quantity} for ${productName}`)
    .learned(confidence)
    .build();
}

/**
 * Create a dietary restriction rule.
 */
export function createDietaryRestriction(
  id: string,
  restriction: string,
  excludedIngredients: string[]
): PreferenceRule {
  return preferenceRuleBuilder()
    .withId(id)
    .ofType('dietary_restriction')
    .named(restriction)
    .describedAs(`Exclude products containing: ${excludedIngredients.join(', ')}`)
    .manual()
    .build();
}

// =============================================================================
// Preference Application Builder
// =============================================================================

/**
 * Builder for preference applications.
 */
export class PreferenceApplicationBuilder {
  private ruleId: string = '';
  private ruleName: string = '';
  private itemId: string = '';
  private itemName: string = '';
  private influence: string = '';
  private impactStrength: number = 0.5;

  /**
   * Set the rule reference.
   */
  forRule(rule: PreferenceRule): this {
    this.ruleId = rule.id;
    this.ruleName = rule.name;
    return this;
  }

  /**
   * Set the rule by ID and name.
   */
  forRuleId(ruleId: string, ruleName: string): this {
    this.ruleId = ruleId;
    this.ruleName = ruleName;
    return this;
  }

  /**
   * Set the item affected.
   */
  affectedItem(itemId: string, itemName: string): this {
    this.itemId = itemId;
    this.itemName = itemName;
    return this;
  }

  /**
   * Set how the preference influenced the decision.
   */
  withInfluence(influence: string): this {
    this.influence = influence;
    return this;
  }

  /**
   * Set the impact strength.
   */
  withImpact(strength: number): this {
    this.impactStrength = Math.max(0, Math.min(1, strength));
    return this;
  }

  /**
   * Build the PreferenceApplication.
   */
  build(): PreferenceApplication {
    return {
      ruleId: this.ruleId,
      ruleName: this.ruleName,
      itemId: this.itemId,
      itemName: this.itemName,
      influence: this.influence,
      impactStrength: this.impactStrength,
    };
  }
}

/**
 * Create a new preference application builder.
 */
export function preferenceApplicationBuilder(): PreferenceApplicationBuilder {
  return new PreferenceApplicationBuilder();
}

// =============================================================================
// Preference Display Builder
// =============================================================================

/**
 * Builder for creating preference displays.
 */
export class PreferenceDisplayBuilder {
  private activeRules: PreferenceRule[] = [];
  private appliedPreferences: PreferenceApplication[] = [];

  /**
   * Add an active rule.
   */
  addRule(rule: PreferenceRule): this {
    if (rule.active) {
      this.activeRules.push(rule);
    }
    return this;
  }

  /**
   * Add multiple rules.
   */
  addRules(rules: PreferenceRule[]): this {
    rules.filter((r) => r.active).forEach((r) => this.activeRules.push(r));
    return this;
  }

  /**
   * Record a preference application.
   */
  recordApplication(application: PreferenceApplication): this {
    this.appliedPreferences.push(application);
    return this;
  }

  /**
   * Record multiple applications.
   */
  recordApplications(applications: PreferenceApplication[]): this {
    applications.forEach((a) => this.appliedPreferences.push(a));
    return this;
  }

  /**
   * Build the PreferenceDisplay.
   */
  build(): PreferenceDisplay {
    const uniqueItems = new Set(this.appliedPreferences.map((a) => a.itemId));
    const uniqueRules = new Set(this.appliedPreferences.map((a) => a.ruleId));

    return {
      activeRules: this.activeRules,
      appliedPreferences: this.appliedPreferences,
      summary: {
        totalRules: this.activeRules.length,
        rulesApplied: uniqueRules.size,
        itemsAffected: uniqueItems.size,
      },
    };
  }
}

/**
 * Create a new preference display builder.
 */
export function preferenceDisplayBuilder(): PreferenceDisplayBuilder {
  return new PreferenceDisplayBuilder();
}

// =============================================================================
// Preference Formatting Utilities
// =============================================================================

/**
 * Format a preference rule for CLI display.
 */
export function formatPreferenceRuleCLI(rule: PreferenceRule): string {
  const status = rule.active ? '[Active]' : '[Inactive]';
  const source = rule.source === 'manual' ? 'Manual' : `Learned (${Math.round((rule.confidence ?? 0) * 100)}%)`;
  const applied = rule.applicationCount > 0 ? `Applied ${rule.applicationCount} times` : 'Never applied';

  return [
    `${status} ${rule.name}`,
    `  Type: ${getPreferenceTypeLabel(rule.type)}`,
    `  ${rule.description}`,
    `  Source: ${source} | ${applied}`,
  ].join('\n');
}

/**
 * Format a preference application for CLI display.
 */
export function formatApplicationCLI(application: PreferenceApplication): string {
  const impact = Math.round(application.impactStrength * 100);
  return `  - ${application.itemName}: ${application.influence} (${impact}% impact)`;
}

/**
 * Format the full preference display for CLI.
 */
export function formatPreferenceDisplayCLI(display: PreferenceDisplay): string {
  const lines: string[] = [];

  lines.push('=== Active Preferences ===');
  lines.push(`Total rules: ${display.summary.totalRules}`);
  lines.push(`Rules applied this run: ${display.summary.rulesApplied}`);
  lines.push(`Items affected: ${display.summary.itemsAffected}`);
  lines.push('');

  if (display.activeRules.length > 0) {
    lines.push('Rules:');
    display.activeRules.forEach((rule) => {
      lines.push(formatPreferenceRuleCLI(rule));
      lines.push('');
    });
  }

  if (display.appliedPreferences.length > 0) {
    lines.push('Applied to items:');
    display.appliedPreferences.forEach((app) => {
      lines.push(formatApplicationCLI(app));
    });
  }

  return lines.join('\n');
}

// =============================================================================
// Preference Filtering and Querying
// =============================================================================

/**
 * Filter preferences by type.
 */
export function filterByType(
  rules: PreferenceRule[],
  type: PreferenceRuleType
): PreferenceRule[] {
  return rules.filter((r) => r.type === type);
}

/**
 * Filter preferences by source.
 */
export function filterBySource(
  rules: PreferenceRule[],
  source: 'manual' | 'learned'
): PreferenceRule[] {
  return rules.filter((r) => r.source === source);
}

/**
 * Get high-confidence learned preferences.
 */
export function getHighConfidenceRules(
  rules: PreferenceRule[],
  threshold: number = 0.8
): PreferenceRule[] {
  return rules.filter(
    (r) => r.source === 'learned' && (r.confidence ?? 0) >= threshold
  );
}

/**
 * Get recently applied preferences.
 */
export function getRecentlyAppliedRules(
  rules: PreferenceRule[],
  withinDays: number = 30
): PreferenceRule[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - withinDays);

  return rules.filter(
    (r) => r.lastApplied && r.lastApplied >= cutoff
  );
}

/**
 * Get applications for a specific item.
 */
export function getApplicationsForItem(
  applications: PreferenceApplication[],
  itemId: string
): PreferenceApplication[] {
  return applications.filter((a) => a.itemId === itemId);
}

/**
 * Get applications for a specific rule.
 */
export function getApplicationsForRule(
  applications: PreferenceApplication[],
  ruleId: string
): PreferenceApplication[] {
  return applications.filter((a) => a.ruleId === ruleId);
}

// =============================================================================
// Mock Data for Development
// =============================================================================

/**
 * Create sample preference rules for development/testing.
 */
export function createSamplePreferenceRules(): PreferenceRule[] {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return [
    preferenceRuleBuilder()
      .withId('pref-001')
      .ofType('brand_preference')
      .named('Prefer Mimosa Milk')
      .describedAs('Prefer Mimosa brand for milk products')
      .learned(0.92)
      .createdOn(oneWeekAgo)
      .lastAppliedOn(now)
      .appliedTimes(15)
      .build(),

    preferenceRuleBuilder()
      .withId('pref-002')
      .ofType('quantity_default')
      .named('6x Milk')
      .describedAs('Default quantity of 6 for milk')
      .learned(0.85)
      .createdOn(oneWeekAgo)
      .lastAppliedOn(now)
      .appliedTimes(12)
      .build(),

    preferenceRuleBuilder()
      .withId('pref-003')
      .ofType('dietary_restriction')
      .named('Lactose-Free Options')
      .describedAs('Prefer lactose-free alternatives when available')
      .manual()
      .createdOn(oneWeekAgo)
      .appliedTimes(3)
      .build(),

    preferenceRuleBuilder()
      .withId('pref-004')
      .ofType('price_limit')
      .named('Wine Budget')
      .describedAs('Maximum price of 15.00 for wine')
      .manual()
      .createdOn(oneWeekAgo)
      .appliedTimes(2)
      .build(),
  ];
}

/**
 * Create sample preference applications.
 */
export function createSampleApplications(): PreferenceApplication[] {
  return [
    preferenceApplicationBuilder()
      .forRuleId('pref-001', 'Prefer Mimosa Milk')
      .affectedItem('item-001', 'Leite Mimosa Meio Gordo 1L')
      .withInfluence('Selected Mimosa brand over alternatives')
      .withImpact(0.9)
      .build(),

    preferenceApplicationBuilder()
      .forRuleId('pref-002', '6x Milk')
      .affectedItem('item-001', 'Leite Mimosa Meio Gordo 1L')
      .withInfluence('Set quantity to 6 based on usual pattern')
      .withImpact(0.85)
      .build(),

    preferenceApplicationBuilder()
      .forRuleId('pref-003', 'Lactose-Free Options')
      .affectedItem('item-002', 'Iogurte Natural sem Lactose')
      .withInfluence('Selected lactose-free variant')
      .withImpact(0.95)
      .build(),
  ];
}

// =============================================================================
// Re-exports
// =============================================================================

export type {
  PreferenceRule,
  PreferenceRuleType,
  PreferenceApplication,
  PreferenceDisplay,
};
