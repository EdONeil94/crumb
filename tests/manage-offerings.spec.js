import { test, expect } from '@playwright/test';
import {
  openFirstBakeryProfile,
  openManagePreorders,
  addOffering,
  reserveFromBakeryProfile,
  tinyPngFile,
  uploadE2EOfferingPhoto,
  setPendingCataloguePhoto,
} from './utils/preorders.js';

// Backfills the manually-verified Manage Offerings checklist (the baker-side
// "Manage pre-orders" modal). See tests/utils/preorders.js's module comment
// for the account/data preconditions this spec needs.
//
// Correction vs. the original manual checklist: "Manage pre-orders" is a
// static modal (index.html's #managePreordersModal), and unlike the
// dynamically-created overlays elsewhere in this app (reserve modal, edit
// offering, day detail, ...), it has no outside-click-to-close wiring — only
// its ✕ button closes it. The first test below asserts that explicitly
// instead of assuming outside-click works.
const FIXED_NOW = new Date('2026-01-15T22:00:00');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.clock.setFixedTime(FIXED_NOW);
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });

  const bakeryName = await openFirstBakeryProfile(page);
  await openManagePreorders(page, bakeryName);
});

test('opens on the Upcoming tab; the close button closes it, outside click does not', async ({ page }) => {
  const modal = page.locator('#managePreordersModal');
  await expect(modal).toHaveClass(/open/);
  await expect(page.locator('#mpTab_upcoming')).toHaveClass(/active/);

  // Click the backdrop, well outside the centered .modal box.
  await modal.click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveClass(/open/);

  await page.locator('[data-onclick="closeManagePreordersModal"]').click();
  await expect(modal).not.toHaveClass(/open/);
});

test('tab switching loads content and highlights the active tab for Week/Month/Forecast/Upcoming', async ({ page }) => {
  for (const tab of ['week', 'month', 'forecast', 'upcoming']) {
    await page.locator(`#mpTab_${tab}`).click();
    await expect(page.locator(`#mpTab_${tab}`)).toHaveClass(/active/);
    await expect(page.locator('#mpTabContent .spinner')).toHaveCount(0);
    await expect(page.locator('#mpTabContent')).not.toBeEmpty();
  }
});

test('adding an offering makes it appear under Upcoming and clears/hides the form', async ({ page }) => {
  const name = `E2E Add ${Date.now()}`;
  const { row } = await addOffering(page, { name });
  await expect(row).toBeVisible();
  await expect(page.locator('#addOfferingForm')).toBeHidden();
});

test('the catalogue picker auto-fills name, description, price and photo from a previous offering', async ({ page }) => {
  const name = `E2E Catalogue ${Date.now()}`;
  const description = 'A catalogue test item';
  const price = '4.25';

  // Uploaded directly (rather than via the #offeringPhoto file input) so the
  // resulting Storage path is E2E-markable and cleanup.teardown.js can find
  // it — see uploadE2EOfferingPhoto's comment. This is a real upload, and
  // wiring it in via setPendingCataloguePhoto exercises the same real
  // "carry a catalogue photo through unchanged" code path saveOffering()
  // already uses, not a test-only shortcut. The photo-preview test covers
  // the #offeringPhoto file-input/local-preview path separately.
  const photoURL = await uploadE2EOfferingPhoto(page);

  await page.locator('[data-onclick="showAddOfferingForm"]').click();
  const form = page.locator('#addOfferingForm');
  await form.locator('#offeringName').fill(name);
  await form.locator('#offeringDesc').fill(description);
  await form.locator('#offeringPrice').fill(price);
  await form.locator('#offeringQty').fill('1');
  await form.locator('#offeringMaxPerPerson').fill('1');
  await setPendingCataloguePhoto(page, photoURL);
  await form.locator('button:has-text("Save offering")').click();
  await expect(form).toBeHidden();

  // Reopen the form — the item just saved should now be a catalogue option.
  await page.locator('[data-onclick="showAddOfferingForm"]').click();
  const form2 = page.locator('#addOfferingForm');
  const picker = form2.locator('#cataloguePicker');
  const option = picker.locator('option', { hasText: name });
  await expect(option).toHaveCount(1, { timeout: 10_000 });
  const value = await option.getAttribute('value');

  await picker.selectOption(value);
  await expect(form2.locator('#offeringName')).toHaveValue(name);
  await expect(form2.locator('#offeringDesc')).toHaveValue(description);
  await expect(form2.locator('#offeringPrice')).toHaveValue('4.25');
  await expect(form2.locator('#offeringPhotoPreview img')).toHaveAttribute('src', photoURL);
});

test('slot-mode toggle switches input groups, and the saved offering reflects the chosen mode', async ({ page }) => {
  await page.locator('[data-onclick="showAddOfferingForm"]').click();
  const form = page.locator('#addOfferingForm');

  await expect(form.locator('#slotRangeInputs')).toBeVisible();
  await expect(form.locator('#slotByInput')).toBeHidden();
  await expect(form.locator('#slotModeRange')).toHaveClass(/active/);

  await form.locator('#slotModeBy').click();
  await expect(form.locator('#slotByInput')).toBeVisible();
  await expect(form.locator('#slotRangeInputs')).toBeHidden();
  await expect(form.locator('#slotModeBy')).toHaveClass(/active/);

  await form.locator('#slotModeRange').click();
  await expect(form.locator('#slotRangeInputs')).toBeVisible();
  await expect(form.locator('#slotByInput')).toBeHidden();

  const name = `E2E SlotMode ${Date.now()}`;
  await form.locator('#slotModeBy').click();
  await form.locator('#offeringSlotBy').selectOption('5:00pm');
  await form.locator('#offeringName').fill(name);
  await form.locator('#offeringPrice').fill('2');
  await form.locator('#offeringQty').fill('1');
  await form.locator('#offeringMaxPerPerson').fill('1');
  await form.locator('#offeringDate').selectOption({ index: 0 });
  await form.locator('button:has-text("Save offering")').click();

  const row = page.locator('[id^="offeringrow_"]').filter({ hasText: name });
  await expect(row).toContainText('Collect by 5:00pm');
});

test('photo preview shows a thumbnail on file choice; Cancel hides the form and reopening starts fresh', async ({ page }) => {
  await page.locator('[data-onclick="showAddOfferingForm"]').click();
  const form = page.locator('#addOfferingForm');
  await form.locator('#offeringName').fill('E2E Photo Preview Draft');
  await form.locator('#offeringPhoto').setInputFiles(tinyPngFile());
  await expect(form.locator('#offeringPhotoPreview img')).toBeVisible();

  await form.locator('button:has-text("Cancel")').click();
  await expect(form).toBeHidden();

  // showAddOfferingForm rebuilds #addOfferingForm's innerHTML from scratch
  // each time — the previous draft (name + photo) should not carry over.
  await page.locator('[data-onclick="showAddOfferingForm"]').click();
  const form2 = page.locator('#addOfferingForm');
  await expect(form2.locator('#offeringName')).toHaveValue('');
  await expect(form2.locator('#offeringPhotoPreview img')).toHaveCount(0);
});

test('editing an offering updates it in place; the X and Cancel both close without saving', async ({ page }) => {
  const name = `E2E Edit ${Date.now()}`;
  const updatedName = `${name} (edited)`;
  const { row } = await addOffering(page, { name });

  // X closes without saving.
  await row.getByRole('button', { name: '✏️' }).click();
  const overlay = page.locator('#editOfferingOverlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: '✕' }).click();
  await expect(overlay).toHaveCount(0);
  await expect(row).toContainText(name);

  // Cancel closes without saving either, even after changing fields.
  await row.getByRole('button', { name: '✏️' }).click();
  await page.locator('#editOfferingName').fill(updatedName);
  await page.locator('#editSlotModeBy').click();
  await page.locator('#editOfferingOverlay button:has-text("Cancel")').click();
  await expect(page.locator('#editOfferingOverlay')).toHaveCount(0);
  await expect(row).toContainText(name);
  await expect(row).not.toContainText(updatedName);

  // Save changes actually persists them.
  await row.getByRole('button', { name: '✏️' }).click();
  await page.locator('#editOfferingName').fill(updatedName);
  await page.locator('#editSlotModeBy').click();
  await page.locator('#editOfferingSlotBy').selectOption('4:00pm');
  await page.locator('button:has-text("Save changes")').click();
  await expect(page.locator('#editOfferingOverlay')).toHaveCount(0);

  const updatedRow = page.locator('[id^="offeringrow_"]').filter({ hasText: updatedName });
  await expect(updatedRow).toContainText('Collect by 4:00pm');
});

test('deleting an offering removes it after confirming the browser prompt', async ({ page }) => {
  const name = `E2E Delete ${Date.now()}`;
  const { row } = await addOffering(page, { name });

  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: '✕' }).click();

  await expect(row).toHaveCount(0);
});

test('marking a reservation collected flips its status and hides the Collected button', async ({ page }) => {
  const name = `E2E Collect ${Date.now()}`;
  await addOffering(page, { name });
  await reserveFromBakeryProfile(page, name);

  // Reopen Manage Pre-orders (still visible from the bakery modal's action
  // row regardless of which internal tab reserveFromBakeryProfile left
  // active) to see the new reservation listed under its offering.
  await page.locator('[data-onclick="openManagePreordersModal"]').click();
  await expect(page.locator('#mpTab_upcoming')).toHaveClass(/active/);

  const resCard = page.locator('.manage-res-card').filter({ hasText: name });
  await expect(resCard).toBeVisible();
  await resCard.getByRole('button', { name: 'Collected' }).click();

  await expect(resCard).toContainText('✓ Collected');
  await expect(resCard.getByRole('button', { name: 'Collected' })).toHaveCount(0);
});

test('catalogue manager: ✕ closes the overlay, Remove deletes an item after confirming', async ({ page }) => {
  const name = `E2E Catalogue Remove ${Date.now()}`;
  await addOffering(page, { name });

  // Saving an offering auto-adds it to the bakery's catalogue (see
  // openCatalogueManager's empty-state text), so it should show up here.
  await page.locator('[data-onclick="openCatalogueManager"]').click();
  const overlay = page.locator('#catalogueManagerOverlay');
  await expect(overlay).toBeVisible();
  const itemRow = overlay.locator('#catalogueList > div').filter({ hasText: name });
  await expect(itemRow).toBeVisible({ timeout: 10_000 });

  await overlay.getByRole('button', { name: '✕' }).click();
  await expect(overlay).toHaveCount(0);

  await page.locator('[data-onclick="openCatalogueManager"]').click();
  const overlay2 = page.locator('#catalogueManagerOverlay');
  const itemRow2 = overlay2.locator('#catalogueList > div').filter({ hasText: name });
  await expect(itemRow2).toBeVisible({ timeout: 10_000 });

  page.once('dialog', dialog => dialog.accept());
  await itemRow2.getByRole('button', { name: 'Remove' }).click();

  // removeCatalogueItem re-opens a fresh overlay to refresh the list, then
  // removes the (now-stale) one it was called from — assert against the
  // catalogue list content directly rather than overlay identity.
  await expect(page.locator('#catalogueList').getByText(name)).toHaveCount(0, { timeout: 10_000 });
});

test('Month view: tapping a day with data opens its detail overlay; a blank day does nothing', async ({ page }) => {
  const name = `E2E Month ${Date.now()}`;
  await addOffering(page, { name, dateOptionIndex: 0 }); // "Tomorrow" relative to FIXED_NOW — stays in the same displayed month
  await reserveFromBakeryProfile(page, name);
  await page.locator('[data-onclick="openManagePreordersModal"]').click();

  await page.locator('#mpTab_month').click();
  await expect(page.locator('#mpTab_month')).toHaveClass(/active/);

  const dataDay = page.locator('#mpMonthCalendar .mp-cal-day[data-onclick]').first();
  await expect(dataDay).toBeVisible();
  await dataDay.click();
  const dayDetail = page.locator('#mpDayDetailOverlay');
  await expect(dayDetail).toBeVisible();
  await expect(dayDetail.getByText(name)).toBeVisible();
  await dayDetail.locator('[data-onclick="closeMpDayDetail"]').click();
  await expect(dayDetail).toHaveCount(0);

  const blankDay = page.locator('#mpMonthCalendar .mp-cal-day:not([data-onclick])').first();
  const blankCount = await blankDay.count();
  test.skip(blankCount === 0, 'No blank day found in this month to test — every day has data.');
  await blankDay.click();
  await expect(page.locator('#mpDayDetailOverlay')).toHaveCount(0);
});
