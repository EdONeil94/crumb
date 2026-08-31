import { test, expect } from '@playwright/test';

// Signing out must land the user back on #page-home — from whatever page
// they were on, including signed-in-only ones (Settings, the admin panel,
// the feed), which would otherwise sit there showing stale data with no
// way back once updateNav() hides their nav buttons.
// Handlers: signOutFromAvatarMenu / signOutFromMobileMenu (src/components/nav.js).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js',
  ).toBeVisible({ timeout: 15_000 });
});

test('avatar-dropdown sign-out from Settings redirects to home', async ({ page }) => {
  await page.evaluate(() => window.showPage('settings'));
  await expect(page.locator('#page-settings')).toHaveClass(/active/);

  await page.locator('#navAvatar').click();
  await page.locator('#avatarDropdown [data-onclick="signOutFromAvatarMenu"]').click();

  await expect(page.locator('#page-home')).toHaveClass(/active/, { timeout: 10_000 });
  await expect(page.locator('#page-settings')).not.toHaveClass(/active/);
  await expect(page.locator('#navAvatar')).toBeHidden();
  await expect(page.locator('#signInBtn')).toBeVisible();
});

test('mobile-menu sign-out from Settings redirects to home', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.showPage('settings'));
  await expect(page.locator('#page-settings')).toHaveClass(/active/);

  await page.locator('#hamburgerBtn').click();
  await page.locator('#mobileSignOutBtn').click();

  await expect(page.locator('#page-home')).toHaveClass(/active/, { timeout: 10_000 });
  await expect(page.locator('#page-settings')).not.toHaveClass(/active/);
  await expect(page.locator('#navAvatar')).toBeHidden();
});
