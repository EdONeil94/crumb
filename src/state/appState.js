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
// full test:e2e run — see CLAUDE.md for why. This is 3a + 3b.
//
// 3b note: loadData()/buildBakeryIndex()/loadProfiles() stay in
// legacy-app.js rather than moving here, unlike 3a's loaders — each has a
// real dependency legacy-app.js still owns (loadData/loadProfiles call UI
// render functions like renderRecentGrid()/updateNav()/renderPeople();
// buildBakeryIndex reads exploreCache, owned by the not-yet-extracted
// Explore page). Moving them would mean this module importing back from
// the file that imports it. Only loadItemRecords()/ensureProfileExists()
// are genuinely self-contained enough to move, same as 3a's cluster.

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

// ─── 3b: Core data caches ───────────────────────────────────────────────────
// allItems/allBakeries are exported as state + setters only (their loaders
// stay in legacy-app.js — see the note above); allItemRecords/allProfiles
// have no setter since their sole mutator either moves with them
// (loadItemRecords) or only ever mutates properties, never reassigns
// (loadProfiles's `allProfiles[d.id] = ...`, verified via grep — no
// wholesale `allProfiles = ` reassignment exists anywhere in the codebase).

export let allItems = [];
export let allBakeries = {}; // keyed by bakeryName
export let allProfiles = {}; // uid -> profile data
export let allItemRecords = []; // cached from Firestore

export function setAllItems(items) { allItems = items; }
export function setAllBakeries(bakeries) { allBakeries = bakeries; }

export async function loadItemRecords() {
  if (!fb) return;
  const { db, collection, getDocs } = fb;
  try {
    const snap = await getDocs(collection(db, 'itemRecords'));
    allItemRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.log('itemRecords load:', e.message); }
}

// Guarantees every signed-in user has at least a minimal profile doc, so they
// show up as a "member" immediately — even before their first review or
// their first visit to Settings → Profile.
export async function ensureProfileExists(user) {
  if (!fb) return;
  const { db, doc, getDoc, setDoc, serverTimestamp } = fb;
  try {
    const ref = doc(db, 'profiles', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return; // already has a profile — never overwrite it here
    await setDoc(ref, {
      displayName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
      photoURL: user.photoURL || null,
      location: '',
      bio: '',
      country: '',
      createdAt: serverTimestamp()
    });
  } catch(e) { console.warn('ensureProfileExists error:', e); }
}

// ─── 3c: Social state ───────────────────────────────────────────────────────
// The cleanest of the three sub-stages: all 5 loaders here are genuinely
// self-contained (no UI-render calls, no cross-cluster reads), and each of
// the 4 state variables has exactly one reassignment site — the loader
// itself, which moves with it — so no setters are needed at all. Functions
// staying in legacy-app.js that mutate these (toggleFollow/toggleBookmark/
// toggleSaveItem) only ever mutate by property/Set-method (`.add()`/
// `.delete()`, `userBookmarks[k] = ...`, `delete userBookmarks[k]`), never
// reassign wholesale — verified via grep across the whole file.

export let myFollowing = new Set(); // UIDs I follow
export let myFollowers = new Set(); // UIDs that follow me

export async function loadFollows() {
  if (!currentUser || !fb) return;
  const { db, collection, query, where, getDocs } = fb;
  try {
    // Who I follow
    const followingSnap = await getDocs(query(collection(db, 'follows'), where('followerId', '==', currentUser.uid)));
    myFollowing = new Set(followingSnap.docs.map(d => d.data().followingId));
    // Who follows me
    const followersSnap = await getDocs(query(collection(db, 'follows'), where('followingId', '==', currentUser.uid)));
    myFollowers = new Set(followersSnap.docs.map(d => d.data().followerId));
  } catch(e) { console.log('Follows load error:', e.message); }
}

export let userBookmarks = {}; // bakeryName -> { id, address }

// Moved here from legacy-app.js's own BOOKMARKS section (2026-08-25, Phase 5
// step 21, pages/components carving) — a trivial derived-state helper, same
// pattern as isAdmin/isBusiness/ownsBakery above. It has two external
// callers post-move (src/components/bakeryModal.js's openBakeryProfile, and
// legacy-app.js's still-unextracted renderBakeries), so co-locating it with
// the state it reads sidesteps picking either one as its "home" — zero
// cycle risk either way, since both are ordinary one-way imports from here.
export function isBookmarked(bakeryName) {
  return !!userBookmarks[bakeryName];
}

export async function loadBookmarks() {
  if (!currentUser || !fb) return;
  const { db, collection, query, where, getDocs } = fb;
  try {
    const snap = await getDocs(query(collection(db, 'bookmarks'), where('userId', '==', currentUser.uid)));
    userBookmarks = {};
    snap.docs.forEach(d => {
      const data = d.data();
      userBookmarks[data.bakeryName] = { id: d.id, address: data.address || '' };
    });
  } catch(e) { console.warn('Bookmarks load error:', e); }
}

export let userSavedItems = {}; // itemId -> { docId, name, bakeryName, bakeryAddress, category, photoURL, price }

export async function loadSavedItems() {
  if (!currentUser || !fb) return;
  const { db, collection, query, where, getDocs } = fb;
  try {
    const snap = await getDocs(query(collection(db, 'savedItems'), where('userId', '==', currentUser.uid)));
    userSavedItems = {};
    snap.docs.forEach(d => {
      const data = d.data();
      userSavedItems[data.itemId] = { docId: d.id, ...data };
    });
  } catch(e) { console.warn('Saved items load error:', e); }
}
