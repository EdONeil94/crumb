import { test, expect } from '@playwright/test';
import { addReview } from './utils/reviews.js';

// Backfills the manually-verified checklists for the "Rate a Bake!" review
// creation modal's remaining raw-handler clusters:
// - MODAL STEPS (goToStep/modalNext/modalBack — step navigation/validation)
// - ADD ITEM MODAL (photoInput -> handlePhotoChange, per-dimension rating
//   sliders -> updateDimDisplay)
// - ITEM MATCHING (searchExistingItems/selectItemMatch/createNewItem/
//   clearItemMatch)
// tests/utils/reviews.js's addReview() already drives this modal end-to-end
// for other specs' setup needs, but doesn't exercise photo upload, step
// validation, Back navigation, or item matching — this spec covers those.

async function deleteViaEdit(page, card) {
  await card.locator('.card-image').click();
  await page.locator('[data-onclick="closeDetailModal,openEditModal"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-onclick="deleteReview"]').click();
  await expect(page.locator('#editModal')).not.toHaveClass(/open/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('Next is blocked with a toast at each step until that step is valid, and Back returns to the previous step', async ({ page }) => {
  await page.locator('#addBtn').click();
  await expect(page.locator('#addModal')).toHaveClass(/open/);
  await expect(page.locator('#backBtn')).toBeHidden();

  // Step 1: no bakery selected yet.
  await page.locator('#nextBtn').click();
  await expect(page.locator('#toast')).toHaveClass(/show/);
  await expect(page.locator('#toast')).toHaveText('Please select a bakery first');
  await expect(page.locator('#step1')).toHaveClass(/active/);

  const bakeryName = `E2E Flow Bakery ${Date.now()}`;
  await page.locator('#bakerySearch').fill(bakeryName);
  await page.evaluate((n) => window.selectManualBakery(n), bakeryName);
  await page.locator('#nextBtn').click();
  await expect(page.locator('#step2')).toHaveClass(/active/);
  await expect(page.locator('#backBtn')).toBeVisible();

  // Step 2: no name yet.
  await page.locator('#nextBtn').click();
  await expect(page.locator('#toast')).toHaveText('Please enter a name for your bake');
  await expect(page.locator('#step2')).toHaveClass(/active/);

  await page.locator('#itemName').fill(`E2E Flow Item ${Date.now()}`);
  // Name filled but no category yet.
  await page.locator('#nextBtn').click();
  await expect(page.locator('#toast')).toHaveText('Please select a category');
  await expect(page.locator('#step2')).toHaveClass(/active/);

  await page.locator('.category-chip', { hasText: 'Bread' }).first().click();
  await page.locator('#nextBtn').click();
  await expect(page.locator('#step3')).toHaveClass(/active/);

  // Step 3: no rating yet.
  await page.locator('#nextBtn').click();
  await expect(page.locator('#toast')).toHaveText('Please give an overall rating');
  await expect(page.locator('#step3')).toHaveClass(/active/);

  // Back navigation returns to step 2 without losing the filled name.
  await page.locator('#backBtn').click();
  await expect(page.locator('#step2')).toHaveClass(/active/);
  await expect(page.locator('#itemName')).not.toHaveValue('');

  await page.locator('[data-onclick="closeAddModal"]').click();
  await expect(page.locator('#addModal')).not.toHaveClass(/open/);
});

test('choosing a photo shows a preview, and a per-dimension rating slider updates its own live display', async ({ page }) => {
  await page.locator('#addBtn').click();
  const bakeryName = `E2E Flow Bakery ${Date.now()}`;
  await page.locator('#bakerySearch').fill(bakeryName);
  await page.evaluate((n) => window.selectManualBakery(n), bakeryName);
  await page.locator('#nextBtn').click();
  await expect(page.locator('#step2')).toHaveClass(/active/);

  const photoInput = page.locator('#photoInput');
  await photoInput.setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    ),
  });
  await expect(page.locator('.photo-preview')).toBeVisible();
  await page.locator('[data-onclick="removePhoto"]').click();
  await expect(page.locator('.photo-preview')).toHaveCount(0);

  await page.locator('.category-chip', { hasText: 'Bread' }).first().click();
  const displayEl = page.locator('.tasting-dim-row .tasting-dim-val').first();
  const slider = page.locator('.tasting-dim-row .rating-slider').first();
  await expect(displayEl).toHaveText('–');
  await slider.evaluate((el) => {
    el.value = '3.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(displayEl).toHaveText('3.5');

  await page.locator('[data-onclick="closeAddModal"]').click();
});

test('typing a name that matches an existing item shows it, selecting it pre-fills the form, and "New item" clears the match', async ({ page }) => {
  const name = `E2E Flow Match ${Date.now()}`;
  const bakeryName = `E2E Flow Match Bakery ${Date.now()}`;
  const { card } = await addReview(page, { name, bakeryName, category: 'Bread' });

  await page.locator('#addBtn').click();
  await page.locator('#bakerySearch').fill(bakeryName);
  await page.evaluate((n) => window.selectManualBakery(n), bakeryName);
  await page.locator('#nextBtn').click();
  await expect(page.locator('#step2')).toHaveClass(/active/);

  await page.locator('#itemName').fill(name);
  const match = page.locator('.item-match-result').filter({ hasText: name }).first();
  await expect(match).toBeVisible();

  await match.click();
  await expect(page.locator('#itemMatchSelected')).toBeVisible();
  await expect(page.locator('#matchedItemName')).toHaveText(name);
  await expect(page.locator('#categoryGroup')).toBeHidden();

  await page.locator('[data-onclick="clearItemMatch"]').click();
  await expect(page.locator('#itemMatchSelected')).toBeHidden();
  await expect(page.locator('#categoryGroup')).toBeVisible();
  await expect(page.locator('#itemName')).toHaveValue('');

  await page.locator('[data-onclick="closeAddModal"]').click();
  await deleteViaEdit(page, card);
});
