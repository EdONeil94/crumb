// C9 — markReservationCollected
//
// Replaces manageOfferingsModal.js markCollected() (also reached from
// qrCode.js confirmCollected() after a QR scan). Today firestore.rules lets a
// reservation's own userId set status:'collected' — so a customer can mark
// their own order collected from the browser console without ever visiting
// the bakery. This moves the write behind an admin / assigned-business gate.
//
// C8 (createReservation) and C8b (cancelReservation) are added to this file
// when their turn comes in the sequential order — see
// .claude/contracts/cloud-functions-contract.md.

const {
  functions, db, Timestamp,
  requireAuth, isAdminUid, getRoleRecord,
  invalid, precondition, notFound, permissionDenied,
} = require('./shared');

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

module.exports = { markReservationCollected };
