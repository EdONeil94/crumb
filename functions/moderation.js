// C3 — moderateFlaggedReview
// Replaces adminPanel.js removeReviewAndFlag() / dismissFlag(), both of which
// are currently rejected from the client (firestore.rules lets only the
// super-admin delete a flaggedReviews doc, and removal also needs to delete
// another user's items doc). Admin-gated; writes a moderationLog entry.

const {
  functions, db, FieldValue, requireAdmin, displayNameFor, invalid, notFound,
} = require('./shared');
const { aggregateFromReviews } = require('./reviewsAgg');

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
  const batch = db.batch();
  batch.delete(flagRef);

  let reviewDeleted = false;

  if (action === 'remove' && itemId) {
    const itemRef = db.collection('items').doc(itemId);
    const itemSnap = await itemRef.get();
    if (itemSnap.exists) {
      const item = itemSnap.data();
      batch.delete(itemRef);
      reviewDeleted = true;

      const recordId = item.itemRecordId;
      if (recordId) {
        const remainingSnap = await db.collection('items')
          .where('itemRecordId', '==', recordId).get();
        const remaining = remainingSnap.docs
          .filter((d) => d.id !== itemId)
          .map((d) => d.data());
        const recordRef = db.collection('itemRecords').doc(recordId);
        if (remaining.length === 0) {
          batch.delete(recordRef);
        } else {
          batch.set(recordRef, aggregateFromReviews(remaining), { merge: true });
        }
      }
    }
  }

  batch.set(db.collection('moderationLog').doc(), {
    flagId: id,
    itemId: action === 'remove' ? itemId : null,
    action,
    actorUid,
    actorDisplayName,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return {
    flagId: id,
    action,
    itemId: action === 'remove' ? itemId : null,
    reviewDeleted,
  };
});

module.exports = { moderateFlaggedReview };
