import { test as base, expect } from '@playwright/test';

export { expect };

// Shared helper + fixture for specs that need a real review ("item") to act
// on — EDIT REVIEW, REACTIONS, ACTIVITY CALENDAR, SHARE REVIEW, etc.
//
// Drives the real "Rate a Bake!" flow (openAddModal → MODAL STEPS → ADD ITEM
// MODAL) rather than writing to Firestore directly — same reasoning as
// tests/utils/preorders.js: it exercises the actual security rules and code
// paths. The bakery-selection step calls window.selectManualBakery()
// directly (bypassing the #bakerySearch Google Places results UI) because
// Google Places returns 403s in this environment (CLAUDE.md's "Known
// pre-existing issues") — that's the same fallback the app's own "use this
// name anyway" link uses, a real supported path, so only the "click a search
// result" step is skipped.
//
// ── Cleanup ──────────────────────────────────────────────────────────────
// Use the `createReview` fixture, NOT addReview() directly: every review it
// creates is recorded and deleted (item + its itemRecord) on test teardown —
// pass, fail, OR mid-test test.skip(). Historically specs deleted their
// review inline at the end of the test body, which silently leaked to
// production whenever a test aborted first (a single mid-test skip in
// share-and-saved.spec.js leaked ~80 "E2E Share Wiring" reviews into the
// live Recent Reviews feed before this was fixed). cleanup.teardown.js also
// sweeps items/itemRecords by the "E2E " prefix as a second backstop for the
// case the fixture itself can't run (page crashed, whole process killed).
// Keeping an inline deleteReview()/deleteViaEdit() as well is fine and still
// useful for UI coverage + mid-run tidiness — the fixture no-ops if the doc
// is already gone.

async function addReview(page, {
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
  // read (saveReview now calls loadData({ mergeLocal: true })). This
  // reload-and-retry is now a dormant safety net — Firestore consistency is
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

async function deleteReviewDoc(page, itemId) {
  await page.evaluate(async (id) => {
    const { db, doc, getDoc, deleteDoc } = window._crumb;
    try {
      const snap = await getDoc(doc(db, 'items', id));
      if (!snap.exists()) return;                       // already deleted via UI — no-op
      const recId = snap.data().itemRecordId;
      await deleteDoc(doc(db, 'items', id));
      if (recId) await deleteDoc(doc(db, 'itemRecords', recId)).catch(() => {});
    } catch { /* page gone / signed out — cleanup.teardown.js is the backstop */ }
  }, itemId).catch(() => {});
}

// `test` extended with the auto-cleaning createReview fixture. Specs import
// { test, expect } from this file instead of '@playwright/test'.
export const test = base.extend({
  createReview: async ({ page }, use) => {
    const created = [];
    await use(async (opts) => {
      const r = await addReview(page, opts);
      created.push(r.id);
      return r;
    });
    for (const id of created.reverse()) {
      await deleteReviewDoc(page, id);
    }
  },
});
