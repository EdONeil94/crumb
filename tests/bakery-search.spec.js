import { test, expect } from '@playwright/test';
import { openFirstBakeryProfile } from './utils/preorders.js';

// Backfills the manually-verified BAKERY SEARCH checklist (showKnownBakeries/
// renderKnownMatches/fetchBakeryPlaces/selectBakery/selectManualBakery/
// clearBakery, the "Rate a Bake!" modal's step 1). This was the last cluster
// deferred pending a real Google Places API key working from this
// environment — see CLAUDE.md's former "Known pre-existing issues" note
// (now resolved: the key's allowed referrers include https://*.app.github.dev/*).
//
// Unlike every other spec in this suite, the Google-results test below makes
// a real call to a real third-party API (places.googleapis.com) rather than
// only the target Firebase project — worth knowing if it's ever flaky for
// reasons outside this app's own code.

async function openAddModalStep1(page) {
  // showKnownBakeries()/renderKnownMatches() read the module-level allItems
  // (populated by loadData(), unawaited from onAuthStateChanged) — opening
  // the modal before that resolves would show a false "no known bakeries"
  // empty state. #recentGrid .card is loadData()'s first synchronous side
  // effect, same proxy used in tests/utils/preorders.js — checked for
  // attachment rather than visibility, since a test may have already
  // navigated off the home page (where #recentGrid lives) by this point.
  await expect(
    page.locator('#recentGrid .card').first(),
    'Initial data (allItems) never finished loading — #recentGrid stayed empty.'
  ).toBeAttached({ timeout: 15_000 });

  await page.locator('#addBtn').click();
  await expect(page.locator('#addModal')).toHaveClass(/open/);
  await expect(page.locator('#step1')).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('#navAvatar'),
    'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js'
  ).toBeVisible({ timeout: 15_000 });
});

test('focusing an empty search shows previously-reviewed bakeries, and selecting one fills the location', async ({ page }) => {
  await openAddModalStep1(page);
  await page.locator('#bakerySearch').focus();

  const knownPanel = page.locator('#bakeryResultsKnown');
  test.skip(
    (await knownPanel.getByText('Previously reviewed').count()) === 0,
    'No previously-reviewed bakeries in the target project to list.'
  );
  await expect(knownPanel.getByText('Previously reviewed')).toBeVisible();

  const row = knownPanel.locator('[data-onclick="selectBakery"]').first();
  const [, name, address] = JSON.parse(await row.getAttribute('data-args'));

  await row.click();
  await expect(page.locator('#locationSelected')).toHaveClass(/visible/);
  await expect(page.locator('#selectedBakeryName')).toHaveText(name);
  await expect(page.locator('#selectedBakeryAddress')).toHaveText(address);
  await expect(page.locator('#bakerySearch')).toHaveValue(name);
  await expect(page.locator('#bakeryResultsKnown')).toBeEmpty();

  await page.locator('[data-onclick="clearBakery"]').click();
  await expect(page.locator('#locationSelected')).not.toHaveClass(/visible/);
  await expect(page.locator('#bakerySearch')).toHaveValue('');
});

test('typing a name that matches a previously-reviewed bakery shows it under "Already on Crumbz"', async ({ page }) => {
  const bakeryName = await openFirstBakeryProfile(page);
  await page.locator('[data-onclick="closeBakeryModal"]').first().click();
  await expect(page.locator('#bakeryModal')).not.toHaveClass(/open/);

  await openAddModalStep1(page);
  // Search on a substring, not the full name, to prove this is a real
  // substring match (renderKnownMatches), not an exact-string coincidence.
  await page.locator('#bakerySearch').fill(bakeryName.slice(0, Math.max(3, Math.floor(bakeryName.length / 2))));

  const knownPanel = page.locator('#bakeryResultsKnown');
  await expect(knownPanel.getByText('Already on Crumbz')).toBeVisible({ timeout: 5_000 });
  const match = knownPanel.locator('[data-onclick="selectBakery"]').filter({ hasText: bakeryName }).first();
  await expect(match).toBeVisible();

  await match.click();
  await expect(page.locator('#selectedBakeryName')).toHaveText(bakeryName);
  await expect(page.locator('#locationSelected')).toHaveClass(/visible/);
});

test('a real Google Places search returns results, and selecting one fills the location with a live map', async ({ page }) => {
  await openAddModalStep1(page);
  // A generic, near-universally-present query — real network call to
  // places.googleapis.com, not mocked. fetchBakeryPlaces debounces 400ms
  // after typing stops before firing.
  await page.locator('#bakerySearch').fill('bakery');

  const googlePanel = page.locator('#bakeryResultsGoogle');
  const result = googlePanel.locator('[data-onclick="selectBakery"]').first();
  await expect(
    result,
    'No Google Places results came back for a generic "bakery" search — check the API key / referrer restrictions are still working from this environment.'
  ).toBeVisible({ timeout: 10_000 });

  const [placeId, name] = JSON.parse(await result.getAttribute('data-args'));
  expect(placeId.length).toBeGreaterThan(0);
  expect(name.length).toBeGreaterThan(0);

  await result.click();
  await expect(page.locator('#locationSelected')).toHaveClass(/visible/);
  await expect(page.locator('#selectedBakeryName')).toHaveText(name);
  await expect(page.locator('#bakeryResultsGoogle')).toBeEmpty();
  await expect(page.locator('#mapContainer iframe')).toHaveAttribute('src', new RegExp(`place_id:${placeId}`));
});

test('entering a name with no match and using "New item" style fallback (selectManualBakery) still selects a location', async ({ page }) => {
  await openAddModalStep1(page);
  const name = `E2E Search Manual ${Date.now()}`;
  // A random, made-up name should have no known match, and (in the very
  // unlikely case Google surfaces something bogus for it) this test only
  // cares that manual entry itself works — driven directly, same fallback
  // path as the "use this name anyway" links.
  await page.evaluate((n) => window.selectManualBakery(n), name);

  await expect(page.locator('#locationSelected')).toHaveClass(/visible/);
  await expect(page.locator('#selectedBakeryName')).toHaveText(name);
  await expect(page.locator('#selectedBakeryAddress')).toHaveText('Entered manually');
  await expect(page.locator('#bakerySearch')).toHaveValue(name);
});
