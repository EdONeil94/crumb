import { test, expect } from '@playwright/test';

// Backfills the manually-verified DATA cluster checklist (feedCardHTML/
// cardHTML — the Feed page's cards). Depends on the target Firebase project
// already having at least one review with a real bakeryName/userId, same
// convention as tests/people-filters.spec.js: discover what's there and
// skip with a clear message rather than assuming a specific fixture.

async function gotoFeedPage(page) {
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#page-feed')).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('clicking a feed card\'s own area opens the item detail modal', async ({ page }) => {
  await gotoFeedPage(page);
  const card = page.locator('#feedGrid .card').first();
  test.skip((await card.count()) === 0, 'No feed items yet.');

  // The image area has no nested data-onclick of its own, so this click
  // should fall through to the card's data-onclick="openDetail".
  await card.locator('.card-image').click();
  await expect(page.locator('#detailModal')).toHaveClass(/open/);
});

test('clicking a feed card\'s username opens the profile modal, not item detail', async ({ page }) => {
  await gotoFeedPage(page);
  const card = page.locator('#feedGrid .card').first();
  test.skip((await card.count()) === 0, 'No feed items yet.');

  await card.locator('.card-meta span[data-onclick="openProfileIfSignedIn"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  await expect(page.locator('#detailModal')).not.toHaveClass(/open/);
});

test('clicking a feed card\'s bakery name opens the bakery modal, not item detail', async ({ page }) => {
  await gotoFeedPage(page);
  const card = page.locator('#feedGrid .card').first();
  test.skip((await card.count()) === 0, 'No feed items yet.');

  await card.locator('.card-bakery').click();
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
  await expect(page.locator('#detailModal')).not.toHaveClass(/open/);
});

test('a click landing on the reaction bar\'s own wrapper (not a button) does not open item detail', async ({ page }) => {
  await gotoFeedPage(page);
  const card = page.locator('#feedGrid .card').first();
  test.skip((await card.count()) === 0, 'No feed items yet.');

  // Dispatched directly on the [data-onclick="noop"] wrapper itself, rather
  // than relying on Playwright's coordinate-based click landing outside the
  // reaction buttons (whose exact hit area depends on layout) — this is the
  // same scenario the noop guard exists for: a click whose target is the
  // wrapper, not a button.
  await card.locator('[data-onclick="noop"]').evaluate(el => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#detailModal')).not.toHaveClass(/open/);
});
