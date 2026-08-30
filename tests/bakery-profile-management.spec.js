import { test, expect } from '@playwright/test';
import { openFirstBakeryProfile, tinyPngFile } from './utils/preorders.js';

// Backfills the manually-verified checklists for two small clusters that
// both live on the bakery profile/edit UI:
// - Bakery-profile-modal internals (toggleBakeryHours)
// - BUSINESS — BAKERY PAGE MANAGEMENT (openBakeryEditModal/
//   handleBakeryEditPhoto/saveBakeryPage, reached from Settings' Business
//   section)
//
// saveBakeryPage's real click isn't exercised: it writes real content
// (blurb/website/instagram/cover photo) to a real bakery's public page in
// the target Firebase project — not something to fire against real data in
// an automated run, even though the form starts pre-filled with that
// bakery's own current values (a no-op save would still touch `ownedBy`/
// `updatedAt`). Its data-onclick wiring is asserted directly instead, same
// approach as handleBuy/promoteUser elsewhere in this suite.

async function gotoSettings(page) {
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Settings' }).click();
  await expect(page.locator('#page-settings')).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('toggling opening hours expands and collapses the list', async ({ page }) => {
  await openFirstBakeryProfile(page);
  const toggle = page.locator('[data-onclick="toggleBakeryHours"]');
  test.skip(
    (await toggle.count()) === 0,
    'No bakery in the target project is showing opening hours — likely the documented Google Places 403 issue (see CLAUDE.md), not this cluster.'
  );

  const list = page.locator('.bakery-hours-list');
  await expect(list).not.toHaveClass(/open/);
  await toggle.click();
  await expect(list).toHaveClass(/open/);
  await toggle.click();
  await expect(list).not.toHaveClass(/open/);
});

test('Edit page (from Settings\' Business section) opens pre-filled, previews a new photo locally, and Cancel discards without saving', async ({ page }) => {
  // Phase 1 residual #3 made loadData() build allBakeries on every run, so
  // renderBusinessSection() (Settings) is populated on a cold session now —
  // the dedicated tests/data-reconcile.spec.js covers that directly. This
  // pre-visit is no longer needed for correctness; kept as a reliable
  // "app is ready" wait (openFirstBakeryProfile waits for #recentGrid).
  await openFirstBakeryProfile(page);
  await page.locator('[data-onclick="closeBakeryModal"]').first().click();
  await gotoSettings(page);

  let isBusinessAccount = true;
  try {
    await expect(page.locator('#settingsBusinessCard')).toBeVisible({ timeout: 5_000 });
  } catch {
    isBusinessAccount = false;
  }
  test.skip(!isBusinessAccount, 'Signed-in test account has no bakery assigned and is not an admin — Business section is not shown.');

  const editBtn = page.locator('#settingsBusinessBody [data-onclick="openBakeryEditModal"]').first();
  test.skip((await editBtn.count()) === 0, 'No bakeries assigned to manage.');
  const bakeryName = JSON.parse(await editBtn.getAttribute('data-args'))[0];

  await editBtn.click();
  await expect(page.locator('#bakeryEditModal')).toHaveClass(/open/);
  await expect(page.locator('#bakeryEditModalTitle')).toHaveText(bakeryName);

  // Fields are pre-filled from the bakery's real current data — just
  // confirm the form actually loaded (not left blank/stuck).
  await expect(page.locator('#bakeryEditBlurb')).toBeVisible();
  await expect(page.locator('#bakeryEditWebsite')).toBeVisible();
  await expect(page.locator('#bakeryEditInstagram')).toBeVisible();

  // Photo change only updates the local preview until Save is clicked —
  // safe to exercise for real. Covers both render branches (no cover photo
  // yet vs. an existing one, whose "Change photo" input isn't inside
  // #bakeryEditPhotoWrap itself).
  const photoInput = page.locator('#bakeryEditModalBody input[type="file"]').first();
  await photoInput.setInputFiles(tinyPngFile());
  await expect(page.locator('#bakeryEditPhotoWrap img')).toBeVisible();

  const saveBtn = page.locator('[data-onclick="saveBakeryPage"]');
  await expect(saveBtn).toBeVisible();

  await page.locator('[data-onclick="closeBakeryEditModal"]').first().click();
  await expect(page.locator('#bakeryEditModal')).not.toHaveClass(/open/);
});
