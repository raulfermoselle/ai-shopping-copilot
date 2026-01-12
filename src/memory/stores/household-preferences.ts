import {
  HouseholdPreferences,
  HouseholdPreferencesSchema,
  createEmptyHouseholdPreferences,
  BrandPreference,
  Allergy,
  DietaryRestriction,
} from '../types.js';
import { BaseStore, BaseStoreConfig } from './base-store.js';

// ============================================================================
// Household Preferences Store
// ============================================================================

export class HouseholdPreferencesStore extends BaseStore<typeof HouseholdPreferencesSchema> {
  constructor(config: Omit<BaseStoreConfig, 'fileName'>) {
    super(
      { ...config, fileName: 'household-preferences.json' },
      HouseholdPreferencesSchema
    );
  }

  protected createEmpty(): HouseholdPreferences {
    return createEmptyHouseholdPreferences(this.householdId);
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get all preferences.
   */
  async getPreferences(): Promise<HouseholdPreferences> {
    await this.ensureLoaded();
    return this.getData();
  }

  /**
   * Get dietary restrictions.
   */
  async getDietaryRestrictions(): Promise<DietaryRestriction[]> {
    await this.ensureLoaded();
    return this.getData().dietaryRestrictions;
  }

  /**
   * Get allergies.
   */
  async getAllergies(): Promise<Allergy[]> {
    await this.ensureLoaded();
    return this.getData().allergies;
  }

  /**
   * Get brand preferences.
   */
  async getBrandPreferences(): Promise<BrandPreference[]> {
    await this.ensureLoaded();
    return this.getData().brandPreferences;
  }

  /**
   * Get preference for a specific brand.
   */
  async getBrandPreference(brand: string): Promise<BrandPreference | null> {
    await this.ensureLoaded();
    const prefs = this.getData().brandPreferences;
    return prefs.find((p) => p.brand.toLowerCase() === brand.toLowerCase()) || null;
  }

  /**
   * Check if a brand should be avoided.
   */
  async shouldAvoidBrand(brand: string): Promise<boolean> {
    const pref = await this.getBrandPreference(brand);
    return pref?.preference === 'avoid';
  }

  /**
   * Check if a brand is preferred.
   */
  async isPreferredBrand(brand: string): Promise<boolean> {
    const pref = await this.getBrandPreference(brand);
    return pref?.preference === 'preferred';
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Add a dietary restriction.
   */
  async addDietaryRestriction(restriction: DietaryRestriction): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    if (!data.dietaryRestrictions.includes(restriction)) {
      data.dietaryRestrictions.push(restriction);
      await this.save();
    }
  }

  /**
   * Remove a dietary restriction.
   */
  async removeDietaryRestriction(restriction: DietaryRestriction): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    const index = data.dietaryRestrictions.indexOf(restriction);

    if (index !== -1) {
      data.dietaryRestrictions.splice(index, 1);
      await this.save();
    }
  }

  /**
   * Add an allergy.
   */
  async addAllergy(allergy: Allergy): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    // Check if already exists
    const exists = data.allergies.some(
      (a) => a.allergen.toLowerCase() === allergy.allergen.toLowerCase()
    );

    if (!exists) {
      data.allergies.push(allergy);
      await this.save();
    }
  }

  /**
   * Remove an allergy.
   */
  async removeAllergy(allergen: string): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    const index = data.allergies.findIndex(
      (a) => a.allergen.toLowerCase() === allergen.toLowerCase()
    );

    if (index !== -1) {
      data.allergies.splice(index, 1);
      await this.save();
    }
  }

  /**
   * Update allergy severity.
   */
  async updateAllergySeverity(
    allergen: string,
    severity: Allergy['severity']
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    const allergy = data.allergies.find(
      (a) => a.allergen.toLowerCase() === allergen.toLowerCase()
    );

    if (allergy) {
      allergy.severity = severity;
      await this.save();
    }
  }

  /**
   * Set brand preference.
   */
  async setBrandPreference(
    brand: string,
    preference: BrandPreference['preference'],
    reason?: string
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();

    // Find existing preference
    const existingIndex = data.brandPreferences.findIndex(
      (p) => p.brand.toLowerCase() === brand.toLowerCase()
    );

    const brandPref: BrandPreference = {
      brand,
      preference,
      reason,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex !== -1) {
      data.brandPreferences[existingIndex] = brandPref;
    } else {
      data.brandPreferences.push(brandPref);
    }

    await this.save();
  }

  /**
   * Remove brand preference.
   */
  async removeBrandPreference(brand: string): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    const index = data.brandPreferences.findIndex(
      (p) => p.brand.toLowerCase() === brand.toLowerCase()
    );

    if (index !== -1) {
      data.brandPreferences.splice(index, 1);
      await this.save();
    }
  }

  /**
   * Update budget constraints.
   */
  async updateBudgetConstraints(
    constraints: HouseholdPreferences['budgetConstraints']
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    data.budgetConstraints = constraints;
    await this.save();
  }

  /**
   * Update quality preferences.
   */
  async updateQualityPreferences(
    preferences: HouseholdPreferences['qualityPreferences']
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    data.qualityPreferences = preferences;
    await this.save();
  }

  /**
   * Update delivery preferences.
   */
  async updateDeliveryPreferences(
    preferences: HouseholdPreferences['deliveryPreferences']
  ): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    data.deliveryPreferences = preferences;
    await this.save();
  }

  /**
   * Set notes.
   */
  async setNotes(notes: string): Promise<void> {
    await this.ensureLoaded();
    const data = this.getData();
    data.notes = notes;
    await this.save();
  }
}
