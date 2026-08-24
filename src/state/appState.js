// ─── SHARED APP STATE ───────────────────────────────────────────────────────
// The central home for state that's read/written across otherwise-unrelated
// pages/components (pages/components carving, Phase 0 step 3 — see
// CLAUDE.md). Exported as live bindings; anything outside this module's own
// loaders that needs to *set* one of these uses the paired setter function
// below, since ES module imports are read-only bindings from the consumer's
// side — a plain reassignment from another file would throw.
//
// This file is built up in three checkpointed sub-stages (3a identity/roles,
// 3b core data caches, 3c social state), each its own commit gated on a
// full test:e2e run — see CLAUDE.md for why. This is 3a only.

// ─── 3a: Identity / roles ───────────────────────────────────────────────────

export const SUPER_ADMIN_UID = 'KTpBS4yJx2h8LpcryCTfJDFCHlr2';

export let currentUser = null;
export let fb = null;
export let currentUserRole = null; // null | 'business' | 'admin'
export let currentUserBakery = null; // bakery name if business user
export let allUserRoles = {}; // uid -> role record
export let bakeryProfiles = {}; // bakeryName -> profile { blurb, photoURL, instagram, website, ownerId }

export function setCurrentUser(user) { currentUser = user; }
export function setFb(value) { fb = value; }
export function setCurrentUserRole(role) { currentUserRole = role; }
export function setCurrentUserBakery(name) { currentUserBakery = name; }

export function isAdmin() { return currentUser?.uid === SUPER_ADMIN_UID || currentUserRole === 'admin'; }
export function isBusiness() { return currentUserRole === 'business' || isAdmin(); }
export function ownsBakery(name) { return isAdmin() || (isBusiness() && currentUserBakery === name); }

export async function loadUserRole() {
  if (!currentUser || !fb) return;
  if (currentUser.uid === SUPER_ADMIN_UID) { currentUserRole = 'admin'; currentUserBakery = null; return; }
  try {
    const { db, doc, getDoc } = fb;
    const snap = await getDoc(doc(db, 'userRoles', currentUser.uid));
    if (snap.exists()) {
      const data = snap.data();
      currentUserRole = data.role || null;
      currentUserBakery = data.bakeryName || null;
    } else {
      currentUserRole = null;
      currentUserBakery = null;
    }
  } catch(e) { console.log('Role load error:', e.message); }
}

export async function loadBakeryProfiles() {
  if (!fb) return;
  const { db, collection, getDocs } = fb;
  try {
    const snap = await getDocs(collection(db, 'bakeryProfiles'));
    bakeryProfiles = {};
    snap.docs.forEach(d => { bakeryProfiles[d.id] = d.data(); });
  } catch(e) { console.log('BakeryProfiles load:', e.message); }
}

export async function loadAllUserRoles() {
  if (!isAdmin() || !fb) return;
  const { db, collection, getDocs } = fb;
  try {
    const snap = await getDocs(collection(db, 'userRoles'));
    allUserRoles = {};
    snap.docs.forEach(d => { allUserRoles[d.id] = d.data(); });
  } catch(e) {}
}
