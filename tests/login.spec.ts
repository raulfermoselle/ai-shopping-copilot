import { test, expect } from '@playwright/test';

/**
 * Login Page Structure Tests
 *
 * Validates login page elements exist without performing actual authentication.
 * Real login testing should be done manually with headed browser.
 */
test.describe('Auchan.pt Login Page', () => {
  test('should have account/login navigation', async ({ page }) => {
    await page.goto('/');

    // Look for login entry point
    const loginEntry = page.locator(
      'a[href*="login"], a[href*="conta"], button:has-text("Entrar"), .auc-header__account'
    ).first();

    await expect(loginEntry).toBeVisible({ timeout: 15000 });
  });

  test('login form should have email and password fields', async ({ page }) => {
    await page.goto('/');

    // Navigate to login
    const loginEntry = page.locator(
      'a[href*="login"], a[href*="conta"], button:has-text("Entrar"), .auc-header__account'
    ).first();
    await loginEntry.click();

    // Verify form fields exist
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
  });
});
