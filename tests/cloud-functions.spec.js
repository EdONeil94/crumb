import { test, expect } from '@playwright/test';

// Coverage for the Cloud Functions phase (functions/ — C1/C1b/C3/C5/C8/C8b/C9).
// Emulator-only: every callable runs in the Functions emulator, which the
// default `npm run test:e2e` now starts (playwright.config.js). Skips itself
// under prod mode — those callables aren't deployed to crumb-ddeb6 by an
// agent, only by Ed.
//
// This file grows one describe block per callable as the phase lands. The
// Firestore-side assertions use firebase-admin against the emulator (same
// approach as tests/seed-emulator.mjs), so they see exactly what the callable
// wrote — not just what the UI re-rendered.

const EMULATOR = process.env.E2E_MODE === 'emulator';
test.skip(!EMULATOR, 'Cloud Functions callables run only against the emulator.');

// The client-write closures in firestore.rules (C9 mark-collected, C8/C8b
// reservations + stock, C1 items/itemRecords) ship in a separate follow-up
// PR (feat/cloud-functions-rules), merged only after the Functions and the
// client are live — see docs/cloud-functions-phase.md "Rollout plan". Until
// then this branch's rules match main and the three closed-rule tests skip.
const RULES_CLOSED = false;
const RULES_PENDING = 'Rule closure ships in the follow-up rules PR.';

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const _origEmitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  const name = rest[0]?.type ?? rest[0];
  if (name === 'MetadataLookupWarning' || String(w).includes('MetadataLookup')) return;
  return _origEmitWarning.call(process, w, ...rest);
};

let adminDb;
async function db() {
  if (adminDb) return adminDb;
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ projectId: 'crumb-ddeb6' });
  adminDb = getFirestore(app);
  return adminDb;
}

async function adminAuth() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const app = getApps()[0] || initializeApp({ projectId: 'crumb-ddeb6' });
  return getAuth(app);
}

// ── C5 — setUserRole (via the Admin panel → Users tab) ─────────────────────
test.describe('C5 — setUserRole', () => {
  const TARGET_NAME = 'Dot Dough';        // seeded, in nobody's follow graph
  const TARGET_UID = 'seed-user-dot';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });
    await page.locator('#navAvatar').click();
    await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Admin panel' }).click();
    await expect(page.locator('#page-admin')).toHaveClass(/active/);
    await page.locator('#adminTabUsers').click();
    await expect(page.locator('#adminTabContent .spinner')).toHaveCount(0);
  });

  test.afterEach(async () => {
    // leave the seed clean for the next spec regardless of assertion outcome
    await (await db()).collection('userRoles').doc(TARGET_UID).delete().catch(() => {});
  });

  const row = (page) => page.locator('.admin-user-row', { hasText: TARGET_NAME });

  test('promote to admin writes userRoles + a roleAudit entry, and shows on re-render', async ({ page }) => {
    page.once('dialog', (d) => d.accept());
    await row(page).locator('[data-onclick="promoteUser"]').click();
    await expect(page.locator('#toast')).toContainText(/promoted to admin/i);

    const roleDoc = await (await db()).collection('userRoles').doc(TARGET_UID).get();
    expect(roleDoc.exists).toBe(true);
    expect(roleDoc.data().role).toBe('admin');

    const audit = await (await db()).collection('roleAudit')
      .where('targetUid', '==', TARGET_UID).get();
    expect(audit.empty).toBe(false);
    const latest = audit.docs.map((d) => d.data())
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
    expect(latest.newRole).toBe('admin');
    expect(latest.actorUid).toBe('KTpBS4yJx2h8LpcryCTfJDFCHlr2');

    // refreshAdminUsersPanel() targets a nonexistent DOM id (pre-existing,
    // documented) so re-render by re-selecting the tab — showAdminTab()
    // reloads allUserRoles first.
    await page.locator('#adminTabUsers').click();
    await expect(page.locator('#adminTabContent .spinner')).toHaveCount(0);
    await expect(row(page).locator('.role-badge.admin')).toBeVisible();
  });

  test('assign a bakery sets role=business with the bakery name', async ({ page }) => {
    page.once('dialog', (d) => d.accept('Seed Bakehouse Beta'));
    await row(page).locator('[data-onclick="promptAssignBakery"]').click();
    await expect(page.locator('#toast')).toContainText(/assigned to Seed Bakehouse Beta/i);

    const roleDoc = await (await db()).collection('userRoles').doc(TARGET_UID).get();
    expect(roleDoc.data()).toMatchObject({ role: 'business', bakeryName: 'Seed Bakehouse Beta' });
  });

  test('remove role deletes the userRoles doc', async ({ page }) => {
    await (await db()).collection('userRoles').doc(TARGET_UID).set({ role: 'admin', bakeryName: '' });
    await page.reload();
    await page.locator('#navAvatar').click();
    await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Admin panel' }).click();
    await page.locator('#adminTabUsers').click();
    await expect(page.locator('#adminTabContent .spinner')).toHaveCount(0);

    page.once('dialog', (d) => d.accept());
    await row(page).locator('[data-onclick="removeUserRole"]').click();
    await expect(page.locator('#toast')).toContainText(/role removed/i);

    const roleDoc = await (await db()).collection('userRoles').doc(TARGET_UID).get();
    expect(roleDoc.exists).toBe(false);
  });
});

// ── C3 — moderateFlaggedReview (via the Admin panel → Flags tab) ───────────
test.describe('C3 — moderateFlaggedReview', () => {
  // Build a self-contained itemRecord with two reviews, then flag one — so a
  // 'remove' leaves the record behind with a recomputed (reviewCount 2 -> 1)
  // aggregate, and seed data is never touched.
  async function seedFlaggedReview({ twoReviews } = {}) {
    const d = await db();
    const recRef = d.collection('itemRecords').doc();
    await recRef.set({
      name: 'E2E Flag Target', category: 'cake', subCategory: '',
      bakeryName: 'Seed Bakehouse Gamma', bakeryAddress: '', bakeryPlaceId: null,
      communityAvg: 4, reviewCount: twoReviews ? 2 : 1, avgPrice: 3, priceCount: twoReviews ? 2 : 1,
      photoURL: null, createdAt: new Date(),
    });
    const mkItem = (rating) => d.collection('items').add({
      itemRecordId: recRef.id, name: 'E2E Flag Target', category: 'cake', subCategory: '',
      bakeryName: 'Seed Bakehouse Gamma', bakeryAddress: '', bakeryPlaceId: null,
      bakeryLat: null, bakeryLng: null, price: 3,
      overallRating: rating, communityAvg: rating, ratingCount: 1,
      notes: '', photoURL: null,
      userId: 'seed-user-cal', userName: 'Cal Crust', userPhoto: null, createdAt: new Date(),
    });
    const flagged = await mkItem(4);
    if (twoReviews) await mkItem(4);
    const flagRef = await d.collection('flaggedReviews').add({
      itemId: flagged.id,
      bakeryName: 'Seed Bakehouse Gamma',
      flaggedByName: 'E2E Flagger',
      reason: 'E2E moderation test',
      createdAt: new Date(),
    });
    return { flagId: flagRef.id, itemId: flagged.id, itemRecordId: recRef.id };
  }

  async function openFlagsTab(page) {
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });
    await page.locator('#navAvatar').click();
    await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Admin panel' }).click();
    await expect(page.locator('#page-admin')).toHaveClass(/active/);
    await page.locator('#adminTabFlags').click();
    await expect(page.locator('#adminTabContent .spinner')).toHaveCount(0);
  }

  test.afterEach(async () => {
    const d = await db();
    for (const coll of ['flaggedReviews', 'items']) {
      const stale = await d.collection(coll).where(
        coll === 'flaggedReviews' ? 'flaggedByName' : 'name',
        '==', coll === 'flaggedReviews' ? 'E2E Flagger' : 'E2E Flag Target').get();
      await Promise.all(stale.docs.map((x) => x.ref.delete()));
    }
    const recs = await d.collection('itemRecords').where('name', '==', 'E2E Flag Target').get();
    await Promise.all(recs.docs.map((x) => x.ref.delete()));
  });

  test('dismiss deletes the flag, keeps the review, writes a moderationLog entry', async ({ page }) => {
    const { flagId, itemId } = await seedFlaggedReview();
    await openFlagsTab(page);

    const flagItem = page.locator('.flag-item', { hasText: 'E2E moderation test' });
    await expect(flagItem).toBeVisible();
    await flagItem.locator('[data-onclick="dismissFlag"]').click();
    await expect(page.locator('#toast')).toContainText(/flag dismissed/i);

    const d = await db();
    expect((await d.collection('flaggedReviews').doc(flagId).get()).exists).toBe(false);
    expect((await d.collection('items').doc(itemId).get()).exists).toBe(true);

    const log = await d.collection('moderationLog').where('flagId', '==', flagId).get();
    expect(log.empty).toBe(false);
    expect(log.docs[0].data()).toMatchObject({ action: 'dismiss', itemId: null });
  });

  test('remove deletes the review + flag, recomputes the itemRecord, writes a moderationLog entry', async ({ page }) => {
    const { flagId, itemId, itemRecordId } = await seedFlaggedReview({ twoReviews: true });

    await openFlagsTab(page);
    const flagItem = page.locator('.flag-item', { hasText: 'E2E moderation test' });
    page.once('dialog', (dlg) => dlg.accept());
    await flagItem.locator('[data-onclick="removeReviewAndFlag"]').click();
    await expect(page.locator('#toast')).toContainText(/review removed/i);

    const d = await db();
    expect((await d.collection('items').doc(itemId).get()).exists).toBe(false);
    expect((await d.collection('flaggedReviews').doc(flagId).get()).exists).toBe(false);

    const after = await d.collection('itemRecords').doc(itemRecordId).get();
    expect(after.exists).toBe(true);
    expect(after.data().reviewCount).toBe(1);

    // moderationLog shape is frozen by the contract: no `reviewDeleted` field.
    // The review deletion itself is asserted above (items/{itemId} is gone).
    const log = await d.collection('moderationLog').where('flagId', '==', flagId).get();
    expect(log.docs[0].data()).toMatchObject({ action: 'remove', itemId });
  });
});

// ── C9 — markReservationCollected ─────────────────────────────────────────
// The admin + happy-path UI flow (open Manage pre-orders → click "Collected")
// is already covered by tests/manage-offerings.spec.js:200. What's specific
// to C9 and covered here: the closed Firestore rule (a client can no longer
// set status:'collected'), and the callable's server-side gate — the caller
// must be an admin or the *assigned* business user, never the customer.
test.describe('C9 — markReservationCollected', () => {
  // A business user assigned to a seeded bakery — created here rather than in
  // the global seed so the baseline suite's counts stay untouched.
  const MOE = {
    uid: 'seed-user-moe-c9', email: 'moe-c9@crumb.test', pw: 'crumb-e2e-pw',
    name: 'Moe Muffin', bakery: 'Seed Bakehouse Alpha',
  };
  const E2E_OFFERING_ID = 'E2E_c9_offering';

  test.beforeAll(async () => {
    const auth = await adminAuth();
    await auth.createUser({
      uid: MOE.uid, email: MOE.email, password: MOE.pw, displayName: MOE.name,
    }).catch((e) => { if (!/already-exists/.test(e.errorInfo?.code || e.code || '')) throw e; });
    await (await db()).collection('userRoles').doc(MOE.uid).set({
      role: 'business', bakeryName: MOE.bakery, displayName: MOE.name,
    });
  });

  test.afterAll(async () => {
    await (await db()).collection('userRoles').doc(MOE.uid).delete().catch(() => {});
    await (await adminAuth()).deleteUser(MOE.uid).catch(() => {});
  });

  test.afterEach(async () => {
    const stale = await (await db()).collection('reservations')
      .where('offeringId', '==', E2E_OFFERING_ID).get();
    await Promise.all(stale.docs.map((x) => x.ref.delete()));
  });

  async function seedReservation({ bakeryName = MOE.bakery, status = 'pending' } = {}) {
    const ref = await (await db()).collection('reservations').add({
      userId: 'seed-user-dot', userName: 'Dot Dough', userEmail: 'dot@crumb.test',
      bakeryName, offeringId: E2E_OFFERING_ID, offeringName: 'E2E C9 Bun',
      slot: '9:00am', collectDate: '2099-01-01',
      quantity: 1, status, price: 3, totalPrice: 3, createdAt: new Date(),
    });
    return ref.id;
  }

  test('a client can no longer transition a reservation into status:collected', async ({ page }) => {
    test.skip(!RULES_CLOSED, RULES_PENDING);
    const resId = await seedReservation();
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    // The signed-in E2E user is the super-admin; the rule now blocks the
    // 'collected' transition regardless of who's writing.
    const outcome = await page.evaluate(async (id) => {
      const { db, doc, updateDoc } = window._crumb;
      try {
        await updateDoc(doc(db, 'reservations', id), { status: 'collected', collectedAt: new Date().toISOString() });
        return 'allowed';
      } catch (e) { return e.code || 'rejected'; }
    }, resId);
    expect(outcome).toMatch(/permission-denied|rejected/);

    const snap = await (await db()).collection('reservations').doc(resId).get();
    expect(snap.data().status).toBe('pending');
  });

  test('the callable refuses the customer and accepts the assigned business user', async ({ page }) => {
    const resId = await seedReservation();
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    // Dot owns the reservation but is a plain customer — refused.
    const asCustomer = await page.evaluate(async (id) => {
      await window._crumb.signInWithEmailAndPassword(window._crumb.auth, 'dot@crumb.test', 'crumb-e2e-pw');
      const call = window._crumb.httpsCallable(window._crumb.functions, 'markReservationCollected');
      try { await call({ reservationId: id }); return 'allowed'; }
      catch (e) { return e.code || 'rejected'; }
    }, resId);
    expect(asCustomer).toBe('functions/permission-denied');

    // Moe is the business user assigned to this bakery — accepted.
    const asBusiness = await page.evaluate(async ({ id, email, pw }) => {
      await window._crumb.signInWithEmailAndPassword(window._crumb.auth, email, pw);
      const call = window._crumb.httpsCallable(window._crumb.functions, 'markReservationCollected');
      const res = await call({ reservationId: id });
      return res.data;
    }, { id: resId, email: MOE.email, pw: MOE.pw });
    expect(asBusiness).toMatchObject({ status: 'collected', bakeryName: MOE.bakery });
    expect(typeof asBusiness.collectedAt).toBe('string');

    const snap = await (await db()).collection('reservations').doc(resId).get();
    expect(snap.data().status).toBe('collected');
    // Written as a real Firestore Timestamp, not the old client ISO string.
    expect(snap.data().collectedAt.constructor.name).toBe('Timestamp');
  });

  test('the callable refuses a business user from a different bakery', async ({ page }) => {
    const resId = await seedReservation({ bakeryName: 'Seed Bakehouse Beta' });
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const outcome = await page.evaluate(async ({ id, email, pw }) => {
      await window._crumb.signInWithEmailAndPassword(window._crumb.auth, email, pw);
      const call = window._crumb.httpsCallable(window._crumb.functions, 'markReservationCollected');
      try { await call({ reservationId: id }); return 'allowed'; }
      catch (e) { return e.code || 'rejected'; }
    }, { id: resId, email: MOE.email, pw: MOE.pw });
    expect(outcome).toBe('functions/permission-denied');

    const snap = await (await db()).collection('reservations').doc(resId).get();
    expect(snap.data().status).toBe('pending');
  });
});

// ── C8 / C8b — createReservation / cancelReservation ──────────────────────
// Collection-time preconditions (NOT_YET_LIVE / PAST_COLLECTION /
// WITHIN_CUTOFF) are deliberately client-side only — see the header of
// functions/reservations.js and docs/cloud-functions-phase.md. What's tested
// here is the security-critical half: the transactional stock decrement /
// restock (by REAL quantity — the bug this replaces leaked a unit), the
// server-set price, the duplicate/sold-out/max-per-person guards, cancel
// ownership, and the closed client write rules.
test.describe('C8 / C8b — createReservation / cancelReservation', () => {
  const OFFERING_PREFIX = 'E2E_c8_';
  const CUST = { email: 'dot@crumb.test', pw: 'crumb-e2e-pw' };      // seeded customer
  const OTHER = { email: 'cal@crumb.test', pw: 'crumb-e2e-pw' };     // a different customer

  async function seedOffering({ remaining = 5, price = 3, maxPerPerson = 3 } = {}) {
    const ref = await (await db()).collection('preorderOfferings').add({
      bakeryName: 'Seed Bakehouse Alpha',
      name: `${OFFERING_PREFIX}Bun`, description: '',
      price, quantity: remaining, remaining, maxPerPerson,
      slot: '9:00am–11:00am', collectDate: '2099-01-01',
      goLiveAt: '2000-01-01T00:00:00.000Z', photoURL: null,
      createdBy: 'KTpBS4yJx2h8LpcryCTfJDFCHlr2', active: true,
      createdAt: new Date(),
    });
    return ref.id;
  }

  async function seedReservation(offeringId, { quantity = 2, status = 'pending', userId = 'seed-user-dot' } = {}) {
    const ref = await (await db()).collection('reservations').add({
      userId, userName: 'Dot Dough', userEmail: 'dot@crumb.test',
      bakeryName: 'Seed Bakehouse Alpha', offeringId, offeringName: `${OFFERING_PREFIX}Bun`,
      slot: '9:00am–11:00am', collectDate: '2099-01-01',
      quantity, status, price: 3, totalPrice: 3 * quantity, createdAt: new Date(),
    });
    return ref.id;
  }

  test.afterEach(async () => {
    const d = await db();
    for (const [coll, field] of [['preorderOfferings', 'name'], ['reservations', 'offeringName']]) {
      const stale = await d.collection(coll).where(field, '==', `${OFFERING_PREFIX}Bun`).get();
      await Promise.all(stale.docs.map((x) => x.ref.delete()));
    }
  });

  // callable invoked in-page as a specific signed-in user
  async function callInPage(page, { email, pw }, name, payload) {
    return page.evaluate(async ({ email, pw, name, payload }) => {
      await window._crumb.signInWithEmailAndPassword(window._crumb.auth, email, pw);
      const call = window._crumb.httpsCallable(window._crumb.functions, name);
      try { return { ok: true, data: (await call(payload)).data }; }
      catch (e) { return { ok: false, code: e.code || 'rejected', detail: e.details?.code || null }; }
    }, { email, pw, name, payload });
  }

  test('createReservation: server sets price, decrements stock transactionally', async ({ page }) => {
    const offeringId = await seedOffering({ remaining: 5, price: 3, maxPerPerson: 3 });
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const res = await callInPage(page, CUST, 'createReservation', { offeringId, quantity: 2 });
    expect(res.ok).toBe(true);
    expect(res.data.remaining).toBe(3);
    expect(res.data.reservation).toMatchObject({
      quantity: 2, price: 3, totalPrice: 6, status: 'pending',
      bakeryName: 'Seed Bakehouse Alpha', userId: 'seed-user-dot',
    });
    expect(typeof res.data.reservation.createdAt).toBe('string');

    const d = await db();
    expect((await d.collection('preorderOfferings').doc(offeringId).get()).data().remaining).toBe(3);
    const written = await d.collection('reservations').doc(res.data.reservationId).get();
    expect(written.data()).toMatchObject({ quantity: 2, totalPrice: 6, status: 'pending' });
    expect(written.data().createdAt.constructor.name).toBe('Timestamp');
  });

  test('createReservation: SOLD_OUT when quantity exceeds remaining, stock untouched', async ({ page }) => {
    const offeringId = await seedOffering({ remaining: 1 });
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const res = await callInPage(page, CUST, 'createReservation', { offeringId, quantity: 2 });
    expect(res).toMatchObject({ ok: false, code: 'functions/failed-precondition', detail: 'SOLD_OUT' });
    expect((await (await db()).collection('preorderOfferings').doc(offeringId).get()).data().remaining).toBe(1);
  });

  test('createReservation: OVER_MAX_PER_PERSON and DUPLICATE_RESERVATION', async ({ page }) => {
    const offeringId = await seedOffering({ remaining: 10, maxPerPerson: 2 });
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const over = await callInPage(page, CUST, 'createReservation', { offeringId, quantity: 3 });
    expect(over).toMatchObject({ ok: false, detail: 'OVER_MAX_PER_PERSON' });

    const first = await callInPage(page, CUST, 'createReservation', { offeringId, quantity: 1 });
    expect(first.ok).toBe(true);
    const dup = await callInPage(page, CUST, 'createReservation', { offeringId, quantity: 1 });
    expect(dup).toMatchObject({ ok: false, detail: 'DUPLICATE_RESERVATION' });
  });

  test('cancelReservation: returns the REAL quantity to stock (not a hardcoded +1)', async ({ page }) => {
    const offeringId = await seedOffering({ remaining: 3 });
    const resId = await seedReservation(offeringId, { quantity: 2 });
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const res = await callInPage(page, CUST, 'cancelReservation', { reservationId: resId });
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ status: 'cancelled', remaining: 5 }); // 3 + 2, the bug fix

    const d = await db();
    expect((await d.collection('reservations').doc(resId).get()).data().status).toBe('cancelled');
    expect((await d.collection('preorderOfferings').doc(offeringId).get()).data().remaining).toBe(5);

    const again = await callInPage(page, CUST, 'cancelReservation', { reservationId: resId });
    expect(again).toMatchObject({ ok: false, detail: 'ALREADY_CANCELLED' });
  });

  test('cancelReservation: refuses a caller who is neither the owner nor an admin', async ({ page }) => {
    const offeringId = await seedOffering({ remaining: 3 });
    const resId = await seedReservation(offeringId, { quantity: 1 });
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const res = await callInPage(page, OTHER, 'cancelReservation', { reservationId: resId });
    expect(res).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect((await (await db()).collection('reservations').doc(resId).get()).data().status).toBe('pending');
  });

  test('the client can no longer create a reservation or decrement another bakery\'s stock directly', async ({ page }) => {
    test.skip(!RULES_CLOSED, RULES_PENDING);
    // Offering owned by the super-admin; the attacker is a plain customer.
    const offeringId = await seedOffering({ remaining: 5 });
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const outcome = await page.evaluate(async ({ offId, email, pw }) => {
      await window._crumb.signInWithEmailAndPassword(window._crumb.auth, email, pw);
      const { db, doc, updateDoc, collection, addDoc, auth } = window._crumb;
      const out = {};
      try {
        await addDoc(collection(db, 'reservations'), {
          userId: auth.currentUser.uid, offeringId: offId,
          bakeryName: 'Seed Bakehouse Alpha', quantity: 1, status: 'pending',
        });
        out.create = 'allowed';
      } catch (e) { out.create = e.code || 'rejected'; }
      try {
        // This is exactly what the removed hasOnly(['remaining']) clause used
        // to permit for any signed-in user.
        await updateDoc(doc(db, 'preorderOfferings', offId), { remaining: 0 });
        out.decrement = 'allowed';
      } catch (e) { out.decrement = e.code || 'rejected'; }
      return out;
    }, { offId: offeringId, email: OTHER.email, pw: OTHER.pw });

    expect(outcome.create).toMatch(/permission-denied|rejected/);
    expect(outcome.decrement).toMatch(/permission-denied|rejected/);
    expect((await (await db()).collection('preorderOfferings').doc(offeringId).get()).data().remaining).toBe(5);
  });
});

// ── C1 / C1b — submitReview / updateReview / deleteReview ──────────────────
// The security-critical half: validation, the per-user rate limit, the
// server-computed aggregates (communityAvg/reviewCount/avgPrice/priceCount/
// dim_*), the update/delete ownership gate, and the closed client write
// rules. Not re-tested here: the full add/edit/delete review UI flows —
// those are covered end-to-end by tests/edit-review.spec.js and every other
// spec that creates a review via tests/utils/reviews.js's createReview
// fixture, which now exercises this exact path.
test.describe('C1 / C1b — submitReview / updateReview / deleteReview', () => {
  const NAME_PREFIX = 'E2E_c1_';
  const CUST = { email: 'dot@crumb.test', pw: 'crumb-e2e-pw' };      // seeded customer
  const OTHER = { email: 'cal@crumb.test', pw: 'crumb-e2e-pw' };     // a different customer
  const ADMIN = { email: 'e2e@crumb.test', pw: 'crumb-e2e-pw' };     // seeded super-admin

  const DIMS = { dim_appearance: 4, dim_texture: 4, dim_flavour: 4, dim_value: 4, dim_crust: 4 };

  test.afterEach(async () => {
    const d = await db();
    // '\uf8ff' (a high Unicode private-use codepoint) as the upper bound is
    // Firestore's documented prefix-range trick — matches exactly the
    // strings starting with NAME_PREFIX.
    const upperBound = NAME_PREFIX + '\uf8ff';
    const itemsSnap = await d.collection('items').where('name', '>=', NAME_PREFIX)
      .where('name', '<', upperBound).get();
    const recordIds = new Set(itemsSnap.docs.map((x) => x.data().itemRecordId).filter(Boolean));
    await Promise.all(itemsSnap.docs.map((x) => x.ref.delete()));
    const recsSnap = await d.collection('itemRecords').where('name', '>=', NAME_PREFIX)
      .where('name', '<', upperBound).get();
    for (const r of recsSnap.docs) recordIds.add(r.id);
    await Promise.all([...recordIds].map((id) => d.collection('itemRecords').doc(id).delete().catch(() => {})));
    await d.collection('reviewRateLimits').doc('seed-user-dot').delete().catch(() => {});
  });

  // callable invoked in-page as a specific signed-in user
  async function callInPage(page, { email, pw }, name, payload) {
    return page.evaluate(async ({ email, pw, name, payload }) => {
      await window._crumb.signInWithEmailAndPassword(window._crumb.auth, email, pw);
      const call = window._crumb.httpsCallable(window._crumb.functions, name);
      try { return { ok: true, data: (await call(payload)).data }; }
      catch (e) { return { ok: false, code: e.code || 'rejected', detail: e.details?.code || null, message: e.message }; }
    }, { email, pw, name, payload });
  }

  function baseFields(overrides = {}) {
    return {
      itemName: `${NAME_PREFIX}Loaf`, bakeryName: 'Seed Bakehouse Alpha',
      bakeryAddress: '', bakeryPlaceId: null, bakeryLat: null, bakeryLng: null,
      category: 'bread', subCategory: '', overallRating: 4, dims: DIMS,
      price: 3.5, notes: 'Tasty', photoURL: null,
      ...overrides,
    };
  }

  test('submitReview: creates a new item + itemRecord with server-computed aggregate', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const res = await callInPage(page, CUST, 'submitReview', baseFields());
    expect(res.ok).toBe(true);
    expect(res.data.item).toMatchObject({ name: `${NAME_PREFIX}Loaf`, overallRating: 4, userId: 'seed-user-dot' });
    expect(res.data.itemRecord).toMatchObject({ communityAvg: 4, reviewCount: 1, avgPrice: 3.5, priceCount: 1 });

    const d = await db();
    const written = await d.collection('items').doc(res.data.itemId).get();
    expect(written.data()).toMatchObject({ name: `${NAME_PREFIX}Loaf`, userId: 'seed-user-dot' });
    const record = await d.collection('itemRecords').doc(res.data.itemRecordId).get();
    expect(record.data()).toMatchObject({ communityAvg: 4, reviewCount: 1 });
  });

  test("submitReview linking to an existing record recomputes the aggregate but never rewrites the record's identity", async ({ page }) => {
    const d = await db();
    const recRef = await d.collection('itemRecords').add({
      name: `${NAME_PREFIX}Sourdough`, category: 'bread', subCategory: 'sourdough',
      bakeryName: 'Seed Bakehouse Alpha', bakeryAddress: '', bakeryPlaceId: null,
      communityAvg: 5, reviewCount: 1, avgPrice: 4, priceCount: 1, photoURL: null,
      ...DIMS, createdAt: new Date(),
    });
    await d.collection('items').add({
      itemRecordId: recRef.id, name: `${NAME_PREFIX}Sourdough`, category: 'bread', subCategory: 'sourdough',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 5, communityAvg: 5, userId: 'seed-user-cal',
      userName: 'Cal Crust', price: 4, notes: '', photoURL: null, createdAt: new Date(), ...DIMS,
    });

    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    // A category that doesn't match the linked record is refused outright —
    // it would mix another category's dims into the shared record.
    const mismatched = await callInPage(page, CUST, 'submitReview', baseFields({
      itemName: `${NAME_PREFIX}Hijacked Name`, category: 'cake', overallRating: 3, price: 2,
      dims: { dim_appearance: 3, dim_texture: 3, dim_flavour: 3, dim_value: 3, dim_moistness: 3 },
      itemRecordId: recRef.id,
    }));
    expect(mismatched).toMatchObject({ ok: false, code: 'functions/invalid-argument' });
    expect((await recRef.get()).data()).toMatchObject({ communityAvg: 5, reviewCount: 1 });

    // Submits under a DIFFERENT name than the record's own — the record's
    // identity must not change (the bug this fix closes).
    const res = await callInPage(page, CUST, 'submitReview', baseFields({
      itemName: `${NAME_PREFIX}Hijacked Name`, overallRating: 3, price: 2,
      dims: { dim_appearance: 3, dim_texture: 3, dim_flavour: 3, dim_value: 3, dim_crust: 2 },
      itemRecordId: recRef.id,
    }));
    expect(res.ok).toBe(true);
    expect(res.data.itemRecord).toMatchObject({ communityAvg: 4, reviewCount: 2, dim_crust: 3 }); // avg of 5/3, 4/2

    const record = await recRef.get();
    expect(record.data()).toMatchObject({
      name: `${NAME_PREFIX}Sourdough`, category: 'bread', subCategory: 'sourdough', // unchanged
      communityAvg: 4, reviewCount: 2, avgPrice: 3, priceCount: 2, // recomputed
    });
    // The new review itself keeps its own submitted name.
    const item = await (await db()).collection('items').doc(res.data.itemId).get();
    expect(item.data()).toMatchObject({ name: `${NAME_PREFIX}Hijacked Name`, category: 'bread' });
  });

  // The live sliders move in 0.1 steps (index.html #overallRating); the
  // validator must match, with a float tolerance — 0.7 and 1.1 are the
  // classic cases where v * 10 isn't an exact integer in JS.
  test('submitReview accepts overallRating in 0.1 steps from 0.1 to 5 and rejects anything else', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    for (const rating of [0.7, 1.1, 4.9]) {
      const res = await callInPage(page, CUST, 'submitReview',
        baseFields({ itemName: `${NAME_PREFIX}Step ${rating}`, overallRating: rating }));
      expect(res, `rating ${rating}`).toMatchObject({ ok: true });
      const stored = await (await db()).collection('items').doc(res.data.itemId).get();
      expect(stored.data().overallRating, `stored rating ${rating}`).toBe(rating);
    }

    for (const rating of [0, 5.1, 3.35]) {
      const res = await callInPage(page, CUST, 'submitReview', baseFields({ overallRating: rating }));
      expect(res, `rating ${rating}`).toMatchObject({
        ok: false, code: 'functions/invalid-argument',
        // The client SDK appends " [400]" — see serverMessage() in src/services/functions.js.
        message: expect.stringMatching(/^Overall rating must be between 0\.1 and 5, in steps of 0\.1\.( \[400\])?$/),
      });
    }
  });

  test('submitReview rejects mismatched dims keys and a photoURL not under the caller\'s own uid', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const badDims = await callInPage(page, CUST, 'submitReview', baseFields({ dims: { dim_appearance: 4 } }));
    expect(badDims).toMatchObject({ ok: false, code: 'functions/invalid-argument' });

    const badPhoto = await callInPage(page, CUST, 'submitReview', baseFields({
      photoURL: 'https://firebasestorage.example/v0/b/x/o/items%2Fseed-user-cal%2F1_photo.jpg?alt=media',
    }));
    expect(badPhoto).toMatchObject({ ok: false, code: 'functions/invalid-argument' });
  });

  test('submitReview: RATE_LIMITED after 10 reviews in the last hour', async ({ page }) => {
    const d = await db();
    await d.collection('reviewRateLimits').doc('seed-user-dot').set({
      timestamps: Array.from({ length: 10 }, (_, i) => Date.now() - i * 1000),
    });

    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const res = await callInPage(page, CUST, 'submitReview', baseFields());
    expect(res).toMatchObject({ ok: false, code: 'functions/resource-exhausted', detail: 'RATE_LIMITED' });
  });

  test('updateReview: owner can edit (name, rating, dims); aggregate recomputes; non-owner is refused; admin is allowed', async ({ page }) => {
    const d = await db();
    const recRef = await d.collection('itemRecords').add({
      name: `${NAME_PREFIX}Baguette`, category: 'bread', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', bakeryAddress: '', bakeryPlaceId: null,
      communityAvg: 3, reviewCount: 1, avgPrice: 2, priceCount: 1, photoURL: null,
      ...DIMS, createdAt: new Date(),
    });
    const itemRef = await d.collection('items').add({
      itemRecordId: recRef.id, name: `${NAME_PREFIX}Baguette`, category: 'bread', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 3, communityAvg: 3, userId: 'seed-user-dot',
      userName: 'Dot Dough', price: 2, notes: '', photoURL: null, createdAt: new Date(), ...DIMS,
    });

    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const refused = await callInPage(page, OTHER, 'updateReview', {
      itemId: itemRef.id, name: `${NAME_PREFIX}Baguette`, category: 'bread', subCategory: '',
      overallRating: 5, dims: DIMS, price: 2, notes: '',
    });
    expect(refused).toMatchObject({ ok: false, code: 'functions/permission-denied' });

    const res = await callInPage(page, CUST, 'updateReview', {
      itemId: itemRef.id, name: `${NAME_PREFIX}Baguette Deluxe`, category: 'bread', subCategory: '',
      overallRating: 5, dims: DIMS, price: 2, notes: 'Even better now',
    });
    expect(res.ok).toBe(true);
    expect(res.data.item).toMatchObject({ name: `${NAME_PREFIX}Baguette Deluxe`, overallRating: 5 });
    expect(res.data.itemRecord).toMatchObject({ communityAvg: 5, reviewCount: 1 });

    const asAdmin = await callInPage(page, ADMIN, 'updateReview', {
      itemId: itemRef.id, name: `${NAME_PREFIX}Baguette Deluxe`, category: 'bread', subCategory: '',
      overallRating: 2, dims: DIMS, price: 2, notes: 'Admin correction',
    });
    expect(asAdmin.ok).toBe(true);
    expect((await recRef.get()).data().communityAvg).toBe(2);
  });

  test('deleteReview: recomputes the aggregate when siblings remain, deletes the record when it was the last review, and refuses a non-owner/non-admin', async ({ page }) => {
    const d = await db();
    const recRef = await d.collection('itemRecords').add({
      name: `${NAME_PREFIX}Croissant`, category: 'pastry', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', bakeryAddress: '', bakeryPlaceId: null,
      communityAvg: 4, reviewCount: 2, avgPrice: 3, priceCount: 2,
      dim_appearance: 4, dim_texture: 4, dim_flavour: 4, dim_value: 4, dim_lamination: 4,
      photoURL: null, createdAt: new Date(),
    });
    const dims = { dim_appearance: 4, dim_texture: 4, dim_flavour: 4, dim_value: 4, dim_lamination: 4 };
    const dotItem = await d.collection('items').add({
      itemRecordId: recRef.id, name: `${NAME_PREFIX}Croissant`, category: 'pastry', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 3, communityAvg: 4, userId: 'seed-user-dot',
      userName: 'Dot Dough', price: 3, notes: '', photoURL: null, createdAt: new Date(), ...dims,
    });
    const calItem = await d.collection('items').add({
      itemRecordId: recRef.id, name: `${NAME_PREFIX}Croissant`, category: 'pastry', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 5, communityAvg: 4, userId: 'seed-user-cal',
      userName: 'Cal Crust', price: 3, notes: '', photoURL: null, createdAt: new Date(), ...dims,
    });

    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const refused = await callInPage(page, OTHER, 'deleteReview', { itemId: dotItem.id });
    expect(refused).toMatchObject({ ok: false, code: 'functions/permission-denied' });

    const first = await callInPage(page, CUST, 'deleteReview', { itemId: dotItem.id });
    expect(first).toMatchObject({ ok: true, data: { itemRecordDeleted: false } });
    expect((await dotItem.get()).exists).toBe(false);
    expect((await recRef.get()).data()).toMatchObject({ communityAvg: 5, reviewCount: 1 }); // Cal's review only

    const second = await callInPage(page, CUST, 'deleteReview', { itemId: calItem.id }); // admin-equivalent not needed: Cal owns it, but Dot (CUST) isn't — use OTHER (Cal) instead
    expect(second).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    const asOwner = await callInPage(page, OTHER, 'deleteReview', { itemId: calItem.id });
    expect(asOwner).toMatchObject({ ok: true, data: { itemRecordDeleted: true } });
    expect((await recRef.get()).exists).toBe(false);
  });

  test('updateReview: a category change drops the old 5th dim from the review and the record averages each dim only over reviews that carry it', async ({ page }) => {
    const d = await db();
    const recRef = await d.collection('itemRecords').add({
      name: `${NAME_PREFIX}Bloomer`, category: 'bread', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', bakeryAddress: '', bakeryPlaceId: null,
      communityAvg: 4, reviewCount: 2, avgPrice: null, priceCount: 0, photoURL: null,
      ...DIMS, createdAt: new Date(),
    });
    const dotItem = await d.collection('items').add({
      itemRecordId: recRef.id, name: `${NAME_PREFIX}Bloomer`, category: 'bread', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 4, communityAvg: 4, userId: 'seed-user-dot',
      userName: 'Dot Dough', price: null, notes: '', photoURL: null, createdAt: new Date(), ...DIMS,
    });
    await d.collection('items').add({
      itemRecordId: recRef.id, name: `${NAME_PREFIX}Bloomer`, category: 'bread', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 4, communityAvg: 4, userId: 'seed-user-cal',
      userName: 'Cal Crust', price: null, notes: '', photoURL: null, createdAt: new Date(), ...DIMS,
    });

    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const res = await callInPage(page, CUST, 'updateReview', {
      itemId: dotItem.id, name: `${NAME_PREFIX}Bloomer`, category: 'pastry', subCategory: '',
      overallRating: 2, price: null, notes: '',
      dims: { dim_appearance: 2, dim_texture: 2, dim_flavour: 2, dim_value: 2, dim_lamination: 2 },
    });
    expect(res.ok).toBe(true);
    expect(res.data.item.dim_crust).toBeUndefined();
    expect(typeof res.data.item.createdAt).toBe('string'); // serialized, not a raw Timestamp

    const item = (await dotItem.get()).data();
    expect(item.dim_crust).toBeUndefined();
    expect(item.dim_lamination).toBe(2);

    // dim_crust now comes only from Cal's review (4) — not (4 + 0) / 2.
    expect((await recRef.get()).data()).toMatchObject({
      communityAvg: 3, reviewCount: 2, dim_appearance: 3, dim_crust: 4, dim_lamination: 2,
    });
  });

  test('updateReview: an unchanged photoURL is accepted even when it is not under the caller\'s uid (admin edit); a new foreign one is refused', async ({ page }) => {
    const d = await db();
    const bucketPath = 'http://127.0.0.1:9199/v0/b/crumb-ddeb6.firebasestorage.app/o/';
    const dotPhoto = `${bucketPath}items%2Fseed-user-dot%2F1_photo.jpg?alt=media`;
    const itemRef = await d.collection('items').add({
      name: `${NAME_PREFIX}Photo Bun`, category: 'bread', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 3, communityAvg: 3, userId: 'seed-user-dot',
      userName: 'Dot Dough', price: null, notes: '', photoURL: dotPhoto, createdAt: new Date(), ...DIMS,
    });
    const fields = { itemId: itemRef.id, name: `${NAME_PREFIX}Photo Bun`, category: 'bread', subCategory: '',
      overallRating: 4, dims: DIMS, price: null, notes: '' };

    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const unchanged = await callInPage(page, ADMIN, 'updateReview', { ...fields, photoURL: dotPhoto });
    expect(unchanged.ok).toBe(true);
    expect((await itemRef.get()).data()).toMatchObject({ overallRating: 4, photoURL: dotPhoto });

    const foreign = await callInPage(page, CUST, 'updateReview', {
      ...fields, photoURL: `${bucketPath}items%2Fseed-user-cal%2F2_photo.jpg?alt=media`,
    });
    expect(foreign).toMatchObject({ ok: false, code: 'functions/invalid-argument' });

    const own = await callInPage(page, CUST, 'updateReview', {
      ...fields, photoURL: `${bucketPath}items%2Fseed-user-dot%2F3_photo.jpg?alt=media`,
    });
    expect(own.ok).toBe(true);
  });

  test('updateReview / deleteReview on a review whose itemRecord is gone never recreate a ghost record', async ({ page }) => {
    const d = await db();
    const ghostId = `${NAME_PREFIX}ghost_record`;
    const itemRef = await d.collection('items').add({
      itemRecordId: ghostId, name: `${NAME_PREFIX}Orphan`, category: 'bread', subCategory: '',
      bakeryName: 'Seed Bakehouse Alpha', overallRating: 3, communityAvg: 3, userId: 'seed-user-dot',
      userName: 'Dot Dough', price: null, notes: '', photoURL: null, createdAt: new Date(), ...DIMS,
    });

    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const upd = await callInPage(page, CUST, 'updateReview', {
      itemId: itemRef.id, name: `${NAME_PREFIX}Orphan`, category: 'bread', subCategory: '',
      overallRating: 5, dims: DIMS, price: null, notes: '',
    });
    expect(upd).toMatchObject({ ok: true, data: { itemRecord: null } });
    expect((await d.collection('itemRecords').doc(ghostId).get()).exists).toBe(false);

    const del = await callInPage(page, CUST, 'deleteReview', { itemId: itemRef.id });
    expect(del).toMatchObject({ ok: true, data: { itemRecordDeleted: false } });
    expect((await itemRef.get()).exists).toBe(false);
    expect((await d.collection('itemRecords').doc(ghostId).get()).exists).toBe(false);
  });

  test('the client can no longer write to items or itemRecords directly', async ({ page }) => {
    test.skip(!RULES_CLOSED, RULES_PENDING);
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

    const outcome = await page.evaluate(async ({ email, pw }) => {
      await window._crumb.signInWithEmailAndPassword(window._crumb.auth, email, pw);
      const { db, doc, addDoc, updateDoc, deleteDoc, collection } = window._crumb;
      const out = {};
      try {
        await addDoc(collection(db, 'items'), { name: 'x', userId: 'seed-user-dot' });
        out.itemCreate = 'allowed';
      } catch (e) { out.itemCreate = e.code || 'rejected'; }
      try {
        await addDoc(collection(db, 'itemRecords'), { name: 'x' });
        out.recordCreate = 'allowed';
      } catch (e) { out.recordCreate = e.code || 'rejected'; }
      return out;
    }, CUST);

    expect(outcome.itemCreate).toMatch(/permission-denied|rejected/);
    expect(outcome.recordCreate).toMatch(/permission-denied|rejected/);
  });
});
