// C5 — setUserRole
// Replaces adminPanel.js promoteUser / promptAssignBakery / removeUserRole.
// Writes userRoles/{uid} (admin-gated), an immutable roleAudit entry, and the
// matching custom auth claims.

const {
  onCall, admin, db, FieldValue, SUPER_ADMIN_UID,
  requireAdmin, getRoleRecord, displayNameFor, invalid, precondition, notFound,
  isNonEmptyString,
} = require('./shared');

const setUserRole = onCall(async (data, context) => {
  const actorUid = await requireAdmin(context);
  const { targetUid, role, bakeryName } = data || {};

  if (!isNonEmptyString(targetUid)) invalid('targetUid');
  if (role !== 'admin' && role !== 'business' && role !== null) invalid('role');

  if (role === 'business') {
    if (!isNonEmptyString(bakeryName)) invalid('bakeryName', 'A bakery name is required for the business role.');
  } else if (bakeryName != null && bakeryName !== '') {
    invalid('bakeryName', 'bakeryName must be null unless the role is business.');
  }

  const target = targetUid.trim();
  const cleanBakery = role === 'business' ? bakeryName.trim() : null;

  if (target === SUPER_ADMIN_UID && role !== 'admin') {
    precondition('CANNOT_DEMOTE_SUPER_ADMIN', 'The super-admin role cannot be changed.');
  }
  if (target === actorUid && role !== 'admin') {
    precondition('CANNOT_DEMOTE_SELF', 'You cannot remove your own admin role.');
  }

  let targetUser;
  try {
    targetUser = await admin.auth().getUser(target);
  } catch (_) {
    notFound('No account with that user id.');
  }

  const prev = await getRoleRecord(target);
  const roleRef = db.collection('userRoles').doc(target);
  const auditRef = db.collection('roleAudit').doc();

  const batch = db.batch();
  if (role === null) {
    batch.delete(roleRef);
  } else {
    batch.set(roleRef, { role, bakeryName: cleanBakery || '' }, { merge: true });
  }
  batch.set(auditRef, {
    targetUid: target,
    targetDisplayName: targetUser.displayName || targetUser.email || target,
    previousRole: prev?.role || null,
    previousBakeryName: prev?.bakeryName || null,
    newRole: role,
    newBakeryName: cleanBakery,
    actorUid,
    actorDisplayName: await displayNameFor(actorUid),
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // Custom claims only reach the client on its next ID-token refresh — the
  // response flags this so the UI can tell the user their new role isn't live
  // yet. firestore.rules keeps the userRoles-doc fallback regardless.
  let claimsUpdated = false;
  try {
    await admin.auth().setCustomUserClaims(target, role ? { role, bakeryName: cleanBakery } : null);
    claimsUpdated = true;
  } catch (e) {
    console.error('setCustomUserClaims failed for', target, e);
  }

  return {
    targetUid: target,
    role: role,
    bakeryName: cleanBakery,
    auditId: auditRef.id,
    claimsUpdated,
  };
});

module.exports = { setUserRole };
