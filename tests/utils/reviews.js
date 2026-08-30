import { expect } from '@playwright/test';

// Shared setup helper for specs that need a real review ("item") to act on
// — e.g. EDIT REVIEW. Drives the real "Rate a Bake!" flow (openAddModal,
// MODAL STEPS, ADD ITEM MODAL) rather than writing to Firestore directly,
// same reasoning as tests/utils/preorders.js: exercises the actual security
// rules and code paths, and self-cleans naturally (the review this creates
// is deleted by whichever spec calls deleteReview() on it — there's no
// Firestore cleanup for the `items`/`itemRecords` collections in
// tests/cleanup.teardown.js, unlike preorderOfferings/bakeryCatalogue/
// reservations, so a spec using this MUST delete what it creates itself).
//
// The bakery-selection step calls window.selectManualBakery() directly
// (bypassing the #bakerySearch Google Places results UI) rather than typing
// into the search box and waiting for a result to click — see CLAUDE.md's
// "Known pre-existing issues" note: Google Places returns 403s in this
// environment, unrelated to and out of scope for whatever cluster is being
// tested. selectManualBakery is the same fallback the app's own "use this
// name anyway" link uses, so this still exercises a real, supported code
// path, not a synthetic shortcut — only the "click a search result" step is
// skipped.
export async function addReview(page, {
  name,
  bakeryName,
  category = 'Bread',
  price,
  notes = '',
  rating = 4,
} = {}) {
  await page.locator('#addBtn').click();
  await expect(page.locator('#addModal')).toHaveClass(/open/);

  // Step 1: bakery.
  await page.locator('#bakerySearch').fill(bakeryName);
  await page.evaluate((n) => window.selectManualBakery(n), bakeryName);
  await page.locator('#nextBtn').click();

  // Step 2: name + category + optional price.
  await page.locator('#itemName').fill(name);
  await page.locator('.category-chip', { hasText: category }).first().click();
  if (price !== undefined) await page.locator('#itemPrice').fill(String(price));
  await page.locator('#nextBtn').click();

  // Step 3: overall rating (a range input — set the value and dispatch a
  // real 'input' event rather than fill(), which doesn't work on sliders).
  await page.locator('#overallRating').evaluate((el, val) => {
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, rating);
  await page.locator('#nextBtn').click();

  // Step 4: notes, then save.
  if (notes) await page.locator('#itemNotes').fill(notes);
  await page.locator('#nextBtn').click();
  await expect(page.locator('#addModal')).not.toHaveClass(/open/);

  // saveReview() unshifts the new review to the front of #recentGrid (home
  // page) immediately, then runs its background reconcile. Phase 1 residual
  // #3 fixed the race that used to let that reconcile overwrite the
  // optimistic add before the just-written doc was visible to its own fresh
  // read (saveReview now calls loadData({ mergeLocal: true }), which keeps a
  // local row the server snapshot doesn't have yet). This reload-and-retry
  // is now a dormant safety net — kept because Firestore consistency is
  // still probabilistic and a test helper benefits from the insurance, but
  // it should effectively never fire.
  let card = page.locator('#recentGrid .card').filter({ hasText: name }).first();
  try {
    await expect(card).toBeVisible({ timeout: 10_000 });
  } catch (e) {
    await page.reload();
    card = page.locator('#recentGrid .card').filter({ hasText: name }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
  }
  const args = await card.getAttribute('data-args');
  const [id] = JSON.parse(args);
  return { id, card };
}
