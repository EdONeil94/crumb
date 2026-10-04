// C1 / C1b — the review write path, server-side.
//
// C1  submitReview   — create a review + upsert its shared itemRecord, with
//                      every aggregate computed on the server
// C1b updateReview    — edit an existing review, recompute the record
// C1b deleteReview    — delete a review, recompute (or delete) the record
//
// Replaces legacy-app.js saveReview() and editReviewModal.js saveEdit() /
// deleteReview(). The photo upload stays on the client (Storage rules already
// scope items/{uid}/** to that uid); everything else moves here.
// See .claude/contracts/cloud-functions-contract.md.

const {
  onCall, db, FieldValue, Timestamp,
  requireAuth, isAdminUid, invalid, notFound, permissionDenied, resourceExhausted,
  isFiniteNumber,
} = require('./shared');
const { getTastingDimKeys, isCategoryKey } = require('./tasting');
const { aggregateFromReviews, staleDimKeys } = require('./reviewsAgg');

const MAX_REVIEWS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

// ─── validation helpers ────────────────────────────────────────────────────
// Required, trimmed string with length bounds. `invalid()` throws.
function reqString(v, field, { min = 1, max = Infinity } = {}) {
  if (typeof v !== 'string') invalid(field);
  const s = v.trim();
  if (s.length < min) invalid(field);
  if (s.length > max) invalid(field, `${field} is too long.`);
  return s;
}

// Optional string -> trimmed value or ''.
const optString = (v) => (typeof v === 'string' ? v.trim() : '');

function validateRating(v) {
  if (!isFiniteNumber(v) || v < 0.5 || v > 5 || Math.round(v * 2) !== v * 2) {
    invalid('overallRating', 'overallRating must be between 0.5 and 5 in half-point steps.');
  }
  return v;
}

function validateDims(dims, category) {
  if (dims == null || typeof dims !== 'object' || Array.isArray(dims)) invalid('dims');
  const expected = getTastingDimKeys(category);
  const got = Object.keys(dims);
  if (got.length !== expected.length || !expected.every((k) => k in dims)) {
    invalid('dims', 'dims keys must match the category tasting dimensions.');
  }
  const out = {};
  for (const k of expected) {
    const n = dims[k];
    if (!isFiniteNumber(n) || n < 0 || n > 5) invalid('dims', `${k} must be between 0 and 5.`);
    out[k] = n;
  }
  return out;
}

function validatePrice(v) {
  if (v == null) return null;
  if (!isFiniteNumber(v) || v < 0) invalid('price');
  return Math.round(v * 100) / 100;
}

// A Storage download URL for an object under items/{uid}/ — the only place
// the client uploads review photos (Storage rules scope that path to its
// uid). Parsed rather than substring-matched, so "https://evil.example/?x=
// /items/<uid>/" doesn't pass. The emulator serves the same /v0/b/<bucket>/o/
// path from its own host.
const STORAGE_HOSTS = new Set(['firebasestorage.googleapis.com']);
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

function validatePhotoURL(v, uid) {
  if (v == null) return null;
  if (typeof v !== 'string') invalid('photoURL');
  let url;
  try { url = new URL(v); } catch { invalid('photoURL'); }
  const hostOk = STORAGE_HOSTS.has(url.hostname)
    || (IS_EMULATOR && ['127.0.0.1', 'localhost'].includes(url.hostname));
  let objectPath = '';
  try {
    const m = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    objectPath = m ? decodeURIComponent(m[1]) : '';
  } catch { invalid('photoURL'); }
  if (!hostOk || !objectPath.startsWith(`items/${uid}/`)) {
    invalid('photoURL', 'photoURL must point to your own upload.');
  }
  return v;
}

// Every tasting-dim field on an item doc is dim_*. On a category change the
// old category's 5th dim would otherwise linger on the doc (tx.update merges)
// and get averaged into the record alongside the new one.
function staleItemDimKeys(item, newDims) {
  return Object.keys(item).filter((k) => k.startsWith('dim_') && !(k in newDims));
}

// Callable return values can't carry Firestore Timestamps meaningfully —
// normalize to ISO strings, same as submitReview's item.createdAt.
function serializeItem(item) {
  const out = { ...item };
  if (out.createdAt && typeof out.createdAt.toDate === 'function') {
    out.createdAt = out.createdAt.toDate().toISOString();
  }
  return out;
}

// Record write for update/delete: the fresh aggregate plus deletes for any
// dim_* key no surviving review carries.
function recordAggregateWrite(record, aggregate) {
  const write = { ...aggregate };
  for (const k of staleDimKeys(record, aggregate)) write[k] = FieldValue.delete();
  return write;
}

async function checkRateLimit(tx, uid) {
  const ref = db.collection('reviewRateLimits').doc(uid);
  const snap = await tx.get(ref);
  const now = Date.now();
  const recent = ((snap.exists && snap.data().timestamps) || [])
    .map((t) => (typeof t === 'number' ? t : new Date(t).getTime()))
    .filter((t) => Number.isFinite(t) && now - t < HOUR_MS);
  if (recent.length >= MAX_REVIEWS_PER_HOUR) {
    resourceExhausted('RATE_LIMITED', 'You are posting reviews too quickly. Try again later.');
  }
  return { ref, timestamps: [...recent, now].slice(-MAX_REVIEWS_PER_HOUR) };
}

// The individual review doc, matching the historical shape written by
// legacy-app.js saveReview() (per-item communityAvg = the item's own rating,
// ratingCount = 1 — see tests/seed-emulator.mjs).
function buildReviewDoc({ uid, profile, authUser, fields, itemRecordId }) {
  return {
    itemRecordId,
    name: fields.itemName,
    category: fields.category,
    subCategory: fields.subCategory,
    bakeryName: fields.bakeryName,
    bakeryAddress: fields.bakeryAddress,
    bakeryPlaceId: fields.bakeryPlaceId,
    bakeryLat: fields.bakeryLat,
    bakeryLng: fields.bakeryLng,
    price: fields.price,
    overallRating: fields.overallRating,
    communityAvg: fields.overallRating,
    ratingCount: 1,
    notes: fields.notes,
    photoURL: fields.photoURL,
    userId: uid,
    userName: (profile && profile.displayName) || authUser?.displayName
      || authUser?.email?.split('@')[0] || 'Anonymous',
    userPhoto: (profile && profile.photoURL) || authUser?.photoURL || null,
    createdAt: FieldValue.serverTimestamp(),
    ...fields.dims,
  };
}

function recordShapeFrom(fields) {
  return {
    name: fields.itemName,
    category: fields.category,
    subCategory: fields.subCategory,
    bakeryName: fields.bakeryName,
    bakeryAddress: fields.bakeryAddress,
    bakeryPlaceId: fields.bakeryPlaceId,
  };
}

// ─── C1 ────────────────────────────────────────────────────────────────────
const submitReview = onCall(async (data, context) => {
  const uid = requireAuth(context);
  const d = data || {};

  const category = (typeof d.category === 'string' && d.category.trim()) || '';
  if (!isCategoryKey(category)) invalid('category');

  const fields = {
    itemName: reqString(d.itemName, 'itemName', { min: 1, max: 120 }),
    bakeryName: reqString(d.bakeryName, 'bakeryName', { min: 1, max: 160 }),
    bakeryAddress: optString(d.bakeryAddress).slice(0, 300),
    bakeryPlaceId: typeof d.bakeryPlaceId === 'string' ? d.bakeryPlaceId : null,
    bakeryLat: isFiniteNumber(d.bakeryLat) ? d.bakeryLat : null,
    bakeryLng: isFiniteNumber(d.bakeryLng) ? d.bakeryLng : null,
    category,
    subCategory: optString(d.subCategory).slice(0, 60),
    overallRating: validateRating(d.overallRating),
    dims: validateDims(d.dims, category),
    price: validatePrice(d.price),
    notes: optString(d.notes).slice(0, 2000),
    photoURL: validatePhotoURL(d.photoURL, uid),
  };

  const linkId = d.itemRecordId != null ? String(d.itemRecordId) : null;

  const [profileSnap, authUser] = await Promise.all([
    db.collection('profiles').doc(uid).get(),
    context.auth.token ? Promise.resolve({
      displayName: context.auth.token.name,
      email: context.auth.token.email,
      photoURL: context.auth.token.picture,
    }) : Promise.resolve(null),
  ]);
  const profile = profileSnap.exists ? profileSnap.data() : null;

  const newItemRef = db.collection('items').doc();
  const recordRef = linkId
    ? db.collection('itemRecords').doc(linkId)
    : db.collection('itemRecords').doc();

  const out = await db.runTransaction(async (tx) => {
    // ── all reads first (Firestore transaction rule) ──
    const rl = await checkRateLimit(tx, uid);

    let existingReviews = [];
    let existingRecord = null;
    if (linkId) {
      const recSnap = await tx.get(recordRef);
      if (!recSnap.exists) notFound('That item record no longer exists.');
      existingRecord = recSnap.data();
      // A review linked to a shared record IS a review of that item — its
      // category (and so its dims) must be the record's. The client always
      // sends matchedItemRecord.category; a mismatch is a forged payload, and
      // letting it through would mix another category's dims into the record.
      if (existingRecord.category !== fields.category) {
        invalid('category', "category must match the linked item's category.");
      }
      const existSnap = await tx.get(db.collection('items').where('itemRecordId', '==', linkId));
      existingReviews = existSnap.docs.map((x) => x.data());
    }

    // ── compute ──
    const reviewDoc = buildReviewDoc({ uid, profile, authUser, fields, itemRecordId: recordRef.id });
    const allReviews = [...existingReviews, { ...reviewDoc, createdAt: Timestamp.now() }];
    const aggregate = aggregateFromReviews(allReviews);

    // Identity fields (name/category/bakery) are only ever set when CREATING
    // a new record. For an existing record (linkId set), only the aggregate
    // fields get merged in — otherwise any user reviewing an already-shared
    // item could silently rename/recategorize it for everyone just by
    // submitting different itemName/category/bakeryName values alongside a
    // valid itemRecordId. Matches the historical client behavior (the old
    // saveReview() never touched these fields on an existing record either).
    const recordDoc = {
      ...(linkId ? {} : { ...recordShapeFrom(fields), createdAt: FieldValue.serverTimestamp() }),
      ...aggregate,
    };
    // Set the record photo only when it has none yet.
    if (fields.photoURL && !(existingRecord && existingRecord.photoURL)) {
      recordDoc.photoURL = fields.photoURL;
    }

    // ── all writes ──
    tx.set(newItemRef, reviewDoc);
    tx.set(recordRef, recordDoc, { merge: true });
    tx.set(rl.ref, { timestamps: rl.timestamps }, { merge: true });

    return { recordDoc, reviewDoc };
  });

  const nowIso = Timestamp.now().toDate().toISOString();
  return {
    itemId: newItemRef.id,
    itemRecordId: recordRef.id,
    item: { ...out.reviewDoc, id: newItemRef.id, itemRecordId: recordRef.id, createdAt: nowIso },
    // Only the fields actually written this call (see the comment above) —
    // for an existing record that's aggregate-only, by design. The caller
    // merges this onto its own cached copy rather than replacing it.
    itemRecord: {
      id: recordRef.id, ...out.recordDoc,
      ...(out.recordDoc.createdAt ? { createdAt: nowIso } : {}), // not the serverTimestamp sentinel
    },
  };
});

// ─── C1b — updateReview ────────────────────────────────────────────────────
const updateReview = onCall(async (data, context) => {
  const uid = requireAuth(context);
  const d = data || {};
  const itemId = reqString(d.itemId, 'itemId', { min: 1 });

  const category = (typeof d.category === 'string' && d.category.trim()) || '';
  if (!isCategoryKey(category)) invalid('category');

  const patch = {
    name: reqString(d.name, 'name', { min: 1, max: 120 }),
    category,
    subCategory: optString(d.subCategory).slice(0, 60),
    overallRating: validateRating(d.overallRating),
    dims: validateDims(d.dims, category),
    price: validatePrice(d.price),
    notes: optString(d.notes).slice(0, 2000),
  };
  // photoURL is validated inside the transaction: the edit form sends back
  // the review's EXISTING photoURL when the photo wasn't changed, and that
  // may not be under the caller's uid (an admin editing someone else's
  // review) — an unchanged value is always accepted.
  const hasPhoto = d.photoURL !== undefined;

  const itemRef = db.collection('items').doc(itemId);
  const callerIsAdmin = await isAdminUid(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) notFound('That review no longer exists.');
    const item = snap.data();
    if (item.userId !== uid && !callerIsAdmin) {
      permissionDenied('You can only edit your own review.');
    }

    const photoURL = !hasPhoto ? undefined
      : d.photoURL === item.photoURL ? item.photoURL
        : validatePhotoURL(d.photoURL, uid);

    const recordId = item.itemRecordId || null;
    const recordRef = recordId ? db.collection('itemRecords').doc(recordId) : null;
    let siblings = [];
    let record = null;
    if (recordId) {
      const [sibSnap, recSnap] = await Promise.all([
        tx.get(db.collection('items').where('itemRecordId', '==', recordId)),
        tx.get(recordRef),
      ]);
      siblings = sibSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
      record = recSnap.exists ? recSnap.data() : null;
    }

    const updates = {
      name: patch.name,
      category: patch.category,
      subCategory: patch.subCategory,
      overallRating: patch.overallRating,
      communityAvg: patch.overallRating,
      notes: patch.notes,
      price: patch.price,
      ...patch.dims,
      ...(photoURL !== undefined ? { photoURL } : {}),
    };
    const staleKeys = staleItemDimKeys(item, patch.dims);
    const deletes = Object.fromEntries(staleKeys.map((k) => [k, FieldValue.delete()]));

    tx.update(itemRef, { ...updates, ...deletes });

    const updatedItem = { ...item, ...updates };
    for (const k of staleKeys) delete updatedItem[k];

    // A review whose itemRecordId points at a record that no longer exists
    // (orphaned) is left unlinked-in-effect: a merge-set here would recreate
    // a nameless "ghost" record that surfaces on the leaderboard.
    let aggregate = null;
    if (record) {
      const merged = siblings.map((s) => (s.id === itemId ? updatedItem : s));
      aggregate = aggregateFromReviews(merged);
      tx.set(recordRef, recordAggregateWrite(record, aggregate), { merge: true });
    }

    return { item: serializeItem({ ...updatedItem, id: itemId }), recordId: record ? recordId : null, aggregate };
  });

  return {
    itemId,
    item: result.item,
    itemRecord: result.recordId
      ? { id: result.recordId, ...result.aggregate }
      : null,
  };
});

// ─── C1b — deleteReview ────────────────────────────────────────────────────
const deleteReview = onCall(async (data, context) => {
  const uid = requireAuth(context);
  const itemId = reqString((data || {}).itemId, 'itemId', { min: 1 });
  const itemRef = db.collection('items').doc(itemId);
  const callerIsAdmin = await isAdminUid(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) notFound('That review no longer exists.');
    const item = snap.data();
    if (item.userId !== uid && !callerIsAdmin) {
      permissionDenied('You can only delete your own review.');
    }

    const recordId = item.itemRecordId || null;
    const recordRef = recordId ? db.collection('itemRecords').doc(recordId) : null;
    let remaining = [];
    let record = null;
    if (recordId) {
      const [sibSnap, recSnap] = await Promise.all([
        tx.get(db.collection('items').where('itemRecordId', '==', recordId)),
        tx.get(recordRef),
      ]);
      remaining = sibSnap.docs.filter((x) => x.id !== itemId).map((x) => x.data());
      record = recSnap.exists ? recSnap.data() : null;
    }

    tx.delete(itemRef);

    // Missing record (orphaned review): nothing to recompute, and a merge-set
    // would recreate a nameless ghost record — see updateReview.
    let itemRecordDeleted = false;
    if (record) {
      if (remaining.length === 0) {
        tx.delete(recordRef);
        itemRecordDeleted = true;
      } else {
        tx.set(recordRef, recordAggregateWrite(record, aggregateFromReviews(remaining)), { merge: true });
      }
    }
    return { recordId, itemRecordDeleted };
  });

  return {
    itemId,
    itemRecordId: result.recordId,
    itemRecordDeleted: result.itemRecordDeleted,
  };
});

module.exports = { submitReview, updateReview, deleteReview };
