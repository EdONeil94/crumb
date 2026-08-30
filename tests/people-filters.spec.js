import { test, expect } from '@playwright/test';

// Backfills the manually-verified FILTER HELPERS checklist (People page
// rankings/members + the Profile modal's own rendering). Several scenarios
// here depend on the *shape* of real data in the target Firebase project
// (e.g. "a user with reviews at 2+ bakeries") that this suite has no control
// over — those tests discover what's actually there and skip with a clear
// message rather than assuming a specific fixture exists.

// A plain helper instead of a top-level test.beforeEach — the "signed out"
// describe block below deliberately runs with an empty storageState, and
// Playwright chains beforeEach hooks rather than letting an inner one
// replace an outer one, so a blanket beforeEach here would still assert
// "signed in" for those tests too and fail before they ever ran.
async function gotoSignedIn(page) {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
  // loadData()/loadProfiles() aren't awaited on load — the rankings/members
  // grids and profile modals here are built from allItems/allProfiles, so
  // wait for the recent grid to fill (its universal "data ready" signal)
  // before a fast worker inspects half-loaded content.
  await page.locator('#recentGrid .card, #recentGrid .empty-state').first()
    .waitFor({ timeout: 15_000 }).catch(() => {});
}

async function gotoPeoplePage(page) {
  await page.getByRole('button', { name: 'People', exact: true }).click();
  await expect(page.locator('#page-people')).toHaveClass(/active/);
  // renderRankings/renderPeople need allItems + allProfiles, neither of which
  // is awaited on load — wait for the grid to actually fill (or show its
  // empty state) so a fast worker doesn't check for cards before the data
  // has landed.
  await page.locator('#peopleGrid .ranking-card, #peopleGrid .member-card, #peopleGrid .empty-state')
    .first().waitFor({ timeout: 10_000 }).catch(() => {});
}

test('rankings filters repopulate the location dropdown and re-filter the list', async ({ page }) => {
  await gotoSignedIn(page);
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

  // Location filter: picking a specific one should only ever narrow the
  // list. populateRankingLocationFilter (src/legacy-app.js) lists a
  // location if ANY item's address resolves there — with no userId check —
  // while renderRankings only counts items that DO have a userId, so a
  // listed location can legitimately have zero ranked users (e.g. a city
  // whose only reviews are seed/demo data with no real account attached).
  // Not something to fix from this cluster's own conversion work, so try
  // each option rather than assuming the first one has results.
  const locationValues = (await page.locator('#rankingLocationFilter option').all())
    .slice(1); // skip "All ..."
  test.skip(locationValues.length === 0, 'Only the "All" option is available — no specific location to filter by.');

  let filteredCount = 0;
  for (const option of locationValues) {
    const value = await option.getAttribute('value');
    await page.locator('#rankingLocationFilter').selectOption(value);
    filteredCount = await page.locator('.ranking-card').count();
    if (filteredCount > 0) break;
  }
  test.skip(filteredCount === 0, 'None of the listed locations have any ranked users (with a userId) to filter to.');
  expect(filteredCount).toBeLessThanOrEqual(initialCount);

  await page.locator('#rankingLocationFilter').selectOption('');
  await expect(page.locator('.ranking-card')).toHaveCount(initialCount);
});

test('opening a profile from a ranking card carries no filter over (full unfiltered review list)', async ({ page }) => {
  await gotoSignedIn(page);
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
  await gotoSignedIn(page);
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
    // The People nav button (desktop and mobile both) is display:none until
    // signed in (updateNav()) — there's no way to reach this page via real
    // navigation while signed out. showPage() itself has no such gate, and
    // is exactly what that nav button's own data-onclick calls, so this
    // still exercises the real page-render and click-handling code, just
    // without depending on nav visibility that doesn't apply here.
    await page.evaluate(() => window.showPage('people'));
    await page.locator('#peopleViewMembers').click();
    const card = page.locator('.member-card').first();
    test.skip((await card.count()) === 0, 'No members to click — no users yet.');

    await card.click();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
  });
});

test('follow button toggles and refreshes the People grid, and separately refreshes an open profile', async ({ page }) => {
  await gotoSignedIn(page);
  await gotoPeoplePage(page);
  await page.locator('#peopleViewMembers').click();
  await page.locator('.member-card').first().waitFor({ timeout: 10_000 }).catch(() => {});

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
  await gotoSignedIn(page);
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
    // Every other tab replaces its container's innerHTML once loaded,
    // removing any spinner outright — "My Map" (renderDiningMapTab) is the
    // one exception: it hides its own loader via style.display='none'
    // (src/legacy-app.js's setupMap) rather than removing it, so the
    // element itself still exists afterward. toHaveCount(0) never passes
    // for that tab; check visibility instead, which is correct for both
    // patterns (an absent element and a hidden one both fail toBeVisible).
    await expect(page.locator('#profileTabContent .spinner').first()).not.toBeVisible({ timeout: 10_000 });
  }
});

test('profile stat shortcuts jump to the Followers/Following tabs same as the tab bar', async ({ page }) => {
  await gotoSignedIn(page);
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,openProfileModal"]').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);

  await page.locator('.profile-stat', { hasText: 'Followers' }).click();
  await expect(page.locator('.profile-tab', { hasText: 'Followers' })).toHaveClass(/active/);

  await page.locator('.profile-stat', { hasText: 'Following' }).click();
  await expect(page.locator('.profile-tab', { hasText: 'Following' })).toHaveClass(/active/);
});

test('Followers/Following list rows jump to that person\'s profile, and their follow button works', async ({ page }) => {
  await gotoSignedIn(page);
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
    // Pin to this specific person's uid rather than re-querying
    // `.follow-user-row.first()` after the click — followAndRefreshProfile
    // triggers a full openProfileModal() re-render of the whole Followers
    // list, and nothing guarantees row order survives that, so `.first()`
    // can end up resolving to a different person's row (or, if this
    // person's row moved and the click target is something else entirely,
    // hang waiting for an element that's never going to appear).
    const followUid = JSON.parse(await rowFollowBtn.getAttribute('data-args'))[0];
    const btnForUid = page.locator(`[data-onclick="followAndRefreshProfile"][data-args*="${followUid}"]`);
    // Wrapped in try/finally: this toggles a real follow relationship with
    // a real account in the target Firebase project (not E2E_-prefixed
    // throwaway data) — if the assertion below ever times out, the button
    // must still get clicked back, or the relationship is left changed for
    // every future run (which is exactly how this flaked before: a prior
    // interrupted run's leftover "Following" state made the *next* run's
    // captured `label` wrong from the start).
    try {
      await rowFollowBtn.click();
      // followAndRefreshProfile's refresh (openProfileModal has no way to
      // reopen on a specific tab) always lands back on Reviews — so
      // btnForUid stops existing at all once this fires, regardless of
      // whether the toggle actually succeeded. A `.not.toHaveText` check
      // against a locator that resolves to nothing passes trivially
      // (there's no text to match), so it wouldn't prove anything on its
      // own — wait for the Reviews-tab reset itself first (proof the
      // heavier re-render — item records, follower/following counts,
      // blurb, ... — actually completed), then navigate back to Followers
      // before checking the real result.
      await expect(page.locator('.profile-tab', { hasText: 'Reviews' })).toHaveClass(/active/, { timeout: 30_000 });
      await page.locator('.profile-tab', { hasText: 'Followers' }).click();
      await expect(btnForUid).not.toHaveText(label);
    } finally {
      // Toggle back. The try block may have failed before navigating back
      // to Followers, so get there first if btnForUid isn't on screen.
      if (!(await btnForUid.count())) {
        await page.locator('.profile-tab', { hasText: 'Followers' }).click();
      }
      await btnForUid.click();
    }
  }

  // The toggle-back click above (if the if-block ran) also triggers
  // followAndRefreshProfile — landing back on Reviews again, same as every
  // other refreshOpenProfile() call — so `row` (captured once, before any
  // of that) may now be stale/detached, and we may not even be on the
  // Followers tab any more. Get back there and re-query fresh rather than
  // reusing it.
  // The if-block above (when it runs) ends with a followAndRefreshProfile
  // re-render that lands on Reviews. Navigate back to Followers and wait for
  // the list to actually render before clicking a row — `.follow-user-row`
  // can be briefly absent mid-re-render. (When the if-block was skipped the
  // modal is already on Followers; re-clicking is a harmless no-op.)
  await page.locator('.profile-tab', { hasText: 'Followers' }).click();
  const freshRow = page.locator('.follow-user-row').first();
  await expect(freshRow).toBeVisible({ timeout: 15_000 });
  await freshRow.locator('.follow-user-info').click();
  await expect(page.locator('#profileModal')).toHaveClass(/open/);
});

test('location filter inside a profile with 2+ bakeries: chips filter, and the active chip\'s "↗" opens that bakery', async ({ page }) => {
  await gotoSignedIn(page);
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
  await gotoSignedIn(page);
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
