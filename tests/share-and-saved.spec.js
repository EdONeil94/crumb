import { test, expect } from '@playwright/test';
import { addReview } from './utils/reviews.js';

// Backfills the manually-verified SHARE REVIEW WITH A FOLLOWED USER
// checklist. That cluster's section in src/legacy-app.js also happens to
// contain renderSavedTab (by file position, not topic — see CLAUDE.md), so
// its "Saved bakeries"/"Items to try" flows are covered here too.
//
// Each test creates its own throwaway review via addReview() (see that
// helper's module comment) and deletes it when done — except the "sending a
// review" scenario: sendSharedReview() writes to a `sharedReviews` doc with
// no cleanup path in tests/cleanup.teardown.js (unlike preorderOfferings/
// bakeryCatalogue/reservations), so actually clicking Send would leave
// permanent, unscoped data behind. That flow is verified via the rendered
// data-onclick/data-args instead of a real click — see that test's comment.
// Manually verify an actual Send against a real followed user if needed.

async function openDetailAndShare(page, card) {
  await card.locator('.card-image').click();
  await expect(page.locator('#detailModal')).toHaveClass(/open/);
  await page.locator('[data-onclick="openShareReviewModal"]').click();
  await expect(page.locator('#shareReviewModal')).toHaveClass(/open/);
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

test('Share modal reflects following status, and the search box filters candidates', async ({ page }) => {
  const name = `E2E Share ${Date.now()}`;
  const bakeryName = `E2E Share Bakery ${Date.now()}`;
  const { card } = await addReview(page, { name, bakeryName });

  await openDetailAndShare(page, card);
  const content = page.locator('#shareReviewContent');
  const emptyState = content.locator('.empty-state-title', { hasText: "You're not following anyone yet" });

  if (await emptyState.count()) {
    await expect(emptyState).toBeVisible();
  } else {
    await expect(content).toContainText(name);
    await expect(content).toContainText(bakeryName);

    const initialCount = await page.locator('.share-user-row').count();
    expect(initialCount).toBeGreaterThan(0);

    await page.locator('#shareUserSearch').fill('zzz_no_such_person_zzz');
    await expect(page.locator('#shareUserRows')).toContainText('No matches');
    await expect(page.locator('.share-user-row')).toHaveCount(0);

    await page.locator('#shareUserSearch').fill('');
    await expect(page.locator('.share-user-row')).toHaveCount(initialCount);
  }

  await page.locator('[data-onclick="closeShareReviewModal"]').click();
  await deleteViaEdit(page, card);
});

test('each candidate\'s Send button is wired to sendSharedReview with the right item/user ids', async ({ page }) => {
  const name = `E2E Share Wiring ${Date.now()}`;
  const bakeryName = `E2E Share Bakery ${Date.now()}`;
  const { card, id: itemId } = await addReview(page, { name, bakeryName });

  await openDetailAndShare(page, card);
  const firstRow = page.locator('.share-user-row').first();
  test.skip((await firstRow.count()) === 0, 'Not following anyone — no Send button to check.');

  const sendBtn = firstRow.getByRole('button', { name: 'Send' });
  await expect(sendBtn).toHaveAttribute('data-onclick', 'sendSharedReview');
  const args = JSON.parse(await sendBtn.getAttribute('data-args'));
  expect(args[0]).toBe(itemId);
  expect(typeof args[1]).toBe('string');
  expect(args[1].length).toBeGreaterThan(0);

  await page.locator('[data-onclick="closeShareReviewModal"]').click();
  await deleteViaEdit(page, card);
});

test('saving an item to try shows it in the profile\'s Saved tab, and Remove clears it', async ({ page }) => {
  const name = `E2E Saved Item ${Date.now()}`;
  const bakeryName = `E2E Saved Bakery ${Date.now()}`;
  const { card } = await addReview(page, { name, bakeryName });

  await card.locator('.card-image').click();
  await expect(page.locator('#detailModal')).toHaveClass(/open/);
  const saveBtn = page.locator('[data-onclick="toggleSaveItem"]');
  await saveBtn.click();
  await expect(saveBtn).toContainText('Saved to try');
  await page.locator('[data-onclick="closeDetailModal"]').first().click();

  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  await page.locator('.profile-tab', { hasText: 'Saved' }).click();

  const savedItemCard = page.locator('.saved-item-card').filter({ hasText: name });
  await expect(savedItemCard).toBeVisible();
  await savedItemCard.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.saved-item-card').filter({ hasText: name })).toHaveCount(0);

  await page.locator('[data-onclick="closeProfileModal"]').click();
  await deleteViaEdit(page, card);
});

test('bookmarking a bakery shows it in the profile\'s Saved tab, and Remove clears it', async ({ page }) => {
  const name = `E2E Bookmark Item ${Date.now()}`;
  const bakeryName = `E2E Bookmark Bakery ${Date.now()}`;
  const { card } = await addReview(page, { name, bakeryName });

  await card.locator('.card-image').click();
  await expect(page.locator('#detailModal')).toHaveClass(/open/);
  await page.locator('.detail-bakery').click();
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
  await page.locator('#bakeryModalBookmarkBtn').click();
  await expect(page.locator('#bakeryModalBookmarkBtn')).toHaveClass(/saved/);
  await page.locator('[data-onclick="closeBakeryModal"]').first().click();

  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  await page.locator('.profile-tab', { hasText: 'Saved' }).click();

  const bookmarkCard = page.locator('.bookmark-card').filter({ hasText: bakeryName });
  await expect(bookmarkCard).toBeVisible();
  await bookmarkCard.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.bookmark-card').filter({ hasText: bakeryName })).toHaveCount(0);

  await page.locator('[data-onclick="closeProfileModal"]').click();
  await deleteViaEdit(page, card);
});
