import { test, expect } from '@playwright/test';
import { openFirstBakeryProfile, tinyPngFile } from './utils/preorders.js';

// Backfills the manually-verified SHOP MANAGEMENT (business users) checklist
// (renderManageShop, reached via the bakery profile's "Manage shop" button)
// and the ADD/EDIT PRODUCT modal it opens into (openProductModal/
// handleProductPhoto/saveProduct/deleteProduct) — converted together since
// the product modal is only ever reached from the shop manager.
//
// saveProduct/deleteProduct are NOT clicked for real: they write to / delete
// from a real bakery's public shop in the target Firebase project, even
// though the Edit form starts pre-filled with the product's own current
// values — same reasoning as saveBakeryPage in
// tests/bakery-profile-management.spec.js. Their data-onclick wiring is
// asserted directly instead.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

async function openManageShop(page, bakeryName) {
  const manageBtn = page.locator('#bakeryModal [data-onclick="closeBakeryModal,openManageShopModal"]');
  test.skip(
    (await manageBtn.count()) === 0,
    `"Manage shop" isn't visible for "${bakeryName}" — the signed-in test account needs to be the super-admin account or this bakery's owner.`
  );
  await manageBtn.click();
  await expect(page.locator('#manageShopModal')).toHaveClass(/open/);
}

test('Manage shop lists owned products; + Add product opens a blank Add form', async ({ page }) => {
  const bakeryName = await openFirstBakeryProfile(page);
  await openManageShop(page, bakeryName);

  const addBtn = page.locator('#manageShopBody [data-onclick="openProductModal"]').first();
  await expect(addBtn).toBeVisible();
  const addArgs = JSON.parse(await addBtn.getAttribute('data-args'));
  expect(addArgs).toEqual([null, bakeryName]);

  await addBtn.click();
  await expect(page.locator('#productModal')).toHaveClass(/open/);
  await expect(page.locator('#productModalTitle')).toHaveText('Add product');
  await expect(page.locator('#productName')).toHaveValue('');
  await expect(page.locator('#productDeleteBtn')).not.toBeVisible();

  const saveBtn = page.locator('[data-onclick="saveProduct"]');
  await expect(saveBtn).toBeVisible();

  await page.locator('[data-onclick="closeProductModal"]').first().click();
  await expect(page.locator('#productModal')).not.toHaveClass(/open/);
});

test('clicking an existing product row opens it pre-filled in Edit mode, with photo preview and Delete wired', async ({ page }) => {
  const bakeryName = await openFirstBakeryProfile(page);
  await openManageShop(page, bakeryName);

  const row = page.locator('.shop-manage-row').first();
  test.skip((await row.count()) === 0, `No products listed for "${bakeryName}" to edit.`);
  const rowArgs = JSON.parse(await row.getAttribute('data-args'));
  const [productId] = rowArgs;
  expect(rowArgs).toEqual([productId, bakeryName]);

  await row.click();
  await expect(page.locator('#productModal')).toHaveClass(/open/);
  await expect(page.locator('#productModalTitle')).toHaveText('Edit product');
  await expect(page.locator('#productName')).not.toHaveValue('');

  const deleteBtn = page.locator('[data-onclick="deleteProduct"]');
  await expect(deleteBtn).toBeVisible();

  // Photo change only updates the local preview until Save is clicked —
  // safe to exercise for real.
  const photoInput = page.locator('#productPhotoInput');
  await photoInput.setInputFiles(tinyPngFile());
  await expect(page.locator('#productPhotoWrap img')).toBeVisible();

  await page.locator('[data-onclick="closeProductModal"]').first().click();
  await expect(page.locator('#productModal')).not.toHaveClass(/open/);
});
