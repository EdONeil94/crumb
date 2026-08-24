import { expect } from '@playwright/test';

// Shared setup helpers for the Pre-orders/Reservations specs. These drive
// the real app UI end-to-end (create a bakery offering, reserve it) rather
// than writing to Firestore directly — same reasoning as elsewhere in this
// project: no admin/service-account credentials are available in this repo,
// and going through the real flow exercises the actual security rules and
// code paths instead of a synthetic doc that might not match what the app
// expects.
//
// Precondition: at least one bakery must already exist (with at least one
// review) in the target Firebase project, and the signed-in test account
// (see tests/auth.setup.js) must be able to open "Manage pre-orders" on it
// — i.e. be the super-admin account, or that bakery's registered owner.

export async function openFirstBakeryProfile(page) {
  await page.getByRole('button', { name: 'Bakeries', exact: true }).click();
  const card = page.locator('#bakeriesGrid .bakery-card').first();
  await expect(
    card,
    'No bakeries found on the Bakeries page — at least one bakery with a review must exist in the target Firebase project for this spec to run.'
  ).toBeVisible({ timeout: 15_000 });

  const args = await card.getAttribute('data-args');
  const [bakeryName] = JSON.parse(args);

  await card.click();
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
  return bakeryName;
}

export async function openManagePreorders(page, bakeryName) {
  const manageBtn = page.locator('#bakeryModal [data-onclick="openManagePreordersModal"]');
  await expect(
    manageBtn,
    `"Manage pre-orders" isn't visible for "${bakeryName}" — the signed-in test account (E2E_EMAIL) needs to be the super-admin account or this bakery's owner. See the comment at the top of tests/auth.setup.js.`
  ).toBeVisible({ timeout: 10_000 });
  await manageBtn.click();
  await expect(page.locator('#managePreordersModal')).toHaveClass(/open/);
  await expect(page.locator('#mpTab_upcoming')).toHaveClass(/active/);
}

// Fills and saves the "+ Add item" form. `dateOptionIndex` is 0-based into
// #offeringDate's rendered <option> list (index 0 = "Tomorrow", 1 = the day
// after, ...), matching showAddOfferingForm's i=1..7-days-out generation —
// use it (rather than a literal date) so the test stays correct regardless
// of a mocked clock (see tests/reservations.spec.js) or the real current date.
export async function addOffering(page, {
  name,
  description = '',
  price = 3.5,
  qty = 1,
  maxPerPerson = 1,
  dateOptionIndex = 0,
  slotMode = 'range', // 'range' | 'by'
  slotFrom,
  slotTo,
  slotBy,
} = {}) {
  await page.locator('[data-onclick="showAddOfferingForm"]').click();
  const form = page.locator('#addOfferingForm');
  await expect(form).toBeVisible();

  await form.locator('#offeringName').fill(name);
  if (description) await form.locator('#offeringDesc').fill(description);
  await form.locator('#offeringPrice').fill(String(price));
  await form.locator('#offeringQty').fill(String(qty));
  await form.locator('#offeringMaxPerPerson').fill(String(maxPerPerson));
  await form.locator('#offeringDate').selectOption({ index: dateOptionIndex });

  if (slotMode === 'by') {
    await form.locator('#slotModeBy').click();
    if (slotBy) await form.locator('#offeringSlotBy').selectOption(slotBy);
  } else {
    if (slotFrom) await form.locator('#offeringSlotFrom').selectOption(slotFrom);
    if (slotTo) await form.locator('#offeringSlotTo').selectOption(slotTo);
  }

  await form.locator('button:has-text("Save offering")').click();
  await expect(form).toBeHidden();

  const row = page.locator('[id^="offeringrow_"]').filter({ hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  const rowId = await row.getAttribute('id');
  return { id: rowId.replace('offeringrow_', ''), row };
}

// A minimal valid 1x1 PNG, built in-memory so specs don't need a fixture
// file on disk — used for the photo-preview test's local (no upload) file
// choice. Don't use this for anything that ends up actually saved/uploaded —
// see uploadE2EOfferingPhoto below for that.
export function tinyPngFile(name = 'test.png') {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

// Uploads the same 1x1 PNG straight to Firebase Storage, bypassing the
// app's own uploadItemPhoto() (src/legacy-app.js) — that function names the
// file `offerings/{uid}_{timestamp}.{ext}`, derived from the signed-in uid
// and clock, with no way for a caller to mark the result as test data (it
// only reads the chosen File's name for its extension, nothing else). Doing
// the upload here instead means the test controls the destination path, so
// cleanup.teardown.js can find and delete it by the same "E2E" prefix
// convention used for Firestore docs, the same way it does for those.
//
// The resulting download URL is then wired in exactly like the app's own
// "reuse a catalogue item's photo" mechanism: saveOffering() reads
// #addOfferingForm's `cataloguePhoto` dataset entry as its photoURL before
// ever looking at the file input (see fillFromCatalogue in src/legacy-app.js
// for the other place that same mechanism is used) — so this exercises a
// real, already-supported code path rather than a test-only bypass.
export async function uploadE2EOfferingPhoto(page) {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  return page.evaluate(async (b64) => {
    const { storage, ref, uploadBytes, getDownloadURL, auth } = window._crumb;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const path = `offerings/E2E_${auth.currentUser.uid}_${Date.now()}.png`;
    const snap = await uploadBytes(ref(storage, path), bytes, { contentType: 'image/png' });
    return getDownloadURL(snap.ref);
  }, base64);
}

// Sets the just-uploaded photo as the Add-offering form's carried-through
// catalogue photo (see uploadE2EOfferingPhoto's comment) — call this after
// filling the rest of the form and before clicking "Save offering", instead
// of interacting with the #offeringPhoto file input at all.
export async function setPendingCataloguePhoto(page, photoURL) {
  await page.evaluate((url) => {
    document.getElementById('addOfferingForm').dataset.cataloguePhoto = url;
  }, photoURL);
}

// Reserves the named offering from the bakery's own Pre-order tab — the
// customer-facing flow, distinct from Manage Pre-orders (the baker's own
// admin view). Assumes #bakeryModal is already open on that bakery (e.g.
// right after addOffering(), closing the Manage Pre-orders overlay first).
// With maxPerPerson=1/qty=1 (addOffering's defaults) this skips the
// quantity-picker modal entirely, per openReserveModal's own `if (max <= 1)`
// shortcut.
export async function reserveFromBakeryProfile(page, offeringName) {
  if (await page.locator('#managePreordersModal.open').count()) {
    await page.locator('[data-onclick="closeManagePreordersModal"]').click();
  }
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
  await page.locator('.profile-tab', { hasText: 'Pre-order' }).click();
  const content = page.locator('#bakeryTabContent');
  await expect(content.getByText(offeringName)).toBeVisible({ timeout: 10_000 });
  await content.getByRole('button', { name: 'Reserve' }).click();
}
