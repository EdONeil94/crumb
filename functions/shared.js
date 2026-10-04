// Shared helpers for every Crumbz callable: the Admin SDK handle, the
// auth/admin gates, small validators, and the error helpers.
//
// Every callable in this directory follows the same rules (see
// .claude/contracts/cloud-functions-contract.md, "Ground rules"):
//  - nothing security-relevant is trusted from the request payload; identity,
//    names, prices, timestamps and role checks are all derived server-side
//  - errors are always functions.https.HttpsError(code, message, details),
//    where `details.code` is a SCREAMING_SNAKE string for the cases the UI
//    branches on
//  - timestamps cross the wire as ISO-8601 strings, never Firestore Timestamps
//  - region is europe-west2 (London), co-located with Firestore. It is set
//    ONCE, here, via the `onCall` export below — every callable must be
//    declared with that, never functions.https.onCall directly (which would
//    silently fall back to us-central1). The client pins the same region in
//    src/services/firebase.js; the two must match or every call 404s.

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

const REGION = 'europe-west2';
const onCall = functions.region(REGION).https.onCall;

// Mirrors src/state/appState.js SUPER_ADMIN_UID. Kept until every role-holder
// has been re-granted through setUserRole and the fallback in firestore.rules
// can be dropped in a later commit — see the contract's C5 section.
const SUPER_ADMIN_UID = 'KTpBS4yJx2h8LpcryCTfJDFCHlr2';

function requireAuth(context) {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  return context.auth.uid;
}

async function getRoleRecord(uid) {
  const snap = await db.collection('userRoles').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

async function isAdminUid(uid) {
  if (uid === SUPER_ADMIN_UID) return true;
  const rec = await getRoleRecord(uid);
  return !!rec && rec.role === 'admin';
}

// Returns { uid } of the caller when they are an admin; throws otherwise.
async function requireAdmin(context) {
  const uid = requireAuth(context);
  if (!(await isAdminUid(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }
  return uid;
}

function invalid(field, message) {
  throw new functions.https.HttpsError('invalid-argument', message || `Invalid ${field}.`, { field });
}

function precondition(code, message) {
  throw new functions.https.HttpsError('failed-precondition', message || code, { code });
}

function notFound(message) {
  throw new functions.https.HttpsError('not-found', message || 'Not found.');
}

function permissionDenied(message) {
  throw new functions.https.HttpsError('permission-denied', message || 'Not allowed.');
}

function resourceExhausted(code, message) {
  throw new functions.https.HttpsError('resource-exhausted', message || code, { code });
}

// Best-effort display name for an audit trail: the profile doc first, then the
// auth record, then the raw uid.
async function displayNameFor(uid) {
  try {
    const p = await db.collection('profiles').doc(uid).get();
    if (p.exists && p.data().displayName) return p.data().displayName;
  } catch (_) { /* fall through */ }
  try {
    const u = await admin.auth().getUser(uid);
    return u.displayName || u.email || uid;
  } catch (_) { /* fall through */ }
  return uid;
}

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

module.exports = {
  onCall, REGION, admin, db, FieldValue, Timestamp, SUPER_ADMIN_UID,
  requireAuth, requireAdmin, isAdminUid, getRoleRecord, displayNameFor,
  invalid, precondition, notFound, permissionDenied, resourceExhausted,
  isFiniteNumber, isNonEmptyString,
};
