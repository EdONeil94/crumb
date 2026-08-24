import { test, expect } from '@playwright/test';
import { addReview } from './utils/reviews.js';

// Backfills the manually-verified REACTIONS checklist (feedCardHTML's
// reaction bar, only rendered on the Feed page — not the home page's
// recentGrid, which uses cardHTML instead). Each test creates its own
// throwaway review via addReview() and deletes it when done.

async function gotoFeedAndFindCard(page, name) {
  await page.locator('#desktopFeedBtn').click();
  await expect(page.locator('#page-feed')).toHaveClass(/active/);
  const card = page.locator('#feedGrid .card').filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  return card;
}

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

test('adding a reaction via the picker shows a pill, and clicking it again removes it', async ({ page }) => {
  const name = `E2E Reaction ${Date.now()}`;
  const bakeryName = `E2E Reaction Bakery ${Date.now()}`;
  await addReview(page, { name, bakeryName });
  const card = await gotoFeedAndFindCard(page, name);

  await card.locator('[data-onclick="toggleReactionPicker"]').click();
  const picker = page.locator('.reaction-picker');
  await expect(picker).toBeVisible();
  const emojiButtons = picker.locator('.reaction-picker-btn');
  const emoji = await emojiButtons.first().innerText();
  await emojiButtons.first().click();

  await expect(picker).toHaveCount(0);
  const pill = card.locator('.reaction-btn', { hasText: emoji });
  await expect(pill).toBeVisible();
  await expect(pill).toHaveClass(/reacted/);
  await expect(pill.locator('.count')).toHaveText('1');

  // Clicking the same pill again removes the reaction.
  await pill.click();
  await expect(card.locator('.reaction-btn', { hasText: emoji })).toHaveCount(0);

  await deleteViaEdit(page, card);
});

test('clicking outside the picker closes it without adding a reaction', async ({ page }) => {
  const name = `E2E Reaction Outside ${Date.now()}`;
  const bakeryName = `E2E Reaction Bakery ${Date.now()}`;
  await addReview(page, { name, bakeryName });
  const card = await gotoFeedAndFindCard(page, name);

  await card.locator('[data-onclick="toggleReactionPicker"]').click();
  await expect(page.locator('.reaction-picker')).toBeVisible();

  // Click a neutral, definitely-non-interactive spot outside the picker
  // and the card — not a raw viewport corner, which risks landing on the
  // nav bar (e.g. the logo) and navigating away entirely.
  await page.locator('#feedEyebrow').click();
  await expect(page.locator('.reaction-picker')).toHaveCount(0);
  await expect(card.locator('.reaction-btn')).toHaveCount(0);

  await deleteViaEdit(page, card);
});

test('reacting does not open the item detail modal underneath', async ({ page }) => {
  const name = `E2E Reaction NoBubble ${Date.now()}`;
  const bakeryName = `E2E Reaction Bakery ${Date.now()}`;
  await addReview(page, { name, bakeryName });
  const card = await gotoFeedAndFindCard(page, name);

  await card.locator('[data-onclick="toggleReactionPicker"]').click();
  const picker = page.locator('.reaction-picker');
  await picker.locator('.reaction-picker-btn').first().click();
  await expect(page.locator('#detailModal')).not.toHaveClass(/open/);

  const pill = card.locator('.reaction-btn').first();
  await pill.click();
  await expect(page.locator('#detailModal')).not.toHaveClass(/open/);

  await deleteViaEdit(page, card);
});
