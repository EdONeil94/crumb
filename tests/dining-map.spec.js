import { test, expect } from '@playwright/test';

// Backfills the manually-verified DINING MAP checklist (switchDmTab — the
// profile modal's My Map tab's Bakes/Cities/Countries stat toggle). The
// map itself (real Leaflet + real OpenStreetMap/CARTO tiles, loaded from
// unpkg.com) isn't this cluster's concern and isn't asserted on here — see
// CLAUDE.md's people-filters.spec.js note on why that tab's own loading
// spinner needs a visibility check, not a "removed from the DOM" one.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });

  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  await page.locator('.profile-tab', { hasText: 'My Map' }).click();
  await expect(page.locator('#profileTabContent .spinner').first()).not.toBeVisible({ timeout: 10_000 });
});

test('Bakes is selected by default', async ({ page }) => {
  const bakesTab = page.locator('.dm-stat-tab', { hasText: 'Bakes' });
  // The initial static markup's "active" font-weight (600, `.active` class
  // plus an inline style) doesn't match what switchDmTab() itself sets on
  // click (700, no class involved at all — it's pure inline-style
  // manipulation) — a pre-existing inconsistency, not something this
  // cluster's conversion changed. This checks the untouched initial state;
  // the next test checks post-click states, which do use 700.
  await expect(bakesTab).toHaveClass(/active/);
  await expect(bakesTab).toHaveCSS('font-weight', '600');
  await expect(page.locator('#dmStatContent')).not.toBeEmpty();
});

test('switching to Cities and Countries updates the active tab and its stats', async ({ page }) => {
  const bakesTab = page.locator('.dm-stat-tab', { hasText: 'Bakes' });
  const citiesTab = page.locator('.dm-stat-tab', { hasText: 'Cities' });
  const countriesTab = page.locator('.dm-stat-tab', { hasText: 'Countries' });

  await citiesTab.click();
  await expect(citiesTab).toHaveCSS('font-weight', '700');
  await expect(bakesTab).toHaveCSS('font-weight', '500');
  // Either real rows ("N cities visited") or the empty state ("No data
  // yet") — either proves the switch actually re-rendered, rather than
  // still showing the Bakes tab's own content.
  await expect(page.locator('#dmStatContent')).toContainText(/cities visited|No data yet/);

  await countriesTab.click();
  await expect(countriesTab).toHaveCSS('font-weight', '700');
  await expect(citiesTab).toHaveCSS('font-weight', '500');
  await expect(page.locator('#dmStatContent')).toContainText(/countries visited|No data yet/);

  await bakesTab.click();
  await expect(bakesTab).toHaveCSS('font-weight', '700');
  await expect(countriesTab).toHaveCSS('font-weight', '500');
  await expect(page.locator('#dmStatContent')).toContainText(/bakes rated|No data yet/);
});
