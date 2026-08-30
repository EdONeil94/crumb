import { test, expect } from '@playwright/test';
import { addReview } from './utils/reviews.js';

// Backfills the manually-verified ACTIVITY CALENDAR checklist
// (renderActivityTab/calNav/onCalDayClick, the profile modal's Activity
// tab). Creates its own throwaway review via addReview() — dated "now" by
// the real Firestore serverTimestamp(), so it always lands on today's cell
// in the current month's view — and deletes it when done.

async function openOwnProfile(page) {
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
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

test('today\'s cell shows the just-added review and clicking it opens that bakery', async ({ page }) => {
  const name = `E2E Activity ${Date.now()}`;
  const bakeryName = `E2E Activity Bakery ${Date.now()}`;
  const { card } = await addReview(page, { name, bakeryName });

  await openOwnProfile(page);
  await page.locator('.profile-tab', { hasText: 'Activity' }).click();
  await expect(page.locator('#activityCalendarRoot')).toBeVisible();

  const todayCell = page.locator('.cal-day.today');
  await expect(todayCell).toHaveClass(/has-review/);
  await todayCell.click();

  // onCalDayClick opens the bakery directly only when today has exactly
  // one review — otherwise it shows a bottom sheet to pick from. The
  // target account may have other reviews dated today too (e.g. leftover
  // orphaned test data noted in CLAUDE.md), so handle either UI rather
  // than assuming which one this specific run hits.
  const daySheet = page.locator('#calDayModal');
  if (await daySheet.count()) {
    await daySheet.getByText(name).click();
  }

  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
  await expect(page.locator('#bakeryModalTitle')).toHaveText(bakeryName);

  // onCalDayClick closes #profileModal before opening the bakery — both
  // modals share the same .modal-overlay z-index, and #profileModal being
  // later in the DOM would otherwise sit on top and block this click (see
  // the comment at its call site in src/legacy-app.js).
  await expect(page.locator('#profileModal')).not.toHaveClass(/open/);
  await page.locator('[data-onclick="closeBakeryModal"]').first().click();
  await deleteViaEdit(page, card);
});

test('calNav moves between months and disables "next" once back at the current month', async ({ page }) => {
  await openOwnProfile(page);
  await page.locator('.profile-tab', { hasText: 'Activity' }).click();
  await expect(page.locator('#activityCalendarRoot')).toBeVisible();

  const title = page.locator('.activity-month-title');
  const currentMonth = await title.innerText();
  const nextBtn = page.locator('.activity-month-nav button').nth(1);
  await expect(nextBtn).toBeDisabled();

  const prevBtn = page.locator('.activity-month-nav button').nth(0);
  await prevBtn.click();
  await expect(title).not.toHaveText(currentMonth);
  await expect(nextBtn).toBeEnabled();

  await nextBtn.click();
  await expect(title).toHaveText(currentMonth);
  await expect(nextBtn).toBeDisabled();
});
