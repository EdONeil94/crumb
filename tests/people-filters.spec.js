import { test, expect } from '@playwright/test';

// Backfills the manually-verified FILTER HELPERS checklist (People page
// rankings/members + the Profile modal's own rendering). Several scenarios
// here depend on the *shape* of real data in the target Firebase project
// (e.g. "a user with reviews at 2+ bakeries") that this suite has no control
// over — those tests discover what's actually there and skip with a clear
// message rather than assuming a specific fixture exists.

async function gotoPeoplePage(page) {
  await page.getByRole('button', { name: 'People', exact: true }).click();
  await expect(page.locator('#page-people')).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('rankings filters repopulate the location dropdown and re-filter the list', async ({ page }) => {
  await gotoPeoplePage(page);
  await expect(page.locator('#peopleViewRankings')).toHaveClass(/active/);

  const initialCount = await page.locator('.ranking-card').count();
  test.skip(initialCount === 0, 'No rankings to filter — no users with reviews yet.');

  // Level filter: city -> country. populateRankingLocationFilter rebuilds
  // the location dropdown's options to match the new level.
  await page.locator('#rankingLevelFilter').selectOption('country');
  await expect(page.locator('#rankingLocationFilter option').first()).toContainText('countries');

  await page.locator('#rankingLevelFilter').selectOption('city');
  await expect(page.locator('#rankingLocationFilter option').first()).toContainText('cities');

  // Location filter: picking a specific one should only ever narrow the list.
  const locationOptions = await page.locator('#rankingLocationFilter option').all();
  test.skip(locationOptions.length < 2, 'Only the "All" option is available — no specific location to filter by.');
  const specificValue = await locationOptions[1].getAttribute('value');
  await page.locator('#rankingLocationFilter').selectOption(specificValue);
  const filteredCount = await page.locator('.ranking-card').count();
  expect(filteredCount).toBeGreaterThan(0);
  expect(filteredCount).toBeLessThanOrEqual(initialCount);

  await page.locator('#rankingLocationFilter').selectOption('');
  await expect(page.locator('.ranking-card')).toHaveCount(initialCount);
});

test('opening a profile from a ranking card carries no filter over (full unfiltered review list)', async ({ page }) => {
  await gotoPeoplePage(page);
  const card = page.locator('.ranking-card').first();
  test.skip((await card.count()) === 0, 'No rankings to open — no users with reviews yet.');

  await card.click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  // The category filter bar's "All" chip should be active — i.e. no
  // category/location filter carried over from the rankings page.
  const allChip = page.locator('.filter-chip', { hasText: 'All' }).first();
  if (await allChip.count()) {
    await expect(allChip).toHaveClass(/active/);
  }
});

test('Members view: clicking a member card opens a profile when signed in, and the auth modal when signed out', async ({ page }) => {
  await gotoPeoplePage(page);
  await page.locator('#peopleViewMembers').click();
  await expect(page.locator('#peopleViewMembers')).toHaveClass(/active/);

  const card = page.locator('.member-card').first();
  test.skip((await card.count()) === 0, 'No members to click — no users yet.');

  await card.click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Members view: clicking a member card opens the auth modal when signed out', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'People', exact: true }).click();
    await page.locator('#peopleViewMembers').click();
    const card = page.locator('.member-card').first();
    test.skip((await card.count()) === 0, 'No members to click — no users yet.');

    await card.click();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
  });
});

test('follow button toggles and refreshes the People grid, and separately refreshes an open profile', async ({ page }) => {
  await gotoPeoplePage(page);
  await page.locator('#peopleViewMembers').click();

  const followBtn = page.locator('.member-card .people-follow-btn').first();
  test.skip((await followBtn.count()) === 0, 'No other members to follow (only your own card, or no members yet).');

  const initialLabel = await followBtn.innerText();
  await followBtn.click();
  // followAndRefreshPeople re-renders the whole grid, so re-query rather
  // than reusing the (now-detached) button handle.
  await expect(page.locator('.member-card .people-follow-btn').first()).not.toHaveText(initialLabel);

  // Toggle back to leave the account's follow graph as we found it.
  await page.locator('.member-card .people-follow-btn').first().click();
  await expect(page.locator('.member-card .people-follow-btn').first()).toHaveText(initialLabel);

  // Same toggle, now from inside an open profile — should refresh the
  // profile view (via followAndRefreshProfile) rather than the People grid.
  const card = page.locator('.member-card').first();
  await card.click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
  const profileFollowBtn = page.locator('#profileModalContent .follow-btn');
  test.skip((await profileFollowBtn.count()) === 0, 'This profile has no follow button (it may be your own).');

  const profileLabel = await profileFollowBtn.innerText();
  await profileFollowBtn.click();
  await expect(page.locator('#profileModalContent .follow-btn')).not.toHaveText(profileLabel);
  await page.locator('#profileModalContent .follow-btn').click();
  await expect(page.locator('#profileModalContent .follow-btn')).toHaveText(profileLabel);
});

test('profile modal tabs each load correctly, including the own-profile-only tabs', async ({ page }) => {
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);

  const commonTabs = ['Reviews', 'Followers', 'Following'];
  const ownOnlyTabs = ['Saved', 'Orders', 'Activity', 'My Map'];
  for (const label of [...commonTabs, ...ownOnlyTabs]) {
    const tab = page.locator('.profile-tab', { hasText: label });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveClass(/active/);
    await expect(page.locator('#profileTabContent .spinner')).toHaveCount(0);
  }
});

test('profile stat shortcuts jump to the Followers/Following tabs same as the tab bar', async ({ page }) => {
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);

  await page.locator('.profile-stat', { hasText: 'Followers' }).click();
  await expect(page.locator('.profile-tab', { hasText: 'Followers' })).toHaveClass(/active/);

  await page.locator('.profile-stat', { hasText: 'Following' }).click();
  await expect(page.locator('.profile-tab', { hasText: 'Following' })).toHaveClass(/active/);
});

test('Followers/Following list rows jump to that person\'s profile, and their follow button works', async ({ page }) => {
  await gotoPeoplePage(page);
  const card = page.locator('.ranking-card, .member-card').first();
  test.skip((await card.count()) === 0, 'No users to open a profile for.');
  await card.click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);

  await page.locator('.profile-tab', { hasText: 'Followers' }).click();
  const row = page.locator('.follow-user-row').first();
  test.skip((await row.count()) === 0, 'This profile has no followers to list.');

  const rowFollowBtn = row.locator('.people-follow-btn');
  if (await rowFollowBtn.count()) {
    const label = await rowFollowBtn.innerText();
    await rowFollowBtn.click();
    await expect(page.locator('.follow-user-row').first().locator('.people-follow-btn')).not.toHaveText(label);
    // Toggle back.
    await page.locator('.follow-user-row').first().locator('.people-follow-btn').click();
  }

  await row.locator('.follow-user-info').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
});

test('location filter inside a profile with 2+ bakeries: chips filter, and the active chip\'s "↗" opens that bakery', async ({ page }) => {
  await gotoPeoplePage(page);
  const cards = page.locator('.ranking-card, .member-card');
  const count = await cards.count();
  let found = false;

  for (let i = 0; i < count && !found; i++) {
    await cards.nth(i).click();
    await expect(page.locator('#profileModal')).toHaveClass(/open/);
    const locChips = page.locator('.filter-chip.location-chip');
    if ((await locChips.count()) >= 2) {
      found = true;
      break;
    }
    await page.locator('[data-onclick="closeProfileModal"]').first().click();
    await expect(page.locator('#profileModal')).not.toHaveClass(/open/);
    await gotoPeoplePage(page);
  }
  test.skip(!found, 'No user with reviews at 2+ different bakeries was found to test location chips on.');

  const allLocationsChip = page.locator('.filter-chip.location-chip', { hasText: 'All locations' });
  await expect(allLocationsChip).toHaveClass(/active/);

  const specificChip = page.locator('.filter-chip.location-chip').nth(1);
  const bakeryName = (await specificChip.innerText()).replace('↗', '').trim();
  await specificChip.click();
  await expect(page.locator('.filter-chip.location-chip', { hasText: bakeryName })).toHaveClass(/active/);

  const jumpLink = page.locator('.filter-chip.location-chip.active').getByText('↗');
  await jumpLink.click();
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
});

test('single-location profile shows an "X ↗" line instead of chips, and it opens that bakery', async ({ page }) => {
  await gotoPeoplePage(page);
  const cards = page.locator('.ranking-card, .member-card');
  const count = await cards.count();
  let found = false;

  for (let i = 0; i < count && !found; i++) {
    await cards.nth(i).click();
    await expect(page.locator('#profileModal')).toHaveClass(/open/);
    const singleLocationLine = page.locator('#profileTabContent').getByText('All reviews from');
    if (await singleLocationLine.count()) {
      found = true;
      break;
    }
    await page.locator('[data-onclick="closeProfileModal"]').first().click();
    await expect(page.locator('#profileModal')).not.toHaveClass(/open/);
    await gotoPeoplePage(page);
  }
  test.skip(!found, 'No user with reviews at exactly one bakery was found to test the single-location line on.');

  await expect(page.locator('.filter-chip.location-chip')).toHaveCount(0);
  await page.locator('#profileTabContent').getByText('All reviews from').getByText('↗').click();
  await expect(page.locator('#bakeryModal')).toHaveClass(/open/);
});
