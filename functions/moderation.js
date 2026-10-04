// C3 — moderateFlaggedReview
// Replaces adminPanel.js removeReviewAndFlag() / dismissFlag(), both of which
// are currently rejected from the client (firestore.rules lets only the
// super-admin delete a flaggedReviews doc, and removal also needs to delete
// another user's items doc). Admin-gated; writes a moderationLog entry.

const {
  functions, db, FieldValue, requireAdmin, displayNameFor, invalid, notFound,
} = require('./shared');
const { aggregateFromReviews, staleDimKeys } = require('./reviewsAgg');

const moderateFlaggedReview = functions.https.onCall(async (data, context) => {
  const actorUid = await requireAdmin(context);
  const { flagId, action } = data || {};

  if (typeof flagId !== 'string' || !flagId.trim()) invalid('flagId');
  if (action !== 'remove' && action !== 'dismiss') {
    invalid('action', "action must be 'remove' or 'dismiss'.");
  }
  const id = flagId.trim();

  const flagRef = db.collection('flaggedReviews').doc(id);
  const flagSnap = await flagRef.get();
  if (!flagSnap.exists) notFound('That flag no longer exists.');
  const flag = flagSnap.data();
  const itemId = flag.itemId || null;

  const actorDisplayName = await displayNameFor(actorUid);
  // One transaction for the review's siblings read + the record write, so a
  // review submitted concurrently (submitReview also runs in a transaction
  // over the same query) can't be dropped from the recomputed aggregate.
  let reviewDeleted = false;
  await db.runTransaction(async (tx) => {
    reviewDeleted = false;
    let item = null;
    let remaining = [];
    let record = null;
    const itemRef = itemId ? db.collection('items').doc(itemId) : null;
    if (action === 'remove' && itemRef) {
      const itemSnap = await tx.get(itemRef);
      if (itemSnap.exists) {
        item = itemSnap.data();
        if (item.itemRecordId) {
          const [remainingSnap, recSnap] = await Promise.all([
            tx.get(db.collection('items').where('itemRecordId', '==', item.itemRecordId)),
            tx.get(db.collection('itemRecords').doc(item.itemRecordId)),
          ]);
          remaining = remainingSnap.docs.filter((d) => d.id !== itemId).map((d) => d.data());
          record = recSnap.exists ? recSnap.data() : null;
        }
      }
    }

    tx.delete(flagRef);
    if (item) {
      tx.delete(itemRef);
      reviewDeleted = true;
      if (record) {
        const recordRef = db.collection('itemRecords').doc(item.itemRecordId);
        if (remaining.length === 0) {
          tx.delete(recordRef);
        } else {
          const aggregate = aggregateFromReviews(remaining);
          const write = { ...aggregate };
          for (const k of staleDimKeys(record, aggregate)) write[k] = FieldValue.delete();
          tx.set(recordRef, write, { merge: true });
        }
      }
    }

    tx.set(db.collection('moderationLog').doc(), {
      flagId: id,
      itemId: action === 'remove' ? itemId : null,
      action,
      actorUid,
      actorDisplayName,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    flagId: id,
    action,
    itemId: action === 'remove' ? itemId : null,
    reviewDeleted,
  };
});

module.exports = { moderateFlaggedReview };
