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
