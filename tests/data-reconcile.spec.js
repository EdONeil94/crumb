import { test, expect } from '@playwright/test';
import { addReview } from './utils/reviews.js';

// Regression coverage for Phase 1 residual #3 — loadData()'s reconcile race
// (see docs/extraction-log.md). Each test asserts the *fixed* behaviour of
// one of the three documented manifestations, not just "the suite still
// passes".

// ── M1: Bakeries page permanently empty on fast nav ───────────────────────────
// Pre-fix: navigating to Bakeries before loadData()'s getDocs resolved ran
// renderBakeries() on an empty allItems and left a permanent "No bakeries
// found" state — nothing re-rendered it when the data arrived. Post-fix,
// loadData() re-renders whichever data page is active when it completes.
test('Bakeries page fills in even when opened before the initial data load finishes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/');
  // Open Bakeries as early as possible — before #recentGrid has any card,
  // i.e. before loadData()'s network read has come back.
  await page.waitForFunction(() => typeof window.showPage === 'function');
  await page.evaluate(() => window.showPage('bakeries'));
  await expect(page.locator('#page-bakeries')).toHaveClass(/active/);

  // Prove the initial load actually finished (so an empty grid below would be
  // a real regression, not "no bakeries in the project"). #recentGrid lives
  // on #page-home, which is hidden now that we're on Bakeries — check for
  // attachment, not visibility. renderRecentGrid() populating it is
  // loadData()'s side effect regardless of which page is active.
  await expect(page.locator('#recentGrid .card').first()).toBeAttached({ timeout: 20_000 });
  await expect(
    page.locator('#bakeriesGrid .bakery-card').first(),
    'Bakeries grid never populated after loadData() completed — residual #3 regression.'
  ).toBeVisible({ timeout: 20_000 });

  expect(errors).toEqual([]);
});

// ── M3: Settings → Business empty for an admin on a cold session ──────────────
// Pre-fix: renderBusinessSection() reads allBakeries, which was only ever
// built as a side effect of visiting a bakery page. Going straight to
// Settings showed "No bakeries assigned yet". Post-fix, loadData() builds
// allBakeries on every run, so a cold session is enough.
test('Settings Business section lists bakeries on a cold session, no bakery-page visit first', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#recentGrid .card').first()).toBeVisible({ timeout: 15_000 });

  // Straight to Settings — deliberately NOT visiting Bakeries / a bakery
  // profile / the leaderboard first.
  await page.locator('#navAvatar').click();
  await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Settings' }).click();
  await expect(page.locator('#page-settings')).toHaveClass(/active/);

  const businessVisible = await page.locator('#settingsBusinessCard').isVisible().catch(() => false);
  test.skip(!businessVisible, 'E2E account is not a business/admin account — no Business section to check.');

  await expect(
    page.locator('#settingsBusinessBody [data-onclick="openBakeryEditModal"]').first(),
    'Business section showed no bakeries on a cold session — residual #3 (M3) regression.'
  ).toBeVisible({ timeout: 10_000 });
});

// ── M2: just-saved review clobbered by the background reconcile ───────────────
// The real race (a getDocs racing ahead of Firestore making the writer's own
// just-written doc visible) is probabilistic and can't be forced in-suite.
// This drives the exact mid-race *state* deterministically instead: a review
// that is present locally (allItems) but absent server-side, then a
// saveReview()-triggered mergeLocal reconcile. Post-fix the mergeLocal merge
// keeps it; a plain reconcile (every other caller, incl. deleteReview) still
// drops it.
test('the mergeLocal reconcile keeps a locally-present, server-absent review; a plain reconcile drops it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

  const stamp = Date.now();
  const nameR = `E2E Reconcile R ${stamp}`;
  const nameS = `E2E Reconcile S ${stamp}`;
  const bakery = `E2E Reconcile Bakery ${stamp}`;

  // 1. Create R for real — it lands in allItems (optimistic) and on the server.
  const { id: idR } = await addReview(page, { name: nameR, bakeryName: bakery, category: 'Bread', rating: 4 });
  const rCard = page.locator('#recentGrid .card').filter({ hasText: nameR });
  await expect(rCard).toBeVisible();

  // 2. Delete R server-side directly, and wait until a fresh read confirms
  //    it's gone — R is now local-only in allItems.
  const recIdR = await page.evaluate(async (id) => {
    const { db, doc, getDoc, deleteDoc } = window._crumb;
    const snap = await getDoc(doc(db, 'items', id));
    const recId = snap.exists() ? snap.data().itemRecordId : null;
    await deleteDoc(doc(db, 'items', id));
    return recId;
  }, idR);
  await expect
    .poll(async () => page.evaluate(
      async (id) => (await window._crumb.getDoc(window._crumb.doc(window._crumb.db, 'items', id))).exists(),
      idR,
    ), { timeout: 15_000 })
    .toBe(false);

  // R's card is still on screen (nothing has re-rendered #recentGrid yet).
  await expect(rCard).toBeVisible();

  // 3. Save S. saveReview() fires loadData({ mergeLocal: true }); its getDocs
  //    returns S but not R. mergeLocal must keep R (local-only).
  await addReview(page, { name: nameS, bakeryName: bakery, category: 'Bread', rating: 4 });
  await expect(page.locator('#recentGrid .card').filter({ hasText: nameS })).toBeVisible();
  // Give the background mergeLocal reconcile time to land (network read + render;
  // no DOM signal to wait on).
  await page.waitForTimeout(4000);
  await expect(
    rCard,
    'mergeLocal reconcile dropped a locally-present, server-absent review — residual #3 (M2) fix not working.'
  ).toBeVisible();

  // 4. A plain reconcile (fresh auth on reload → loadData() with no mergeLocal)
  //    must drop R — the property deleteReview()/removeReviewAndFlag() rely on.
  const { id: idS, recId: recIdS } = await page.evaluate(async (name) => {
    const { db, collection, getDocs, query, where } = window._crumb;
    const snap = await getDocs(query(collection(db, 'items'), where('name', '==', name)));
    const d = snap.docs[0];
    return { id: d?.id ?? null, recId: d?.data()?.itemRecordId ?? null };
  }, nameS);

  await page.reload();
  await expect(page.locator('#recentGrid .card').first()).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('#recentGrid .card').filter({ hasText: nameR }),
    'A plain reconcile failed to drop a server-absent review — mergeLocal leaked into the default path.'
  ).toHaveCount(0);

  // Cleanup — R's item doc is already gone; remove its itemRecord and all of S.
  await page.evaluate(async ({ recIdR, idS, recIdS }) => {
    const { db, doc, deleteDoc } = window._crumb;
    const del = (col, id) => id && deleteDoc(doc(db, col, id)).catch(() => {});
    await del('itemRecords', recIdR);
    await del('items', idS);
    await del('itemRecords', recIdS);
  }, { recIdR, idS, recIdS });
});
