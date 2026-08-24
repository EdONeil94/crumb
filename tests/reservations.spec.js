import { test, expect } from '@playwright/test';
import { openFirstBakeryProfile, openManagePreorders, addOffering, reserveFromBakeryProfile } from './utils/preorders.js';

// Backfills the manually-verified Reservations flow checklist: the 12-hour
// cancel cutoff, and QR enlarge/close. See tests/utils/preorders.js for the
// shared setup (bakery discovery, offering creation, reserving) and its
// module comment for the account/data preconditions this spec needs.
//
// The clock is fixed for every test here (see FIXED_NOW below) so "which
// offerings are already live" and "how far away is collection" are
// deterministic — both depend on wall-clock time-of-day otherwise (see the
// long comment in parseSlotStartTime's call sites in src/legacy-app.js for
// why the 12-hour check itself needed a real fix, not just a test).
// FIXED_NOW is late evening, safely after preorderOfferings' 8am go-live
// time, so an offering created for "Tomorrow" during the test is
// immediately visible on the bakery's own Pre-order tab.
const FIXED_NOW = new Date('2026-01-10T22:00:00');

async function openOrdersTab(page) {
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  await page.locator('.profile-tab', { hasText: 'Orders' }).click();
}

function orderCard(page, offeringName) {
  return page.locator('.order-card').filter({ hasText: offeringName });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.clock.setFixedTime(FIXED_NOW);
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('reservation more than 12 hours before collection can be cancelled', async ({ page }) => {
  const name = `E2E Cancel-OK ${Date.now()}`;
  const bakeryName = await openFirstBakeryProfile(page);
  await openManagePreorders(page, bakeryName);
  // 3 days out — unambiguously more than 12h away regardless of slot format.
  await addOffering(page, { name, dateOptionIndex: 2 });
  await reserveFromBakeryProfile(page, name);

  await openOrdersTab(page);
  const card = orderCard(page, name);
  await expect(card).toBeVisible();
  const cancelBtn = card.getByRole('button', { name: 'Cancel reservation' });
  await expect(cancelBtn).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await cancelBtn.click();

  await expect(card.locator('.order-status')).toHaveText('Cancelled');
  await expect(card.getByRole('button', { name: 'Cancel reservation' })).toHaveCount(0);
  // Cancelled reservations drop their QR block too (order-qr only renders
  // when status !== 'cancelled').
  await expect(card.locator('.order-qr')).toHaveCount(0);
});

test('reservation less than 12 hours before collection cannot be cancelled', async ({ page }) => {
  const name = `E2E Cancel-Blocked ${Date.now()}`;
  const bakeryName = await openFirstBakeryProfile(page);
  await openManagePreorders(page, bakeryName);
  // "Tomorrow" at the default 7:00am–11:00am slot — with FIXED_NOW at 22:00
  // the same day, collection starts ~9 hours later, inside the 12h window.
  await addOffering(page, { name, dateOptionIndex: 0 });
  await reserveFromBakeryProfile(page, name);

  await openOrdersTab(page);
  const card = orderCard(page, name);
  await expect(card).toBeVisible();
  // canCancel gates the button's very existence (see the parseSlotStartTime
  // comment in src/legacy-app.js) — inside 12h, it shouldn't render at all.
  await expect(card.getByRole('button', { name: 'Cancel reservation' })).toHaveCount(0);
});

test('QR code enlarges on click and closes on the close button and outside click', async ({ page }) => {
  const name = `E2E QR ${Date.now()}`;
  const bakeryName = await openFirstBakeryProfile(page);
  await openManagePreorders(page, bakeryName);
  await addOffering(page, { name, dateOptionIndex: 2 });
  await reserveFromBakeryProfile(page, name);

  await openOrdersTab(page);
  const card = orderCard(page, name);
  await card.locator('.order-qr').click();

  const qrModal = page.locator('#expandedQRModal');
  await expect(qrModal).toBeVisible();
  await expect(qrModal.getByText(name)).toBeVisible();

  await qrModal.locator('[data-onclick="closeExpandedQR"]').click();
  await expect(qrModal).toHaveCount(0);

  // Re-open, then verify outside-click (clicking the dark backdrop itself,
  // not its content box) also closes it.
  await card.locator('.order-qr').click();
  await expect(page.locator('#expandedQRModal')).toBeVisible();
  await page.locator('#expandedQRModal').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#expandedQRModal')).toHaveCount(0);
});
