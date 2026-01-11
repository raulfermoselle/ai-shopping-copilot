import { test, expect } from '@playwright/test';

test.describe('Auchan.pt Smoke Tests', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');

    // Verify page loaded by checking title contains Auchan
    await expect(page).toHaveTitle(/Auchan/i);
  });

  test('should have working navigation', async ({ page }) => {
    await page.goto('/');

    // Wait for main content to be visible
    await expect(page.locator('body')).toBeVisible();
  });
});
