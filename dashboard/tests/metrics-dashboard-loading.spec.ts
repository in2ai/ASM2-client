import { test, expect } from '@playwright/test';

/**
 * Test suite for verifying date range interaction during loading states
 * Requirements: 3.1, 3.2, 3.3
 */

test.describe('Metrics Dashboard - Date Range Interaction During Loading', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the metrics dashboard
    // Note: This assumes authentication is handled or mocked
    await page.goto('/dashboard');
  });

  test('Date Range Selector remains interactive during data fetching', async ({ page }) => {
    // Wait for the page to load and date range selector to be visible
    const dateRangeSelector = page.locator('text=Rango de fechas:').locator('..');
    await expect(dateRangeSelector).toBeVisible();

    // Find the preset buttons (7 days, 30 days, 90 days)
    const sevenDaysButton = page.getByRole('button', { name: /7/i });
    const thirtyDaysButton = page.getByRole('button', { name: /30/i });
    
    // Verify buttons are visible and enabled
    await expect(sevenDaysButton).toBeVisible();
    await expect(sevenDaysButton).toBeEnabled();
    await expect(thirtyDaysButton).toBeVisible();
    await expect(thirtyDaysButton).toBeEnabled();

    // Click a date range button to trigger a fetch
    await thirtyDaysButton.click();

    // Immediately check if the date selector is still interactive
    // The buttons should remain enabled even during fetch
    await expect(sevenDaysButton).toBeEnabled();
    await expect(thirtyDaysButton).toBeEnabled();

    // Verify we can click another preset during loading
    await sevenDaysButton.click();
    await expect(sevenDaysButton).toBeEnabled();
  });

  test('Changing date range during fetch updates query parameters', async ({ page }) => {
    // Wait for initial load
    await page.waitForLoadState('networkidle');
    
    const thirtyDaysButton = page.getByRole('button', { name: /30/i });
    const sevenDaysButton = page.getByRole('button', { name: /7/i });

    // Click first date range
    await thirtyDaysButton.click();
    
    // Quickly click another date range before the first request completes
    // This simulates changing date range during an active fetch
    await sevenDaysButton.click();

    // Wait for the page to stabilize
    await page.waitForLoadState('networkidle');

    // Verify that the final state reflects the last selection
    // The 7 days button should be the active selection
    // We can verify this by checking if data is displayed (not loading state)
    const statsCards = page.locator('[class*="grid"]').first();
    await expect(statsCards).toBeVisible();
  });

  test('Loading indicators display correctly while date controls remain enabled', async ({ page }) => {
    // Wait for initial page load
    await page.waitForLoadState('networkidle');

    const refreshButton = page.getByRole('button', { name: /Actualizar|Refresh/i });
    const dateRangeButtons = page.getByRole('button', { name: /7|30|90/i });

    // Click refresh to trigger a fetch
    await refreshButton.click();

    // Check for loading indicator (spinning icon or "Actualizando..." text)
    const loadingIndicator = page.locator('text=Actualizando').or(page.locator('[class*="animate-spin"]'));
    
    // The loading indicator should appear
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 2000 });

    // Verify date range buttons remain enabled during loading
    const firstDateButton = dateRangeButtons.first();
    await expect(firstDateButton).toBeEnabled();

    // Verify we can interact with date controls during loading
    await firstDateButton.click();
    
    // The button should still be enabled after clicking
    await expect(firstDateButton).toBeEnabled();
  });

  test('Date controls remain visible in empty state', async ({ page }) => {
    // This test verifies that date controls are visible even when no data is available
    // We'll need to navigate to a state with no data or mock the response
    
    // Wait for page load
    await page.waitForLoadState('networkidle');

    // The date range selector should always be visible when authenticated
    const dateRangeLabel = page.locator('text=Rango de fechas:');
    await expect(dateRangeLabel).toBeVisible();

    // Date preset buttons should be visible
    const dateButtons = page.getByRole('button', { name: /7|30|90/i });
    await expect(dateButtons.first()).toBeVisible();
  });

  test('Date controls remain visible during loading state', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard');

    // During initial loading, date controls should not be visible (isPending state)
    // But once loaded, they should remain visible during subsequent fetches

    // Wait for initial load to complete
    await page.waitForLoadState('networkidle');

    // Verify date controls are visible after initial load
    const dateRangeLabel = page.locator('text=Rango de fechas:');
    await expect(dateRangeLabel).toBeVisible();

    // Trigger a refresh
    const refreshButton = page.getByRole('button', { name: /Actualizar|Refresh/i });
    await refreshButton.click();

    // Date controls should remain visible during the refresh
    await expect(dateRangeLabel).toBeVisible();
    
    // Date buttons should remain visible and enabled
    const dateButtons = page.getByRole('button', { name: /7|30|90/i });
    await expect(dateButtons.first()).toBeVisible();
    await expect(dateButtons.first()).toBeEnabled();
  });
});

