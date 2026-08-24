import { test, expect } from '@playwright/test';
import { openFirstBakeryProfile, openManagePreorders, addOffering, reserveFromBakeryProfile } from './utils/preorders.js';

// Backfills the manually-verified QR SCANNER (baker side) checklist
// (openQRScanner/closeQRScanner, and confirmCollected/closeQrConfirmOverlay
// via processScannedReservation). See tests/utils/preorders.js's module
// comment for the account/data preconditions these tests need.
//
// A real camera scan isn't exercised — navigator.mediaDevices.getUserMedia
// has no real camera to grant in this environment, and scanning a QR code
// through a synthetic video feed isn't practical to drive here. What *is*
// tested for real: the scanner overlay itself opening/closing (unaffected
// by whether the camera access succeeds — the overlay renders before that
// async call), and the full confirm/collect flow by calling
// processScannedReservation() directly with a real reservation id (the
// same function scanFrame() calls on a successful decode) — this exercises
// every line of the actual converted cluster except the camera+jsQR
// decoding step itself.

const FIXED_NOW = new Date('2026-01-10T22:00:00');

async function openOrdersTabAndGetReservationId(page, offeringName) {
  // reserveFromBakeryProfile leaves #bakeryModal open (it only assumes
  // it's already open, never closes it) — its full-screen overlay covers
  // the nav bar, so #navAvatar isn't clickable until it's closed (same
  // fix as reservations.spec.js's openOrdersTab).
  if (await page.locator('#bakeryModal.open').count()) {
    await page.locator('[data-onclick="closeBakeryModal"]').first().click();
  }
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  await page.locator('.profile-tab', { hasText: 'Orders' }).click();

  const card = page.locator('.order-card').filter({ hasText: offeringName });
  await expect(card).toBeVisible();
  const qrEl = card.locator('.order-qr');
  const [reservationId] = JSON.parse(await qrEl.getAttribute('data-args'));

  await page.locator('[data-onclick="closeProfileModal"]').click();
  return reservationId;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.clock.setFixedTime(FIXED_NOW);
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('opening the scanner shows the camera overlay, and Cancel closes it', async ({ page }) => {
  const bakeryName = await openFirstBakeryProfile(page);
  await openManagePreorders(page, bakeryName);

  await page.locator('[data-onclick="openQRScanner"]').click();
  const overlay = page.locator('#qrScannerOverlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('#qrStatus')).toBeVisible();

  await overlay.locator('[data-onclick="closeQRScanner"]').click();
  await expect(overlay).toHaveCount(0);
});

test('Cancel on the confirm overlay leaves the reservation pending; Mark as collected marks it collected', async ({ page }) => {
  const name = `E2E QR Scan ${Date.now()}`;
  const bakeryName = await openFirstBakeryProfile(page);
  await openManagePreorders(page, bakeryName);
  await addOffering(page, { name, dateOptionIndex: 0, slotMode: 'by', slotBy: '5:00pm' });
  await reserveFromBakeryProfile(page, name);

  const reservationId = await openOrdersTabAndGetReservationId(page, name);

  // Cancel: bypasses the camera/jsQR decode step, calling the same
  // function scanFrame() calls on a successful scan.
  await page.evaluate(([id, bn]) => window.processScannedReservation(id, bn), [reservationId, bakeryName]);
  const confirmOverlay = page.locator('.qr-confirm-overlay');
  await expect(confirmOverlay).toBeVisible();
  await expect(confirmOverlay.getByText(name)).toBeVisible();

  await confirmOverlay.locator('[data-onclick="closeQrConfirmOverlay"]').click();
  await expect(confirmOverlay).toHaveCount(0);

  const reservationIdAfterCancel = await openOrdersTabAndGetReservationId(page, name);
  expect(reservationIdAfterCancel).toBe(reservationId); // still pending, not collected — the card (and its QR) still renders

  // Now actually mark it collected.
  await page.evaluate(([id, bn]) => window.processScannedReservation(id, bn), [reservationId, bakeryName]);
  const confirmOverlay2 = page.locator('.qr-confirm-overlay');
  await expect(confirmOverlay2).toBeVisible();
  await confirmOverlay2.getByRole('button', { name: '✓ Mark as collected' }).click();
  await expect(confirmOverlay2).toHaveCount(0, { timeout: 10_000 });

  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await page.locator('.profile-tab', { hasText: 'Orders' }).click();
  const collectedCard = page.locator('.order-card').filter({ hasText: name });
  await expect(collectedCard).toHaveClass(/collected/);
});
