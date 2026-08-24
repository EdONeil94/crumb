import { test, expect } from '@playwright/test';
import { tinyPngFile } from './utils/preorders.js';

// Backfills the manually-verified IMAGE COMPRESSION checklist (removePhoto/
// handlePhotoChange, in the "Rate a Bake!" modal's step 2). That cluster's
// section in src/legacy-app.js also contains the category-chip picker (by
// file position, not topic — no section header of its own), covered here
// too: selectParentCategory/clearParentCategory/selectSubCategory.
//
// These tests don't submit the review (no addReview() call, no cleanup
// needed) — they only exercise step 2's own UI in isolation.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });

  await page.locator('#addBtn').click();
  await expect(page.locator('#addModal')).toHaveClass(/open/);
  // Step 1 needs a bakery selected before Next will advance — these tests
  // never reach Save, so the actual name doesn't matter.
  await page.evaluate(n => window.selectManualBakery(n), `E2E Photo Cat Bakery ${Date.now()}`);
  await page.locator('#nextBtn').click();
  await expect(page.locator('#step2')).toHaveClass(/active/);
});

test('choosing a photo shows a preview; Remove goes back to upload, and a second photo still works', async ({ page }) => {
  const wrap = page.locator('#photoUploadWrap');

  // First upload goes through ADD ITEM MODAL's own (still-raw) file input —
  // this just gets the form into the "preview shown" state.
  await wrap.locator('#photoInput').setInputFiles(tinyPngFile());
  await expect(wrap.locator('.photo-preview img')).toBeVisible();

  // removePhoto (this cluster, now delegated) rebuilds the upload area —
  // including a fresh #photoInput wired the same way.
  await wrap.locator('[data-onclick="removePhoto"]').click();
  await expect(wrap.locator('.photo-preview')).toHaveCount(0);
  await expect(wrap.locator('#photoInput')).toHaveAttribute('data-onchange', 'handlePhotoChange');

  // Uploading through that rebuilt input proves handlePhotoChange's
  // delegated registration actually works, not just its still-raw
  // ADD ITEM MODAL call site.
  await wrap.locator('#photoInput').setInputFiles(tinyPngFile());
  await expect(wrap.locator('.photo-preview img')).toBeVisible();
});

test('selecting a category collapses the chip list and shows subcategories', async ({ page }) => {
  const parentChips = page.locator('#categoryParentChips');
  await parentChips.locator('.category-chip', { hasText: 'Bread' }).click();

  await expect(parentChips.locator('.category-chip.selected')).toContainText('Bread');
  await expect(parentChips.locator('.category-chip')).toHaveCount(1);

  const subChips = page.locator('#categorySubChips');
  await expect(subChips).toBeVisible();
  await expect(subChips.locator('.category-chip', { hasText: 'Sourdough' })).toBeVisible();
});

test('selecting a subcategory marks it selected', async ({ page }) => {
  await page.locator('#categoryParentChips').locator('.category-chip', { hasText: 'Pastry' }).click();
  const subChips = page.locator('#categorySubChips');
  const croissant = subChips.locator('.category-chip', { hasText: 'Croissant' });
  await croissant.click();
  await expect(croissant).toHaveClass(/selected/);
});

test('the ✕ on a selected category clears it back to the full chip list', async ({ page }) => {
  const parentChips = page.locator('#categoryParentChips');
  await parentChips.locator('.category-chip', { hasText: 'Cake' }).click();
  await expect(parentChips.locator('.category-chip')).toHaveCount(1);

  await parentChips.locator('[data-onclick="clearParentCategory"]').click();
  const fullCount = await parentChips.locator('.category-chip').count();
  expect(fullCount).toBeGreaterThan(1);
  await expect(page.locator('#categorySubChips')).toBeHidden();
});
