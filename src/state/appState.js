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
// full test:e2e run — see CLAUDE.md for why. This is 3a + 3b + 3c.
//
// 3b follow-up (Phase 1 residual #2, 2026-08-30): loadData()/loadProfiles()/
// buildBakeryIndex() (+ exploreCache) finally moved here, completing what
// 3b left half-done. They stayed in legacy-app.js originally because each
// touched something legacy-app.js still owned — loadData/loadProfiles call
// UI render functions (renderRecentGrid/updateStats/updateNav/renderPeople),
// buildBakeryIndex reads exploreCache (then owned by the not-yet-extracted
// Explore page). Steps 27-29 gave every one of those a real home; the UI
// callbacks are now reached via getAction() (this module is a leaf — it
// must not import a page/component back, standing lesson 5), and exploreCache
// moved here alongside buildBakeryIndex (its only cross-module reader
// besides explore.js, which now imports it from here).

import { getAction } from '../events/actions.js';
import { extractCity } from '../utils/geo.js';

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
// All four caches + their loaders now live here (loadData/loadProfiles/
// buildBakeryIndex joined at Phase 1 residual #2). No setters are needed
// any more — every reassignment site is inside this module. Functions
// elsewhere that touch these (saveReview's `allItems.unshift(...)`,
// toggleBookmark, …) only ever mutate by property/array method, never
// reassign — verified via grep across the whole codebase.

export let allItems = [];
export let allBakeries = {}; // keyed by bakeryName
export let allProfiles = {}; // uid -> profile data
export let allItemRecords = []; // cached from Firestore
export let exploreCache = {}; // Explore-page Places results, cityKey -> results[]
                              // (populated by src/pages/explore.js; read here
                              // by buildBakeryIndex to back-fill bakery coords)

export async function loadData() {
  if (!fb) return;
  const { db, collection, getDocs, query, orderBy, limit } = fb;
  try {
    const q = query(collection(db, 'items'));
    const snap = await getDocs(q);
    allItems = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
        const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
        return tb - ta;
      });
    getAction('renderRecentGrid')();
    getAction('updateStats')();
  } catch (e) {
    console.log('Data load error (likely not configured yet):', e.message);
  }
}

export async function loadProfiles() {
  if (!fb) return;
  const { db, collection, getDocs } = fb;
  try {
    const snap = await getDocs(collection(db, 'profiles'));
    snap.docs.forEach(d => { allProfiles[d.id] = d.data(); });
    if (currentUser) getAction('updateNav')();
    // Re-render People page if visible
    const peoplePage = document.getElementById('page-people');
    if (peoplePage && peoplePage.classList.contains('active')) getAction('renderPeople')();
  } catch(e) { console.log('Profiles load error:', e.message); }
}

export function buildBakeryIndex() {
  allBakeries = {};
  allItems.forEach(item => {
    const key = item.bakeryName || 'Unknown bakery';
    if (!allBakeries[key]) {
      allBakeries[key] = {
        name: key,
        address: item.bakeryAddress || '',
        placeId: item.bakeryPlaceId || null,
        lat: item.bakeryLat || null,
        lng: item.bakeryLng || null,
        city: extractCity(item.bakeryAddress || ''),
        items: [],
        totalScore: 0,
        blurb: ''
      };
    }
    // Grab coords from any item that has them (older reviews may not)
    if (!allBakeries[key].lat && item.bakeryLat) {
      allBakeries[key].lat = item.bakeryLat;
      allBakeries[key].lng = item.bakeryLng;
    }
    // Grab placeId from any item that has it
    if (!allBakeries[key].placeId && item.bakeryPlaceId) {
      allBakeries[key].placeId = item.bakeryPlaceId;
    }
    allBakeries[key].items.push(item);
    allBakeries[key].totalScore += (item.communityAvg || item.overallRating || 0);
  });

  // For bakeries still missing coords, try to get them from bakeryProfiles
  // (bakeryProfiles doesn't store coords, but we can try the Explore cache
  // which has lat/lng from the Places nearby search)
  Object.values(allBakeries).forEach(b => {
    if (!b.lat) {
      // Try exploreCache across all cities
      for (const cityResults of Object.values(exploreCache || {})) {
        const match = cityResults.find(r =>
          (r.name || '').toLowerCase() === b.name.toLowerCase() ||
          (b.placeId && r.placeId === b.placeId)
        );
        if (match?.lat) {
          b.lat = match.lat;
          b.lng = match.lng;
          break;
        }
      }
    }
  });
}

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
// src/pages/bakeries.js's renderBakeries — the latter in legacy-app.js until
// Phase 7 step 26), so co-locating it with
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
