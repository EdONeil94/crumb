// C5 — role management wrappers. Thin calls onto the `setUserRole` callable;
// no data logic here (that all lives in functions/roles.js).
//
// RoleResult = {
//   targetUid: string,
//   role: 'admin' | 'business' | null,
//   bakeryName: string | null,
//   auditId: string,
//   claimsUpdated: boolean   // true => the *target* must getIdToken(true)
//                            // before rules see the new role
// }

import { callable } from './functions.js';

const setUserRole = callable('setUserRole');

export async function grantAdmin(targetUid) {
  return setUserRole({ targetUid, role: 'admin', bakeryName: null });
}

export async function assignBakery(targetUid, bakeryName) {
  return setUserRole({ targetUid, role: 'business', bakeryName });
}

export async function revokeRole(targetUid) {
  return setUserRole({ targetUid, role: null, bakeryName: null });
}
