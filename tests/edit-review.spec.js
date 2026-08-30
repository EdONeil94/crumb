import { test, expect } from './utils/reviews.js';

// Backfills the manually-verified EDIT REVIEW checklist (openEditModal/
// saveEdit/deleteReview and the modal's own live-update sliders + category
// select). Each test creates its throwaway review via the createReview
// fixture (auto-deleted on teardown — see tests/utils/reviews.js) and also
// deletes it inline as part of / for coverage of the delete flow.

async function openEditFromDetail(page, card) {
  await card.locator('.card-image').click();
  await expect(page.locator('#detailModal')).toHaveClass(/open/);
  await page.locator('[data-onclick="closeDetailModal,openEditModal"]').click();
  await expect(page.locator('#editModal')).toHaveClass(/open/);
  await expect(page.locator('#detailModal')).not.toHaveClass(/open/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('opening Edit prefills the form; Cancel discards changes', async ({ page, createReview }) => {
  const name = `E2E Edit Review ${Date.now()}`;
  const bakeryName = `E2E Edit Bakery ${Date.now()}`;
  const { card } = await createReview({ name, bakeryName, notes: 'Original notes' });

  await openEditFromDetail(page, card);
  await expect(page.locator('#editName')).toHaveValue(name);
  await expect(page.locator('#editNotes')).toHaveValue('Original notes');
  await expect(page.locator('#editCategory')).toHaveValue('bread');

  await page.locator('#editName').fill(`${name} (unsaved edit)`);
  await page.locator('[data-onclick="closeEditModal"]', { hasText: 'Cancel' }).click();
  await expect(page.locator('#editModal')).not.toHaveClass(/open/);

  await openEditFromDetail(page, card);
  await expect(page.locator('#editName')).toHaveValue(name);

  // Cleanup.
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-onclick="deleteReview"]').click();
  await expect(page.locator('#editModal')).not.toHaveClass(/open/);
});

test('rating sliders update their own live display value', async ({ page, createReview }) => {
  const name = `E2E Edit Sliders ${Date.now()}`;
  const bakeryName = `E2E Edit Bakery ${Date.now()}`;
  const { card } = await createReview({ name, bakeryName, rating: 3 });

  await openEditFromDetail(page, card);
  await expect(page.locator('#editOverallDisplay')).toHaveText('3.0');

  await page.locator('#editOverallRating').evaluate(el => {
    el.value = '4.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#editOverallDisplay')).toHaveText('4.5');

  // Scoped to #editModalBody — the Add Item modal's own #tastingDims wrapper
  // also carries the "tasting-dims" class, so an unscoped locator can match
  // its (present-but-hidden) sliders instead of the Edit modal's.
  const dimSlider = page.locator('#editModalBody .tasting-dims input[type="range"]').first();
  const dimId = await dimSlider.getAttribute('id');
  const displayId = dimId.replace('edit_', 'edit_display_');
  await dimSlider.evaluate(el => {
    el.value = '2.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator(`#${displayId}`)).toHaveText('2.5');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-onclick="deleteReview"]').click();
});

test('changing category repopulates the subcategory options', async ({ page, createReview }) => {
  const name = `E2E Edit Category ${Date.now()}`;
  const bakeryName = `E2E Edit Bakery ${Date.now()}`;
  const { card } = await createReview({ name, bakeryName, category: 'Bread' });

  await openEditFromDetail(page, card);
  const breadSubOptions = await page.locator('#editSubCategory option').allTextContents();
  expect(breadSubOptions).toContain('Sourdough');

  await page.locator('#editCategory').selectOption('pastry');
  const pastrySubOptions = await page.locator('#editSubCategory option').allTextContents();
  expect(pastrySubOptions).toContain('Croissant');
  expect(pastrySubOptions).not.toContain('Sourdough');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-onclick="deleteReview"]').click();
});

test('saving changes updates the review and shows it in the recent grid', async ({ page, createReview }) => {
  const name = `E2E Edit Save ${Date.now()}`;
  const updatedName = `${name} (edited)`;
  const bakeryName = `E2E Edit Bakery ${Date.now()}`;
  const { card } = await createReview({ name, bakeryName });

  await openEditFromDetail(page, card);
  await page.locator('#editName').fill(updatedName);
  await page.locator('#editNotes').fill('Updated notes');
  await page.locator('[data-onclick="saveEdit"]').click();
  await expect(page.locator('#editModal')).not.toHaveClass(/open/, { timeout: 10_000 });

  const updatedCard = page.locator('#recentGrid .card').filter({ hasText: updatedName }).first();
  await expect(updatedCard).toBeVisible({ timeout: 10_000 });

  // Cleanup.
  await updatedCard.locator('.card-image').click();
  await page.locator('[data-onclick="closeDetailModal,openEditModal"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-onclick="deleteReview"]').click();
  await expect(page.locator('#editModal')).not.toHaveClass(/open/);
});

test('deleting a review removes it after confirming the browser prompt', async ({ page, createReview }) => {
  const name = `E2E Edit Delete ${Date.now()}`;
  const bakeryName = `E2E Edit Bakery ${Date.now()}`;
  const { card } = await createReview({ name, bakeryName });

  await openEditFromDetail(page, card);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-onclick="deleteReview"]').click();
  await expect(page.locator('#editModal')).not.toHaveClass(/open/);

  await expect(page.locator('#recentGrid .card').filter({ hasText: name })).toHaveCount(0);
});
