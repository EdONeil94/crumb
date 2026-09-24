// C8 / C8b / C9 — pre-order reservation lifecycle, server-side.
//
// C8  createReservation        — transactional stock decrement + server-set price
// C8b cancelReservation        — transactional stock return (by real quantity)
// C9  markReservationCollected — bakery-side only, not the customer
//
// Replaces bakeryModal.js reserveOffering(), legacy-app.js cancelReservation(),
// and manageOfferingsModal.js markCollected(). See
// .claude/contracts/cloud-functions-contract.md.
//
// COLLECTION-TIME CHECKS ARE CLIENT-SIDE ONLY (decision 2026-08-31, Ed).
// The contract lists NOT_YET_LIVE / PAST_COLLECTION (C8) and WITHIN_CUTOFF
// (C8b) as error codes. They are deliberately NOT enforced here: they aren't
// a security boundary (there is no incentive to reserve or cancel a past
// offering, and no no-show penalty), and enforcing them server-side would
// mean the Functions emulator's real clock fighting the E2E suite's mocked
// browser clock. The client keeps them as UX guardrails — renderPreorderTab
// only shows a Reserve button for live, upcoming offerings; renderOrdersTab
// hides Cancel inside 12h. Revisit if a real threat model appears.
// Tracked in docs/cloud-functions-phase.md.

const {
  functions, db, FieldValue, Timestamp, admin,
  requireAuth, isAdminUid, getRoleRecord,
  invalid, precondition, notFound, permissionDenied,
} = require('./shared');

// ─── C8 ────────────────────────────────────────────────────────────────────
const createReservation = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { offeringId, quantity } = data || {};

  if (typeof offeringId !== 'string' || !offeringId.trim()) invalid('offeringId');
  if (!Number.isInteger(quantity) || quantity < 1) {
    invalid('quantity', 'quantity must be a positive whole number.');
  }
  const offId = offeringId.trim();

  // Duplicate check is a plain query just before the transaction — see the
  // contract's "Accepted residual": two simultaneous taps could still create
  // two reservations, but stock stays correct because the decrement is
  // transactional.
  const dupSnap = await db.collection('reservations')
    .where('userId', '==', uid)
    .where('offeringId', '==', offId)
    .where('status', '==', 'pending')
    .limit(1).get();
  if (!dupSnap.empty) {
    precondition('DUPLICATE_RESERVATION', 'You already have a reservation for this item.');
  }

  const userRecord = await admin.auth().getUser(uid).catch(() => null);
  const profileSnap = await db.collection('profiles').doc(uid).get();
  const userName = (profileSnap.exists && profileSnap.data().displayName)
    || userRecord?.displayName
    || userRecord?.email?.split('@')[0]
    || 'Customer';
  const userEmail = userRecord?.email || '';

  const offeringRef = db.collection('preorderOfferings').doc(offId);
  const reservationRef = db.collection('reservations').doc();

  const result = await db.runTransaction(async (tx) => {
    const offSnap = await tx.get(offeringRef);
    if (!offSnap.exists || offSnap.data().active === false) {
      notFound('That offering is no longer available.');
    }
    const off = offSnap.data();

    const maxPerPerson = off.maxPerPerson || 2;
    if (quantity > maxPerPerson) {
      precondition('OVER_MAX_PER_PERSON', `Maximum ${maxPerPerson} per person.`);
    }
    const remaining = off.remaining ?? off.quantity ?? 0;
    if (remaining < quantity) {
      precondition('SOLD_OUT', 'Not enough stock left.');
    }

    const price = Number(off.price) || 0;
    const reservation = {
      userId: uid,
      userName,
      userEmail,
      bakeryName: off.bakeryName || '',
      offeringId: offId,
      offeringName: off.name || '',
      slot: off.slot || '',
      collectDate: off.collectDate || '',
      quantity,
      status: 'pending',
      price,
      totalPrice: Math.round(price * quantity * 100) / 100,
      createdAt: FieldValue.serverTimestamp(),
    };

    tx.update(offeringRef, { remaining: remaining - quantity });
    tx.set(reservationRef, reservation);

    return { reservation, remaining: remaining - quantity };
  });

  return {
    reservationId: reservationRef.id,
    reservation: { ...result.reservation, createdAt: Timestamp.now().toDate().toISOString() },
    remaining: result.remaining,
  };
});

// ─── C8b ───────────────────────────────────────────────────────────────────
const cancelReservation = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { reservationId } = data || {};
  if (typeof reservationId !== 'string' || !reservationId.trim()) invalid('reservationId');
  const resId = reservationId.trim();

  const callerIsAdmin = await isAdminUid(uid);
  const reservationRef = db.collection('reservations').doc(resId);

  const remaining = await db.runTransaction(async (tx) => {
    const snap = await tx.get(reservationRef);
    if (!snap.exists) notFound('That reservation no longer exists.');
    const r = snap.data();

    if (r.userId !== uid && !callerIsAdmin) {
      permissionDenied('You can only cancel your own reservation.');
    }
    if (r.status === 'cancelled') precondition('ALREADY_CANCELLED', 'That reservation is already cancelled.');
    if (r.status === 'collected') precondition('ALREADY_COLLECTED', 'That reservation has already been collected.');

    // All reads must precede all writes in a Firestore transaction.
    let newRemaining = null;
    let offRef = null;
    if (r.offeringId) {
      offRef = db.collection('preorderOfferings').doc(r.offeringId);
      const offSnap = await tx.get(offRef);
      if (offSnap.exists) {
        // Return the reservation's REAL quantity — the client path this
        // replaces added a hardcoded +1, leaking a unit per multi-item cancel.
        newRemaining = (offSnap.data().remaining ?? 0) + (Number(r.quantity) || 1);
      } else {
        offRef = null;
      }
    }

    if (offRef) tx.update(offRef, { remaining: newRemaining });
    tx.update(reservationRef, { status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
    return newRemaining;
  });

  return { reservationId: resId, status: 'cancelled', remaining };
});

// ─── C9 ────────────────────────────────────────────────────────────────────
const markReservationCollected = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { reservationId } = data || {};
  if (typeof reservationId !== 'string' || !reservationId.trim()) invalid('reservationId');
  const resId = reservationId.trim();

  const reservationRef = db.collection('reservations').doc(resId);
  const snap = await reservationRef.get();
  if (!snap.exists) notFound('That reservation no longer exists.');
  const r = snap.data();

  // The caller must be the *bakery* side — an admin, or the business user
  // assigned to this reservation's bakery. Never the customer.
  if (!(await isAdminUid(uid))) {
    const role = await getRoleRecord(uid);
    const isAssignedBusiness = !!role
      && role.role === 'business'
      && role.bakeryName === r.bakeryName;
    if (!isAssignedBusiness) {
      permissionDenied('Only the bakery can mark an order collected.');
    }
  }

  if (r.status === 'collected') {
    precondition('ALREADY_COLLECTED', 'That order is already marked collected.');
  }
  if (r.status === 'cancelled') {
    precondition('CANCELLED', 'That reservation was cancelled.');
  }

  // Ground rule: write a real Firestore Timestamp, return an ISO-8601 string.
  const collectedAt = Timestamp.now();
  await reservationRef.update({ status: 'collected', collectedAt });

  return {
    reservationId: resId,
    status: 'collected',
    collectedAt: collectedAt.toDate().toISOString(),
    offeringName: r.offeringName || '',
    bakeryName: r.bakeryName || '',
    userName: r.userName || '',
  };
});

module.exports = { createReservation, cancelReservation, markReservationCollected };
