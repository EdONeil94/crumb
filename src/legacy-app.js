import { registerActions } from './events/actions.js';
import { initDelegatedEvents, dataArgs } from './events/delegate.js';
import {
  CATEGORY_TREE, CATEGORIES, SUB_TO_PARENT, SUB_LABEL,
  TASTING_DIMS_UNIVERSAL, TASTING_DIM_5TH, DEFAULT_DIM_5TH, getTastingDims,
  TASTING_DIMS,
} from './data/categories.js';
import { lockScroll, unlockScroll, showToast, timeAgo } from './utils/dom.js';
import { escJS } from './utils/strings.js';
import {
  currentUser, fb,
  setCurrentUser, setFb, setCurrentUserRole,
  setCurrentUserBakery, isAdmin, isBusiness, ownsBakery, loadUserRole,
  loadBakeryProfiles,
  allItems, allItemRecords,
  loadItemRecords, ensureProfileExists, loadData, loadProfiles,
  myFollowing, myFollowers, loadFollows, loadBookmarks,
  userSavedItems, loadSavedItems,
} from './state/appState.js';
// updateNav: initFirebaseApp()'s auth listener + loadProfiles() call it
// directly. showPage: WINDOW EXPORTS only (window.showPage, used by
// tests/people-filters.spec.js). The rest of nav.js's exports
// (toggle/close menu helpers, sign-out wrappers) are reached purely through
// the delegated-action registry now — no import needed here.
import { updateNav, showPage } from './components/nav.js';
import {
  openAuthModal, closeAuthModal, switchAuthTab, signInGoogle, signInEmail,
  signUpEmail, showAuthError, friendlyAuthError,
} from './components/authModal.js';
import {
  closeEditModal, editingItemId, editPhotoFile, editPhotoDataURL,
} from './components/editReviewModal.js';
import { processScannedReservation } from './components/qrCode.js';
import {
  allProducts, loadProducts,
} from './pages/shop.js';
import { switchFeedTab } from './pages/feed.js';
import { renderRecentGrid, updateStats } from './pages/home.js';
import {
  lbCurrentTab, renderLeaderboard,
} from './pages/leaderboard.js';
import { loadMyPreorders } from './components/preordersSheet.js';
import {
  handleSettingsPhoto, saveSettingsProfile, signOutFromSettings,
} from './pages/settings.js';
import { renderPeople } from './pages/people.js';
import {
  parseSlotStartTime, renderOrdersTab,
} from './components/reservations.js';
import {
  openAddModal, closeAddModal, buildTastingDims, buildCategoryChips,
  compressImage, compressToDataURL, showKnownBakeries, selectManualBakery,
  updateOverallRating, selectedBakery, selectedCategory, selectedSubCategory,
  photoFile, matchedItemRecord,
} from './components/addReviewModal.js';
import { openDetail, closeDetailModal } from './components/itemDetailModal.js';
import { closeShareReviewModal } from './components/shareReviewModal.js';
import { closeBakeryModal } from './components/bakeryModal.js';
import {
  closeProfileModal, switchProfileTab, refreshOpenProfile,
} from './components/profileModal.js';
import {
  closeManageBakeryModal, handleBakeryPhoto, saveBakeryProfile,
} from './components/adminPanel.js';
import { closeBakeryEditModal } from './components/businessBakeryManagement.js';
import { loadNotifications } from './components/notifications.js';
// Side-effect only — PWA install/update-check/status-bar-fix/pull-to-refresh/
// keyboard-scroll all self-execute on import, no exports needed here.
import './app/lifecycle.js';

// lockScroll/unlockScroll, showToast, timeAgo, escJS, distKm, extractCity,
// extractCountry moved to src/utils/ (2026-08-24, pages/components carving
// Phase 0 step 2). None of the geo helpers are imported here any more —
// extractCity's last consumer was buildBakeryIndex (moved to appState.js,
// Phase 1 residual #2); extractCountry's left with Explore (step 29),
// distKm's with the Pre-order discovery page (step 30).

// ─── ROLES ────────────────────────────────────────────────────────────────────
// SUPER_ADMIN_UID/currentUserRole/currentUserBakery/allUserRoles/
// bakeryProfiles/isAdmin/isBusiness/ownsBakery/loadUserRole/
// loadBakeryProfiles/loadAllUserRoles moved to src/state/appState.js
// (2026-08-24, pages/components carving Phase 0 step 3a). allUserRoles/
// bakeryProfiles/loadAllUserRoles are no longer imported here at all —
// their only real (non-comment) uses in this file were
// refreshAdminUsersPanel/promoteUser/promptAssignBakery/removeUserRole/
// showAdminTab, all moved to src/components/adminPanel.js (2026-08-26,
// Phase 6 step 23); SUPER_ADMIN_UID/isAdmin/isBusiness/ownsBakery/
// loadUserRole/loadBakeryProfiles are still imported above — genuinely
// still needed elsewhere in this file.

// loadProfiles/loadData/buildBakeryIndex moved to src/state/appState.js
// (2026-08-30, Phase 1 residual #2) — the Phase 0 stage 3b deferral, once
// step 29 (exploreCache) + step 28 (renderRecentGrid/updateStats) gave
// every dependency a real home. exploreCache moved to appState.js in the
// same change (buildBakeryIndex is its only cross-module reader besides
// explore.js itself). loadData/loadProfiles reach their UI render callbacks
// (renderRecentGrid/updateStats/updateNav/renderPeople) via getAction()
// from appState.js — a leaf can't import a page/component back (standing
// lesson 5). loadData/loadProfiles are imported above for this file's own
// plain-JS callers (initFirebaseApp; loadData also in saveReview/saveEdit/
// deleteReview/runCategoryMigration); buildBakeryIndex has no caller left
// here — its ~5 former getAction() sites are now direct appState imports.

// refreshAdminUsersPanel/promoteUser/promptAssignBakery/removeUserRole
// moved to src/components/adminPanel.js (2026-08-26, Phase 6 step 23) —
// genuinely Admin Panel Users-tab actions despite living under this
// otherwise-fully-migrated "ROLES" header (a position-vs-topic split, same
// class as several earlier steps' findings). See that file's own header
// comment for the full reasoning, including a real pre-existing bug
// surfaced (not fixed) in refreshAdminUsersPanel's own DOM target.

// ─── STATE ────────────────────────────────────────────────────────────────────
/* ────────────────────────────────────────────────────────────────────────
   LEGACY APP MODULE — Phase 1 of the modularization plan
   ────────────────────────────────────────────────────────────────────────
   This file is the entire original app's JavaScript logic, lifted as-is
   from the single-file HTML version and wrapped as one ES module. Nothing
   inside has been rewritten — this step is purely about getting a working
   Vite build + dev server in place safely, before any real decomposition
   begins.

   Future sessions will carve individual pages/features out of this file
   into their own modules under src/pages/ and src/components/, one at a
   time, while everything in here keeps working throughout. Don't be
   surprised to find this file is still huge for a while — that's expected
   and intentional; shrinking it is the whole point of later phases.

   See the "WINDOW EXPORTS" block at the bottom of this file for why plain
   function declarations here still work with the existing onclick="..."
   attributes throughout index.html.
   ──────────────────────────────────────────────────────────────────────── */

// currentStep/totalSteps/selectedCategory/selectedBakery/photoFile/
// photoDataURL moved to src/components/addReviewModal.js (2026-08-25,
// Phase 4 step 18) — selectedCategory/selectedBakery/photoFile imported
// above (read-only, needed by saveReview below); currentStep/totalSteps/
// photoDataURL stayed fully private to that file, no import needed.
// CATEGORY_TREE, CATEGORIES, SUB_TO_PARENT, SUB_LABEL, getCategoryDisplay,
// TASTING_DIMS_UNIVERSAL, TASTING_DIM_5TH, DEFAULT_DIM_5TH, getTastingDims,
// and TASTING_DIMS moved to src/data/categories.js (2026-08-24, first step
// of the pages/components carving) — imported at the top of this file,
// except getCategoryDisplay (last consumer left with the Explore page,
// Phase 7 step 29).
// allProfiles/allItems/allItemRecords/ensureProfileExists moved to
// src/state/appState.js (2026-08-24, Phase 0 step 3b) — imported above.

// GOOGLE_MAPS_KEY moved to src/config.js (2026-08-25, pages/components
// carving Phase 4 step 18). No longer imported here — its last consumers
// (fetchGoogleBakeries, renderExploreMap, …) left with the Explore page
// (Phase 7 step 29). src/pages/explore.js and src/services/places.js
// import it from config.js directly now.

// ─── INIT ─────────────────────────────────────────────────────────────────────
// window._crumb is guaranteed to already exist by the time this module runs,
// since firebase.js executes fully before legacy-app.js starts (they're both
// ES modules, imported in that order). Waiting for an event to announce this
// was fragile — depending on exact timing, this module's own listener could
// end up registering either before OR after that event fires, and there's no
// way to guarantee which. Checking directly removes that race entirely; the
// event listener stays only as a defensive fallback for the unlikely case
// this module ever ends up running before firebase.js for some future reason.
function initFirebaseApp() {
  setFb(window._crumb);
  const { onAuthStateChanged, auth } = fb;
  onAuthStateChanged(auth, async (user) => {
    setCurrentUser(user);
    setCurrentUserRole(null);
    setCurrentUserBakery(null);
    if (user) {
      await ensureProfileExists(user);
      await loadUserRole();
      await loadFollows();
      loadBookmarks();
      loadSavedItems();
      loadNotifications();
      loadMyPreorders();
      // Real-time listeners — refresh notifications the moment new activity arrives,
      // so the bell badge updates live without needing to reopen the app.
      const { db, collection, query, where, onSnapshot } = fb;
      onSnapshot(
        query(collection(db, 'follows'), where('followingId', '==', user.uid)),
        () => loadNotifications()
      );
      onSnapshot(
        query(collection(db, 'sharedReviews'), where('toUserId', '==', user.uid)),
        () => loadNotifications()
      );
      onSnapshot(
        query(collection(db, 'reactions'), where('targetUserId', '==', user.uid)),
        () => loadNotifications()
      );
    }
    updateNav();
    loadData();
    loadProfiles();
    loadItemRecords();
    loadBakeryProfiles();
    loadProducts();
  });

}

// Call immediately if the Firebase setup already ran (the normal case, given
// firebase.js always executes before this file does), otherwise fall back to
// waiting for the event — covers both orderings safely, whichever occurs.
if (window._crumb) {
  initFirebaseApp();
} else {
  window.addEventListener('crumb-firebase-ready', initFirebaseApp, { once: true });
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
// updateNav/toggleMobileMenu/closeMobileMenu/toggleUserMenu/
// closeAvatarDropdown/signOutFromAvatarMenu/closeOnClickOutside/
// signOutFromMobileMenu moved to src/components/nav.js (2026-08-24, Phase 1
// step 5). showPage/navigateFromMobileMenu/openMyProfileFromMobileMenu
// followed 2026-08-30 (Phase 1 residual #1), once step 32 gave every one of
// showPage()'s ~12 cross-page targets a real importable home — see nav.js's
// own header comment. showPage is imported back above solely for its WINDOW
// EXPORTS entry (window.showPage, used by tests/people-filters.spec.js);
// navigateFromMobileMenu/openMyProfileFromMobileMenu register from nav.js.

// ─── DATA ─────────────────────────────────────────────────────────────────────
// loadData() moved to src/state/appState.js (2026-08-30, Phase 1 residual
// #2) — see the note under the ROLES header above.

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
// updateStats/renderRecentGrid moved to src/pages/home.js (2026-08-28,
// Phase 7 step 28) — imported back above, since loadData() (deferred to
// step 29) and saveReview() both call them after populating allItems.

// feedCurrentTab/switchFeedTab/renderFeed moved to src/pages/feed.js
// (2026-08-24, Phase 3 step 13) — imported above. switchFeedTab is
// re-exported below (WINDOW EXPORTS) since index.html's FEED TABS buttons
// still use a raw, undelegated onclick="switchFeedTab(...)" — see feed.js's
// own header comment.

// openProfileIfSignedIn (used by feedCardHTML/cardHTML's username link, both
// in src/components/reviewCard.js) moved to src/components/profileModal.js
// (2026-08-26, Phase 5 step 22) — it calls openProfileModal, now local
// there. The GLOBAL registerActions() registry means the
// data-onclick="openProfileIfSignedIn" references inside cardHTML/
// feedCardHTML's markup resolve fine regardless of which file registers it.

// ─── BAKERIES ─────────────────────────────────────────────────────────────────
// allBakeries + buildBakeryIndex() moved to src/state/appState.js
// (allBakeries at Phase 0 step 3b; buildBakeryIndex + exploreCache at Phase
// 1 residual #2, 2026-08-30 — see the note under the ROLES header above).
// The ~5 getAction('buildBakeryIndex')() call sites in leaf modules
// (bakeryModal.js, adminPanel.js, bakeries.js, leaderboard.js) became
// ordinary `import { buildBakeryIndex } from '../state/appState.js'` in the
// same change — appState.js is a module they all already import from.

// ─── FILTER HELPERS ───────────────────────────────────────────────────────────
// Now fully empty of code — the "splits three ways" grab-bag CLAUDE.md's own
// plan flagged is fully resolved. peopleViewMode/setPeopleView/
// computeUserScore(private)/computeCountryRank/populateRankingLocationFilter/
// renderRankings/renderPeople moved to src/pages/people.js (2026-08-24,
// Phase 3 step 15); buildCategoryFilterBar/fetchPlaceDetails/
// buildOpeningHoursHTML/toggleBakeryHours/buildBakeryMapHTML/
// openBakeryProfile/closeBakeryModal/switchBakeryTab moved to
// src/components/bakeryModal.js (2026-08-25, Phase 5 step 21);
// profileActiveCatFilter/profileActiveLocFilter/profileModalUid/
// openProfileModal/closeProfileModal/switchProfileTab — the Profile modal's
// own rendering, this section's last remaining code — moved to
// src/components/profileModal.js (2026-08-26, Phase 5 step 22), imported
// above. buildCategoryFilterBar is no longer imported here either — its only
// caller was openProfileModal, which now imports it directly from
// bakeryModal.js instead of via this file.

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
// lbCurrentMode/lbCurrentTab (state) + switchLbMode/populateLbLocationFilter/
// onLbFilterChange/getLbFilters/switchLbTab/renderBakeryLeaderboard/
// closeLbAndOpenBakery/renderLeaderboard moved to src/pages/leaderboard.js
// (2026-08-28, Phase 7 step 27). lbCurrentTab was declared up in the STATE
// section, not here — it moved too. Only lbCurrentTab/renderLeaderboard are
// imported back here now (saveReview()/deleteReview() re-render after a
// write); showPage() moved to nav.js (residual #1) and reads the rest
// there. renderBakeryLeaderboard imports buildBakeryIndex directly from
// appState.js now (residual #2).

// ─── ITEM DETAIL ──────────────────────────────────────────────────────────────
// openDetail/closeDetailModal/isSavedItem moved to
// src/components/itemDetailModal.js (2026-08-25, Phase 5 step 19) — imported
// below. closeDetailAndOpenProfile moved to src/components/profileModal.js
// (2026-08-26, Phase 5 step 22) — it calls openProfileModal, now local
// there; closeDetailModal imports one-way from itemDetailModal.js, verified
// no cycle since that file imports nothing from profileModal.js.

// ADD ITEM MODAL/IMAGE COMPRESSION/BAKERY SEARCH/RATING/MODAL STEPS/ITEM
// MATCHING moved to src/components/addReviewModal.js (2026-08-25, Phase 4
// step 18) — imported above. saveReview stays here — it still depends on
// loadData() (deferred to Phase 7 step 29); its other former blockers are
// now imported: updateStats/renderRecentGrid from src/pages/home.js
// (step 28), renderLeaderboard/lbCurrentTab from src/pages/leaderboard.js
// (step 27). modalNext (addReviewModal.js) reaches saveReview via
// getAction('saveReview') instead of a direct import — see that file's own
// header comment for why. Registered below so that lookup resolves.
// ─── SAVE ─────────────────────────────────────────────────────────────────────
async function saveReview() {
  if (!currentUser) { openAuthModal(); return; }

  // Validate mandatory fields
  const itemName = document.getElementById('itemName').value.trim();
  const bakeryName = selectedBakery?.name || document.getElementById('bakerySearch')?.value?.trim() || '';
  const overallRatingRaw = document.getElementById('overallRating').value;
  const category = selectedCategory || '';

  const errors = [];
  if (!itemName) errors.push('Item name');
  if (!bakeryName) errors.push('Bakery');
  if (!overallRatingRaw || parseFloat(overallRatingRaw) === 0) errors.push('Overall rating');
  if (!category) errors.push('Category');

  if (errors.length) {
    showToast(`Please fill in: ${errors.join(', ')}`);
    return;
  }

  const nextBtn = document.getElementById('nextBtn');
  nextBtn.disabled = true;
  nextBtn.textContent = 'Saving…';

  try {
    const { db, storage, collection, addDoc, doc, getDoc, setDoc, updateDoc, serverTimestamp, ref, uploadBytes, getDownloadURL } = fb;

    let photoURL = null;
    if (photoFile) {
      const storageRef = ref(storage, `items/${currentUser.uid}/${Date.now()}_photo.jpg`);
      const snap = await uploadBytes(storageRef, photoFile, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(snap.ref);
    }

    const overallRating = parseFloat(document.getElementById('overallRating').value);
    const itemName = document.getElementById('itemName').value.trim();
    const bakeryName = selectedBakery?.name || '';
    const category = matchedItemRecord?.category || selectedCategory || 'other';
    const subCategory = matchedItemRecord?.subCategory || selectedSubCategory || '';

    const dims = getTastingDims(category);
    const dimData = {};
    dims.forEach(d => {
      const el = document.getElementById(d.key);
      dimData[d.key] = el ? parseFloat(el.value) : 0;
    });

    // ── Step A: Upsert the itemRecord (shared item+bakery record) ────────────
    let itemRecordId;
    const newPrice = document.getElementById('itemPrice').value ? parseFloat(document.getElementById('itemPrice').value) : null;

    if (matchedItemRecord) {
      // Linked to existing record — recalculate community avg and avg price
      itemRecordId = matchedItemRecord.id;
      const recSnap = await getDoc(doc(db, 'itemRecords', itemRecordId));
      const rec = recSnap.data();
      const newCount = (rec.reviewCount || 1) + 1;
      const newAvg = ((rec.communityAvg || rec.overallRating || 0) * (newCount - 1) + overallRating) / newCount;
      // Recalculate avg price (only include reviews that have a price)
      let newAvgPrice = rec.avgPrice || null;
      let newPriceCount = rec.priceCount || 0;
      if (newPrice !== null) {
        newPriceCount += 1;
        newAvgPrice = newPriceCount === 1
          ? newPrice
          : ((rec.avgPrice || 0) * (newPriceCount - 1) + newPrice) / newPriceCount;
      }
      // Recalculate dim averages
      const newDims = {};
      getTastingDims(category).forEach(d => {
        const prev = rec[d.key] || 0;
        newDims[d.key] = ((prev * (newCount - 1)) + (dimData[d.key] || 0)) / newCount;
      });
      await updateDoc(doc(db, 'itemRecords', itemRecordId), {
        communityAvg: Math.round(newAvg * 10) / 10,
        reviewCount: newCount,
        avgPrice: newAvgPrice !== null ? Math.round(newAvgPrice * 100) / 100 : null,
        priceCount: newPriceCount,
        ...(photoURL && !rec.photoURL ? { photoURL } : {}),
        ...newDims
      });
    } else {
      // New item record
      const newRecord = {
        name: itemName,
        category,
        subCategory,
        bakeryName,
        bakeryAddress: selectedBakery?.address || '',
        bakeryPlaceId: selectedBakery?.placeId || null,
        communityAvg: overallRating,
        reviewCount: 1,
        avgPrice: newPrice !== null ? newPrice : null,
        priceCount: newPrice !== null ? 1 : 0,
        photoURL: photoURL || null,
        createdAt: serverTimestamp(),
        ...dimData  // already keyed by d.key from getTastingDims
      };
      const recRef = await addDoc(collection(db, 'itemRecords'), newRecord);
      itemRecordId = recRef.id;
      allItemRecords.push({ id: itemRecordId, ...newRecord });
    }

    // ── Step B: Save the individual user review ───────────────────────────────
    const review = {
      itemRecordId,
      name: itemName,
      category,
      subCategory,
      bakeryName,
      bakeryAddress: selectedBakery?.address || '',
      bakeryPlaceId: selectedBakery?.placeId || null,
      bakeryLat: selectedBakery?.lat || null,
      bakeryLng: selectedBakery?.lng || null,
      price: document.getElementById('itemPrice').value ? parseFloat(document.getElementById('itemPrice').value) : null,
      overallRating,
      communityAvg: overallRating, // will be updated below
      ratingCount: matchedItemRecord ? ((allItemRecords.find(r => r.id === matchedItemRecord.id)?.reviewCount || 1) + 1) : 1,
      notes: document.getElementById('itemNotes').value,
      photoURL,
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous',
      userPhoto: currentUser.photoURL || null,
      createdAt: serverTimestamp(),
      ...dimData
    };

    const reviewRef = await addDoc(collection(db, 'items'), review);
    // Update local state immediately rather than waiting on a fresh network
    // fetch — getDocs() right after a write can occasionally race with the
    // write itself and momentarily miss it, which is exactly what caused
    // counters to sometimes need a manual pull-to-refresh to catch up.
    allItems.unshift({ id: reviewRef.id, ...review, createdAt: new Date() });
    updateStats();
    renderRecentGrid();

    nextBtn.disabled = false;
    closeAddModal();
    showToast('🥐 Review saved!');

    // Reconcile with the server in the background — this fills in anything
    // the optimistic update above doesn't cover (itemRecords aggregates,
    // leaderboard, etc.) without blocking the UI or requiring the user to
    // do anything themselves.
    loadData();
    loadItemRecords().then(() => renderLeaderboard(lbCurrentTab));
  } catch (err) {
    showToast('Error saving — check your config');
    console.error(err);
    nextBtn.disabled = false;
    nextBtn.textContent = 'Save review ✓';
  }
}

// saveReview has no data-onclick/raw markup call site of its own —
// registered purely so addReviewModal.js's modalNext can reach it via
// getAction('saveReview') (see that file's own header comment for why a
// direct import isn't used instead).
registerActions({ saveReview });





// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
// settingsPhotoFile + openSettingsPage/handleSettingsPhoto/
// saveSettingsProfile/signOutFromSettings moved to src/pages/settings.js
// (2026-08-28, Phase 7 step 32 — the last step of the 32-step plan).
// All four are imported back above: openSettingsPage for showPage()'s
// plain call, and handleSettingsPhoto/saveSettingsProfile/
// signOutFromSettings additionally kept in WINDOW EXPORTS below because
// #page-settings still has three RAW inline handlers in index.html
// (never in scope for the handler-delegation migration). signOutFromSettings
// reaches showPage() (staying here) via getAction('showPage')().

// renderBusinessSection/editingBakeryName/bakeryEditPhotoFile/
// openBakeryEditModal/handleBakeryEditPhoto/saveBakeryPage/
// closeBakeryEditModal moved to
// src/components/businessBakeryManagement.js (2026-08-26, Phase 6 step
// 24) — genuinely one clean, self-contained feature, no split needed.
// Only closeBakeryEditModal is imported below now (the #bakeryEditModal
// outside-click/keydown-Escape listeners) — renderBusinessSection's last
// caller was openSettingsPage, which moved to src/pages/settings.js at
// Phase 7 step 32 and imports it directly from businessBakeryManagement.js.
// See that file's own header comment for how this differs from
// adminPanel.js's similarly-named MANAGE BAKERY cluster.

// ─── REVIEW FLAGGING ──────────────────────────────────────────────────────────
// Genuinely empty — no code under this header, confirmed while extracting
// src/components/adminPanel.js (2026-08-26, Phase 6 step 23).

// showAdminTab/renderAdminFlags/dismissFlag/removeReviewAndFlag (ADMIN
// PANEL) and openManageBakeryModal/closeManageBakeryModal/handleBakeryPhoto/
// saveBakeryProfile/managingBakeryName/bakeryPhotoFile (MANAGE BAKERY)
// moved to src/components/adminPanel.js (2026-08-26, Phase 6 step 23) —
// imported below. closeManageBakeryModal/handleBakeryPhoto/saveBakeryProfile
// imported back for this file's own remaining callers (the #manageBakeryModal
// outside-click listener, and the two raw handlers on that same modal);
// showAdminTab's last caller was openSettingsPage, which moved to
// src/pages/settings.js at Phase 7 step 32 and imports it directly from
// adminPanel.js. See adminPanel.js's own header comment for the full
// reasoning, including a pre-existing bug surfaced in removeReviewAndFlag's
// dependency on loadData(). removeReviewAndFlag() imports loadData()
// directly from src/state/appState.js now (Phase 1 residual #2) — the
// getAction('loadData')() indirection and this file's
// registerActions({ loadData }) both went away with that move.

// ─── FLAG REVIEW ──────────────────────────────────────────────────────────────
// flagReview did NOT move to adminPanel.js despite this header's physical
// proximity to ADMIN PANEL/MANAGE BAKERY — it's the general-purpose "report
// a review" action (any signed-in user, from the item detail modal's flag
// button), not an admin action; its only relationship to that cluster is
// writing to the same flaggedReviews collection renderAdminFlags later
// reads. See adminPanel.js's own header comment for the full reasoning.
async function flagReview(itemId, bakeryName) {
  if (!currentUser) return;
  const reason = prompt('Reason for reporting this review (optional):');
  if (reason === null) return; // user cancelled — don't submit anything
  const { db, collection, addDoc, serverTimestamp } = fb;
  try {
    await addDoc(collection(db, 'flaggedReviews'), {
      itemId, bakeryName,
      flaggedBy: currentUser.uid,
      flaggedByName: currentUser.displayName || 'Unknown',
      reason,
      createdAt: serverTimestamp()
    });
    showToast('Review reported — an admin will review it');
  } catch(e) { showToast('Could not flag review'); }
}

// renderAdminUsersHTML/renderAdminBakeriesHTML moved to
// src/components/adminPanel.js (2026-08-26, Phase 6 step 23). Nothing is
// imported back here for them. renderAdminBakeriesHTML's buildBakeryIndex()
// call is a direct appState.js import there now (residual #2).

// ─── EXPLORE PAGE ─────────────────────────────────────────────────────────────
// The whole Explore cluster (~735 lines: explore* state, setExploreViewMode,
// the Leaflet map view + its diagnostics panel, Nearby-radius mode,
// country/city dropdowns, geo detection, initExplorePage, and the
// trending-bakeries logic) moved to src/pages/explore.js (2026-08-28,
// Phase 7 step 29). The static city data (EXPLORE_COUNTRIES/ALL_CITIES/
// UK_CITIES) moved to src/data/exploreCities.js; the 8 delegated explore
// actions register from explore.js itself. As of Phase 1 residual #1
// (showPage → nav.js) and #2 (exploreCache → appState.js), legacy-app.js
// imports NOTHING from explore.js — initExplorePage() is called by
// showPage() in nav.js, and exploreCache lives in appState.js alongside
// buildBakeryIndex (its only cross-module reader).

// openAddModalForBakery moved to src/components/addReviewModal.js
// (2026-08-25, Phase 4 step 18) — registers from there now; no import
// needed here, since its only callers are markup data-onclick references.

// ─── EDIT REVIEW ──────────────────────────────────────────────────────────────
// openEditModal/updateDimDisplay/updateEditSubCategory/closeEditModal/
// clearEditPhoto/editingItemId/editPhotoFile/editPhotoDataURL moved to
// src/components/editReviewModal.js (2026-08-24, Phase 2 step 9) —
// imported above. handleEditPhoto moved there too (2026-08-25, once Phase
// 4 step 18 landed and compressImage/compressToDataURL got a real
// importable home) — resolving that step's own tied deferred-follow-up.
// saveEdit/deleteReview stay here for now. As of Phase 1 residual #2
// (2026-08-30) they are FULLY UNBLOCKED — their last blocker, loadData(),
// is now importable from src/state/appState.js (renderLeaderboard/
// lbCurrentTab importable since step 27, closeEditModal since step 9). The
// move into editReviewModal.js is a clean follow-up but a deliberate,
// separate decision — see CLAUDE.md's ⚠️ callout #2.

async function saveEdit() {
  if (!editingItemId || !currentUser) return;
  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { db, storage, doc, updateDoc, ref, uploadBytes, getDownloadURL } = fb;
    let photoURL = editPhotoDataURL && !editPhotoFile ? editPhotoDataURL : null;
    if (editPhotoFile) {
      const storageRef = ref(storage, `items/${currentUser.uid}/${Date.now()}_edit.jpg`);
      const snap = await uploadBytes(storageRef, editPhotoFile, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(snap.ref);
    }
    const item = allItems.find(i => i.id === editingItemId);
    const newCategory = document.getElementById('editCategory')?.value || item?.category || 'other';
    const newSubCategory = document.getElementById('editSubCategory')?.value || item?.subCategory || '';
    const overallRating = parseFloat(document.getElementById('editOverallRating').value);
    const editSaveDims = getTastingDims(newCategory);
    const dimData = {};
    editSaveDims.forEach(d => {
      const el = document.getElementById('edit_' + d.key);
      dimData[d.key] = el ? parseFloat(el.value) : 0;
    });
    const updates = {
      name: document.getElementById('editName').value,
      category: newCategory,
      subCategory: newSubCategory,
      price: document.getElementById('editPrice').value ? parseFloat(document.getElementById('editPrice').value) : null,
      overallRating,
      communityAvg: overallRating,
      notes: document.getElementById('editNotes').value,
      ...dimData,
      ...(photoURL !== null ? { photoURL } : {})
    };
    await updateDoc(doc(db, 'items', editingItemId), updates);
    closeEditModal();
    showToast('Review updated ✓');
    await loadData();
  } catch(e) {
    showToast('Could not save — check your connection');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = 'Save changes';
  }
}

async function deleteReview() {
  if (!editingItemId || !currentUser) return;
  const item = allItems.find(i => i.id === editingItemId);
  if (!item || item.userId !== currentUser.uid) return;
  if (!confirm(`Delete your review of "${item.name || 'this item'}"? This cannot be undone.`)) return;
  try {
    const { db, storage, doc, deleteDoc, updateDoc, ref, deleteObject } = fb;
    if (item.photoURL && item.photoURL.includes('firebasestorage')) {
      try { await deleteObject(ref(storage, item.photoURL)); } catch(e) {}
    }

    const itemRecordId = item.itemRecordId;
    await deleteDoc(doc(db, 'items', editingItemId));

    // Clean up the shared itemRecord so a deleted review doesn't leave stale
    // orphaned data lingering on the leaderboard / bakery pages.
    if (itemRecordId) {
      const remaining = allItems.filter(i => i.itemRecordId === itemRecordId && i.id !== editingItemId);
      try {
        if (!remaining.length) {
          // That was the only review for this item — remove the record entirely
          await deleteDoc(doc(db, 'itemRecords', itemRecordId));
        } else {
          // Recalculate every aggregate fresh from whatever reviews remain,
          // rather than trying to subtract the deleted one incrementally
          const reviewCount = remaining.length;
          const communityAvg = remaining.reduce((s, r) => s + (r.overallRating || 0), 0) / reviewCount;
          const withPrice = remaining.filter(r => r.price !== null && r.price !== undefined);
          const avgPrice = withPrice.length ? withPrice.reduce((s, r) => s + r.price, 0) / withPrice.length : null;
          const dims = getTastingDims(item.category || 'other');
          const dimData = {};
          dims.forEach(d => {
            const vals = remaining.map(r => r[d.key] || 0);
            dimData[d.key] = vals.reduce((s, v) => s + v, 0) / vals.length;
          });
          await updateDoc(doc(db, 'itemRecords', itemRecordId), {
            communityAvg: Math.round(communityAvg * 10) / 10,
            reviewCount,
            avgPrice: avgPrice !== null ? Math.round(avgPrice * 100) / 100 : null,
            priceCount: withPrice.length,
            ...dimData
          });
        }
      } catch(e) { console.warn('Could not clean up itemRecord after delete:', e); }
    }

    closeEditModal();
    showToast('Review deleted');
    await loadData();
    await loadItemRecords();
    renderLeaderboard(lbCurrentTab);
  } catch(e) {
    showToast('Could not delete — try again');
    console.error(e);
  }
}

// Edit Review modal. saveEdit/deleteReview's data-onclick call sites are in
// index.html (the modal's static footer buttons).
// updateDimDisplay/updateEditSubCategory/closeEditModal/clearEditPhoto/
// handleEditPhoto registered from src/components/editReviewModal.js now
// (Phase 2 step 9 / Phase 4 step 18); saveEdit/deleteReview stay
// registered here — now fully unblocked to move into editReviewModal.js
// (residual #2 made loadData() importable), a pending separate decision.
registerActions({ saveEdit, deleteReview });

// ─── CATEGORY MIGRATION ───────────────────────────────────────────────────────
const CATEGORY_MIGRATION_MAP = {
  // Old flat category -> { category: newParent, subCategory: newSub }
  'croissant':       { category: 'pastry',     subCategory: 'croissant' },
  'pain_au_chocolat':{ category: 'pastry',     subCategory: 'pain_au_chocolat' },
  'danish':          { category: 'pastry',     subCategory: 'danish' },
  'eclair':          { category: 'pastry',     subCategory: 'eclair' },
  'sourdough':       { category: 'bread',      subCategory: 'sourdough' },
  'baguette':        { category: 'bread',      subCategory: 'baguette' },
  'focaccia':        { category: 'bread',      subCategory: 'focaccia' },
  'ciabatta':        { category: 'bread',      subCategory: 'ciabatta' },
  'rye':             { category: 'bread',      subCategory: 'rye' },
  'tart':            { category: 'tart',       subCategory: 'fruit_tart' },
  'lemon_tart':      { category: 'tart',       subCategory: 'lemon_tart' },
  'custard_tart':    { category: 'tart',       subCategory: 'custard_tart' },
  'quiche':          { category: 'tart',       subCategory: 'quiche' },
  'cake':            { category: 'cake',       subCategory: 'victoria_sponge' },
  'cheesecake':      { category: 'cake',       subCategory: 'cheesecake' },
  'carrot_cake':     { category: 'cake',       subCategory: 'carrot_cake' },
  'bun':             { category: 'bun',        subCategory: 'cinnamon_bun' },
  'cinnamon_bun':    { category: 'bun',        subCategory: 'cinnamon_bun' },
  'cookie':          { category: 'cookie',     subCategory: 'chocolate_chip' },
  'brownie':         { category: 'cookie',     subCategory: 'brownie' },
  'shortbread':      { category: 'cookie',     subCategory: 'shortbread' },
  'flapjack':        { category: 'cookie',     subCategory: 'flapjack' },
  'bread':           { category: 'bread',      subCategory: 'sourdough' },
  'pastry':          { category: 'pastry',     subCategory: 'croissant' },
  'sandwich':        { category: 'sandwich',   subCategory: 'sandwich' },
  'sausage_roll':    { category: 'sandwich',   subCategory: 'sausage_roll' },
  'scone':           { category: 'scone',      subCategory: 'plain_scone' },
  'doughnut':        { category: 'sweet_treat',subCategory: 'doughnut' },
  'waffle':          { category: 'sweet_treat',subCategory: 'waffle' },
  'macaron':         { category: 'sweet_treat',subCategory: 'macaron' },
  'madeleine':       { category: 'sweet_treat',subCategory: 'madeleine' },
};

async function runCategoryMigration() {
  if (!isAdmin()) { showToast('Admin only'); return; }
  if (!confirm('This will update all legacy reviews to use the new category system. Continue?')) return;

  const btn = document.getElementById('migrationBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Migrating…'; }

  const { db, collection, getDocs, doc, updateDoc } = fb;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const snap = await getDocs(collection(db, 'items'));
    const updates = [];

    snap.docs.forEach(d => {
      const item = d.data();
      const cat = item.category || '';

      // Skip if already on new system (category is a parent key in CATEGORY_TREE)
      if (CATEGORY_TREE[cat] && item.subCategory) { skipped++; return; }

      // Check if it needs migration
      const migration = CATEGORY_MIGRATION_MAP[cat];
      if (!migration) {
        // Unknown category — set to other
        updates.push({ id: d.id, category: 'other', subCategory: 'other' });
        return;
      }

      updates.push({ id: d.id, ...migration });
    });

    // Also migrate itemRecords
    const recSnap = await getDocs(collection(db, 'itemRecords'));
    recSnap.docs.forEach(d => {
      const item = d.data();
      const cat = item.category || '';
      if (CATEGORY_TREE[cat] && item.subCategory) { return; }
      const migration = CATEGORY_MIGRATION_MAP[cat];
      if (migration) updates.push({ id: d.id, _collection: 'itemRecords', ...migration });
    });

    // Batch updates (Firestore limit is 500 per batch but we'll do sequential for simplicity)
    for (const u of updates) {
      try {
        const colName = u._collection || 'items';
        await updateDoc(doc(db, colName, u.id), {
          category: u.category,
          subCategory: u.subCategory
        });
        updated++;
      } catch(e) {
        errors++;
        console.error('Migration error for', u.id, e);
      }
    }

    const msg = `Migration complete: ${updated} updated, ${skipped} already current, ${errors} errors`;
    showToast(msg);
    if (btn) { btn.textContent = `✓ Done (${updated} updated)`; }

    // Reload data to reflect changes
    await loadData();
    await loadItemRecords();

  } catch(e) {
    showToast('Migration failed — check console');
    console.error(e);
    if (btn) { btn.disabled = false; btn.textContent = 'Run migration'; }
  }
}

// toggleReaction/refreshReactionBar/buildReactionBarInner/
// toggleReactionPicker/toggleReactionFromPicker/loadReactionsForItems
// moved to src/components/reactions.js (2026-08-24, Phase 2 step 8).
// buildReactionBarInner/loadReactionsForItems are no longer imported here
// either — their only caller was feedCardHTML, which moved to
// src/components/reviewCard.js (step 12) and is now called from
// src/pages/feed.js (step 13), not this file. Stale import removed
// 2026-08-28 (Phase 7 step 28).

// ─── FOLLOWS ──────────────────────────────────────────────────────────────────
// myFollowing/myFollowers/loadFollows moved to src/state/appState.js
// (2026-08-24, Phase 0 step 3c) — imported above.

async function toggleFollow(targetUid) {
  if (!currentUser || targetUid === currentUser.uid) return;
  const { db, doc, setDoc, deleteDoc, serverTimestamp, collection, addDoc } = fb;
  const followId = `${currentUser.uid}_${targetUid}`;
  const followRef = doc(db, 'follows', followId);
  try {
    if (myFollowing.has(targetUid)) {
      await deleteDoc(followRef);
      myFollowing.delete(targetUid);
      showToast('Unfollowed');
    } else {
      await setDoc(followRef, {
        followerId: currentUser.uid,
        followerName: currentUser.displayName || 'Anonymous',
        followerPhoto: currentUser.photoURL || null,
        followingId: targetUid,
        createdAt: serverTimestamp()
      });
      myFollowing.add(targetUid);
      showToast('Following!');
    }
    refreshFollowButtons(targetUid);
  } catch(e) { showToast('Could not update follow'); console.error(e); }
}

// getFollowState/followBtnHTML/getFollowersForUser/getFollowingForUser/
// buildFollowUserRowHTML moved to src/components/follows.js (2026-08-24,
// Phase 3 step 14) — imported above. toggleFollow/refreshFollowButtons/
// followAndRefreshPeople stay here — see follows.js's own header comment for
// why. refreshOpenProfile moved to src/components/profileModal.js
// (2026-08-26, Phase 5 step 22, imported above) — it reads
// profileModalUid/profileActiveCatFilter/profileActiveLocFilter, now local
// state there. followAndRefreshProfile itself could NOT move too, despite
// being this pair's other half (per follows.js's own step-14 note naming
// both as waiting for step 22): it also calls toggleFollow(), which stays
// here (toggleFollow calls refreshFollowButtons, which calls renderPeople(),
// still local to this file) — moving followAndRefreshProfile would have
// meant profileModal.js importing toggleFollow back from here, the
// forbidden direction. See profileModal.js's own header comment for the
// full reasoning.

// The old onclick="toggleFollow(uid).then(()=>refreshOpenProfile())"/
// "...then(()=>renderPeople())" chains don't fit the plain "cleanup, then one
// parameterized action" data-onclick shape (delegate.js), so each gets a
// small named wrapper instead. event.stopPropagation() is dropped from both:
// these follow buttons sit inside/beside their own clickable rows, and
// delegate.js's closest()-based matching already resolves to the innermost
// data-onclick only — the same reasoning as the explore map markers.
function followAndRefreshProfile(uid) {
  toggleFollow(uid).then(() => refreshOpenProfile());
}

function followAndRefreshPeople(uid) {
  toggleFollow(uid).then(() => renderPeople());
}

function refreshFollowButtons(uid) {
  // Re-render people page if open
  const peoplePage = document.getElementById('page-people');
  if (peoplePage?.classList.contains('active')) renderPeople();
}

// ─── SHOP ─────────────────────────────────────────────────────────────────────
let editingProductId = null;
let editingProductBakery = null;
let productPhotoFile = null;

// allProducts/loadProducts/renderShopPage/applyShopFilters/productCardHTML/
// openProductDetail/closeProductDetailModal/handleBuy moved to
// src/pages/shop.js (2026-08-24, Phase 2 step 11) — imported above.


// ─── SHOP MANAGEMENT (business users) ────────────────────────────────────────
async function openManageShopModal(bakeryName) {
  if (!ownsBakery(bakeryName)) return;
  editingProductBakery = bakeryName;
  document.getElementById('manageShopTitle').textContent = `${bakeryName} — Shop`;
  document.getElementById('manageShopModal').classList.add('open');
  lockScroll();
  await renderManageShop(bakeryName);
}

async function renderManageShop(bakeryName) {
  await loadProducts();
  const body = document.getElementById('manageShopBody');
  const myProducts = allProducts.filter(p => p.bakeryName === bakeryName);

  body.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:0.82rem;color:var(--text-muted);">${myProducts.length} product${myProducts.length !== 1 ? 's' : ''} listed</div>
      <button class="btn-espresso" style="font-size:0.82rem;padding:8px 16px;" data-onclick="openProductModal" data-args='${dataArgs([null, bakeryName])}'>+ Add product</button>
    </div>
    ${myProducts.length ? myProducts.map(p => `
      <div class="shop-manage-row" data-onclick="openProductModal" data-args='${dataArgs([p.id, bakeryName])}'>
        <div class="shop-manage-thumb">${p.photoURL ? `<img src="${p.photoURL}" alt="${p.name}">` : '🛍️'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.9rem;font-weight:600;color:var(--espresso);">${p.name}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">£${p.price ? parseFloat(p.price).toFixed(2) : '—'} · ${p.available !== false ? 'Available' : 'Unavailable'}</div>
        </div>
        <span style="font-size:0.78rem;color:var(--caramel);">Edit →</span>
      </div>`).join('') : `<div class="empty-state" style="padding:24px 0;"><div class="empty-state-icon">🛍️</div><div class="empty-state-title">No products yet</div><div class="empty-state-text">Add your first product above.</div></div>`}`;
}

function closeManageShopModal() {
  document.getElementById('manageShopModal').classList.remove('open');
  unlockScroll();
}

// ─── ADD / EDIT PRODUCT ────────────────────────────────────────────────────────
function openProductModal(productId, bakeryName) {
  editingProductId = productId;
  editingProductBakery = bakeryName;
  productPhotoFile = null;

  const p = productId ? allProducts.find(x => x.id === productId) : null;
  document.getElementById('productModalTitle').textContent = p ? 'Edit product' : 'Add product';
  document.getElementById('productName').value = p?.name || '';
  document.getElementById('productType').value = p?.productType || '';
  document.getElementById('productDescription').value = p?.description || '';
  document.getElementById('productPrice').value = p?.price || '';
  document.getElementById('productLink').value = p?.buyLink || '';
  document.getElementById('productEmail').value = p?.enquiryEmail || '';
  document.getElementById('productAvailable').checked = p?.available !== false;

  const wrap = document.getElementById('productPhotoWrap');
  wrap.innerHTML = p?.photoURL ? `<img src="${p.photoURL}" style="width:100%;height:100%;object-fit:cover;">` : '🛍️';

  const deleteBtn = document.getElementById('productDeleteBtn');
  deleteBtn.style.display = p ? 'block' : 'none';

  document.getElementById('productModal').classList.add('open');
  lockScroll();
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
  unlockScroll();
}

async function handleProductPhoto(input) {
  if (!input.files[0]) return;
  productPhotoFile = await compressImage(input.files[0], 800, 0.85);
  const dataURL = await compressToDataURL(input.files[0], 800, 0.85);
  document.getElementById('productPhotoWrap').innerHTML = `<img src="${dataURL}" style="width:100%;height:100%;object-fit:cover;">`;
}

async function saveProduct() {
  if (!currentUser || !editingProductBakery) return;
  const btn = document.querySelector('#productModal .btn-espresso');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { db, storage, collection, addDoc, doc, updateDoc, setDoc, serverTimestamp, ref, uploadBytes, getDownloadURL } = fb;
    let photoURL = editingProductId ? (allProducts.find(p => p.id === editingProductId)?.photoURL || null) : null;
    if (productPhotoFile) {
      const key = editingProductId || Date.now().toString();
      const storageRef = ref(storage, `products/${encodeURIComponent(editingProductBakery)}/${key}.jpg`);
      const snap = await uploadBytes(storageRef, productPhotoFile, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(snap.ref);
    }
    const data = {
      bakeryName: editingProductBakery,
      name: document.getElementById('productName').value.trim(),
      productType: document.getElementById('productType').value || '',
      description: document.getElementById('productDescription').value.trim(),
      price: document.getElementById('productPrice').value ? parseFloat(document.getElementById('productPrice').value) : null,
      buyLink: document.getElementById('productLink').value.trim() || null,
      enquiryEmail: document.getElementById('productEmail').value.trim() || null,
      available: document.getElementById('productAvailable').checked,
      photoURL,
      ownerId: currentUser.uid,
      updatedAt: serverTimestamp()
    };
    if (editingProductId) {
      await updateDoc(doc(db, 'products', editingProductId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'products'), data);
    }
    closeProductModal();
    showToast('Product saved ✓');
    await loadProducts();
    await renderManageShop(editingProductBakery);
  } catch(e) {
    showToast('Could not save product');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = 'Save product';
  }
}

async function deleteProduct() {
  if (!editingProductId || !currentUser) return;
  if (!confirm('Delete this product? This cannot be undone.')) return;
  const { db, doc, deleteDoc } = fb;
  try {
    await deleteDoc(doc(db, 'products', editingProductId));
    closeProductModal();
    showToast('Product deleted');
    await loadProducts();
    await renderManageShop(editingProductBakery);
  } catch(e) {
    showToast('Could not delete product');
  }
}

// SHOP MANAGEMENT (business users) + ADD/EDIT PRODUCT modal, converted
// together since the latter is only ever reached from the former.
// openProductModal/handleProductPhoto/saveProduct/deleteProduct had no call
// sites outside this cluster, so all four come out of WINDOW EXPORTS
// entirely.
registerActions({ openProductModal, handleProductPhoto, saveProduct, deleteProduct });

// ─── FEATURE REQUESTS ─────────────────────────────────────────────────────────
function openFeatureRequestModal() {
  if (!currentUser) { openAuthModal(); return; }
  document.getElementById('featureTitle').value = '';
  document.getElementById('featureDetail').value = '';
  document.getElementById('featureTitleCount').textContent = '0 / 120';
  document.getElementById('featureRequestModal').classList.add('open');
  lockScroll();
  document.getElementById('featureTitle').oninput = function() {
    document.getElementById('featureTitleCount').textContent = `${this.value.length} / 120`;
  };
}

function closeFeatureRequestModal() {
  document.getElementById('featureRequestModal').classList.remove('open');
  unlockScroll();
}

async function submitFeatureRequest() {
  if (!currentUser || !fb) return;
  const title = document.getElementById('featureTitle').value.trim();
  if (!title) { showToast('Please enter a title for your request'); return; }
  const detail = document.getElementById('featureDetail').value.trim();
  const btn = document.getElementById('featureSubmitBtn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  const { db, collection, addDoc, serverTimestamp } = fb;
  try {
    await addDoc(collection(db, 'featureRequests'), {
      title,
      detail: detail || null,
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous',
      status: 'new',
      votes: 1,
      voterIds: [currentUser.uid],
      createdAt: serverTimestamp()
    });
    closeFeatureRequestModal();
    showToast('💡 Request submitted — thanks!');
  } catch(e) {
    showToast('Could not submit request');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = 'Submit request';
  }
}

// toggleFeatureVote/updateFeatureStatus/deleteFeatureRequest/
// renderAdminFeatures moved to src/components/adminPanel.js (2026-08-26,
// Phase 6 step 23) — a split, not the whole FEATURE REQUESTS section:
// openFeatureRequestModal/closeFeatureRequestModal/submitFeatureRequest
// above stay here (the general "💡 Request a feature" submit flow, reached
// by any signed-in user via the avatar dropdown menu). renderAdminFeatures
// only ever renders into #adminTabContent (this cluster's own tab content
// area) — confirmed via DOM id before moving, not assumed from its name —
// so despite toggleFeatureVote not being isAdmin()-gated in its own body,
// its only reachable UI lives entirely inside the admin-gated panel. See
// adminPanel.js's own header comment for the full reasoning.

document.getElementById('featureRequestModal').addEventListener('click', e => {
  if (e.target === document.getElementById('featureRequestModal')) closeFeatureRequestModal();
});

// ─── BOOKMARKS ────────────────────────────────────────────────────────────────
// userBookmarks/loadBookmarks moved to src/state/appState.js (2026-08-24,
// Phase 0 step 3c) — imported above. isBookmarked moved to appState.js too
// (2026-08-25, Phase 5 step 21) — no longer imported into this file, its
// last consumer (renderBakeries) left at step 26 and the Explore results
// at step 29; explore.js/bakeries.js import it from appState.js directly.
// toggleBookmark
// itself moved to src/components/profileModal.js (2026-08-26, Phase 5 step
// 22) — a fresh grep found its only real (non-markup) caller was
// removeBookmarkAndRefreshSaved, also moving that step; its other two
// "callers" (bakeryModal.js's bookmark button, this file's own
// not-yet-extracted renderBakeries) are both data-onclick="toggleBookmark"
// markup strings, resolved via the global registerActions() registry
// regardless of which file registers it — no import needed here for either.

// ─── SAVED ITEMS (want to try) ────────────────────────────────────────────────
// userSavedItems/loadSavedItems moved to src/state/appState.js (2026-08-24,
// Phase 0 step 3c) — imported above. isSavedItem moved to
// src/components/itemDetailModal.js (2026-08-25, Phase 5 step 19) — its only
// external caller (openDetail) moved there too; toggleSaveItem/
// removeSavedItem below never called it, so it's imported back here for
// nothing — nothing here calls it either.

async function toggleSaveItem(itemId) {
  if (!currentUser) { openAuthModal(); return; }
  if (!fb) return;
  const { db, collection, addDoc, doc, deleteDoc, serverTimestamp } = fb;
  const btn = document.getElementById(`saveItemBtn_${itemId}`);

  const already = userSavedItems[itemId];
  if (already) {
    try {
      await deleteDoc(doc(db, 'savedItems', already.docId));
      delete userSavedItems[itemId];
      if (btn) { btn.classList.remove('saved'); btn.innerHTML = '🔖 Save to try'; }
      showToast('Removed from saved items');
    } catch(e) { showToast('Could not remove'); }
  } else {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    try {
      const docRef = await addDoc(collection(db, 'savedItems'), {
        userId: currentUser.uid,
        itemId,
        name: item.name || 'Unknown bake',
        bakeryName: item.bakeryName || '',
        bakeryAddress: item.bakeryAddress || '',
        category: item.category || '',
        photoURL: item.photoURL || null,
        price: item.price || null,
        createdAt: serverTimestamp()
      });
      userSavedItems[itemId] = { docId: docRef.id, itemId, name: item.name, bakeryName: item.bakeryName, bakeryAddress: item.bakeryAddress, category: item.category, photoURL: item.photoURL, price: item.price };
      if (btn) { btn.classList.add('saved'); btn.innerHTML = '🔖 Saved to try'; }
      showToast('🔖 Saved — find it in your profile');
    } catch(e) { showToast('Could not save item'); console.error(e); }
  }
}

async function removeSavedItem(itemId) {
  if (!fb) return;
  const { db, doc, deleteDoc } = fb;
  const already = userSavedItems[itemId];
  if (!already) return;
  try {
    await deleteDoc(doc(db, 'savedItems', already.docId));
    delete userSavedItems[itemId];
    showToast('Removed');
    if (currentUser) switchProfileTab('saved', currentUser.uid);
  } catch(e) { showToast('Could not remove'); }
}

// ─── SHARE REVIEW WITH A FOLLOWED USER ────────────────────────────────────────
// openShareReviewModal/renderShareCandidateRows/filterShareCandidates/
// closeShareReviewModal/sendSharedReview + shareModalCandidates/
// shareModalItemId moved to src/components/shareReviewModal.js (2026-08-25,
// Phase 5 step 20) — imported below. removeBookmarkAndRefreshSaved/
// renderSavedTab moved to src/components/profileModal.js (2026-08-26, Phase
// 5 step 22) — they're Profile-modal internals (Saved tab) that only ever
// shared this file section by position, not topic; both call
// switchProfileTab, now local there. removeBookmarkAndRefreshSaved's own
// toggleBookmark call also moved with it — see profileModal.js's own header
// comment for that dependency's full reasoning.

registerActions({ removeSavedItem });

// ─── PRE-ORDER DISCOVERY PAGE ─────────────────────────────────────────────────
// initPreorderPage + poActiveCountry/poActiveCity/poUserCoords/poNearestCity
// + onPoCountryChange/onPoCityChange/populatePoCityDropdown/poDetectNearest/
// renderPreorderPage/closeBakeryModalIfOpen moved to src/pages/preorders.js
// (2026-08-28, Phase 7 step 30). initPreorderPage is imported back above
// (showPage calls it); the 5 delegated discovery actions register from
// preorders.js itself, and renderPreorderPage's registration there is also
// what bakeryModal.js's reserveOffering reaches via
// getAction('renderPreorderPage')(). The "My Pre-orders" burger sheet
// (step 31) stays below.

// ─── MY PRE-ORDERS SHEET (burger menu) ─────────────────────────────────────
// myPendingPreorders + loadMyPreorders/updatePreorderBadge/
// openMyPreordersSheet/closeMyPreordersSheet/viewOrdersFromMyPreordersSheet
// moved to src/components/preordersSheet.js (2026-08-28, Phase 7 step 31).
// loadMyPreorders is imported back above — initFirebaseApp()'s auth
// listener and cancelReservation() (below) both call it; bakeryModal.js's
// reserveOffering reaches it via getAction('loadMyPreorders')(). The 4
// delegated sheet actions register from preordersSheet.js itself now.

// ─── PRE-ORDER / RESERVATIONS ─────────────────────────────────────────────────
// COLLECTION_TIMES/COLLECTION_SLOTS and the whole "Baker: manage offerings"
// cluster (openManagePreordersModal through markCollected, plus the
// catalogue manager further below) moved to
// src/components/manageOfferingsModal.js (2026-08-25, Phase 4 step 17) —
// nothing here imports any of it back; see that file's own header comment.
// renderOrdersTab/parseSlotStartTime moved to src/components/reservations.js
// (2026-08-24, Phase 3 step 16) — imported above. cancelReservation stays
// here — see reservations.js's own header comment for why.
// renderPreorderTab/openReserveModal/closeReserveModal/reserveOffering (the
// "Reserve" flow from a bakery profile's own Pre-order tab, deliberately
// left out of reservations.js at step 16) moved to
// src/components/bakeryModal.js (2026-08-25, Phase 5 step 21) — reserveOffering
// calls getAction('loadMyPreorders')()/getAction('renderPreorderPage')()
// instead of importing them directly; see that file's own header comment.
// cancelReservation itself stays here — see reservations.js's own header
// comment for why (its own blocker, loadMyPreorders, is unrelated to this
// step's reserveOffering move).
async function cancelReservation(reservationId, offeringId) {
  if (!confirm('Cancel this reservation? This cannot be undone.')) return;
  if (!fb) return;
  const { db, doc, updateDoc, getDoc } = fb;
  try {
    // Check 12hr rule
    const resSnap = await getDoc(doc(db, 'reservations', reservationId));
    const r = resSnap.data();
    const collect = new Date(r.collectDate + 'T' + (parseSlotStartTime(r.slot) || '09:00'));
    if ((collect - new Date()) < 12 * 60 * 60 * 1000) {
      showToast('Cannot cancel within 12 hours of collection time');
      return;
    }
    await updateDoc(doc(db, 'reservations', reservationId), { status: 'cancelled' });
    // Return qty to offering
    if (offeringId) {
      const oSnap = await getDoc(doc(db, 'preorderOfferings', offeringId));
      if (oSnap.exists()) {
        const curr = oSnap.data().remaining ?? 0;
        await updateDoc(doc(db, 'preorderOfferings', offeringId), { remaining: curr + 1 });
      }
    }
    showToast('Reservation cancelled');
    loadMyPreorders(); // Update burger menu badge
    const content = document.getElementById('profileTabContent');
    if (content) await renderOrdersTab(content);
  } catch(e) { showToast('Could not cancel'); console.error(e); }
}

// generateOrderQRCodes/expandQR/closeExpandedQR/openQRScanner/scanFrame/
// closeQRScanner/processScannedReservation/confirmCollected/
// closeQrConfirmOverlay all now live in src/components/qrCode.js —
// confirmCollected/closeQrConfirmOverlay's own step-10 deferral resolved
// 2026-08-25 (Phase 4 step 17), once markCollected() got a real importable
// home in src/components/manageOfferingsModal.js — see qrCode.js's own
// header comment for the full reasoning.

// notifLastSeen/notifItems/loadNotifications/updateBellBadge/
// toggleNotifPanel/closeNotifPanel/renderNotifPanel/openNotifItem/
// markAllNotifsRead moved to src/components/notifications.js (2026-08-26,
// Phase 6 step 25) — genuinely one clean, self-contained feature, no split
// needed (matching step 24's finding). loadNotifications imported below
// for this file's own remaining callers (initFirebaseApp's direct call
// plus 3 onSnapshot real-time-listener callbacks).

// openAuthModal/closeAuthModal/switchAuthTab/signInGoogle/signInEmail/
// signUpEmail/showAuthError/friendlyAuthError moved to
// src/components/authModal.js (2026-08-24, Phase 1 step 6) — imported
// above. Fully self-contained move, unlike nav.js's step 5 — no deferred
// pieces here.

// ─── UTILS ────────────────────────────────────────────────────────────────────
// Close modals on overlay click
document.getElementById('addModal').addEventListener('click', e => { if (e.target === document.getElementById('addModal')) closeAddModal(); });
document.getElementById('authModal').addEventListener('click', e => { if (e.target === document.getElementById('authModal')) closeAuthModal(); });
document.getElementById('detailModal').addEventListener('click', e => { if (e.target === document.getElementById('detailModal')) closeDetailModal(); });
document.getElementById('bakeryModal').addEventListener('click', e => { if (e.target === document.getElementById('bakeryModal')) closeBakeryModal(); });

// Keyboard close
document.getElementById('editModal').addEventListener('click', e => { if (e.target === document.getElementById('editModal')) closeEditModal(); });
document.getElementById('bakeryEditModal').addEventListener('click', e => { if (e.target === document.getElementById('bakeryEditModal')) closeBakeryEditModal(); });
document.getElementById('profileModal').addEventListener('click', e => { if (e.target === document.getElementById('profileModal')) closeProfileModal(); });
document.getElementById('manageBakeryModal').addEventListener('click', e => { if (e.target === document.getElementById('manageBakeryModal')) closeManageBakeryModal(); });
document.getElementById('shareReviewModal').addEventListener('click', e => { if (e.target === document.getElementById('shareReviewModal')) closeShareReviewModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAddModal(); closeAuthModal(); closeDetailModal(); closeBakeryModal(); closeEditModal(); closeProfileModal(); closeBakeryEditModal(); } });

// Modal-close buttons — pilot for replacing WINDOW EXPORTS with delegated
// data-onclick handlers. These functions stay in WINDOW EXPORTS too, since
// some onclick="closeXModal(); ..." call sites in dynamically-built HTML
// haven't been converted yet. closeProductDetailModal registers from
// src/pages/shop.js now (Phase 2 step 11). closeDetailModal registers from
// src/components/itemDetailModal.js now (Phase 5 step 19).
// closeShareReviewModal registers from src/components/shareReviewModal.js
// now (Phase 5 step 20). closeBakeryModal/closeReserveModal register from
// src/components/bakeryModal.js now (Phase 5 step 21). closeProfileModal/
// closeCalDayModal register from src/components/profileModal.js now
// (Phase 5 step 22). closeManageBakeryModal registers from
// src/components/adminPanel.js now (Phase 6 step 23).
// closeBakeryEditModal registers from
// src/components/businessBakeryManagement.js now (Phase 6 step 24).
registerActions({
  closeManageShopModal, closeProductModal,
  closeFeatureRequestModal,
});

// showPage/navigateFromMobileMenu/openMyProfileFromMobileMenu +
// toggleUserMenu/toggleMobileMenu/closeAvatarDropdown/signOutFromAvatarMenu
// all register from src/components/nav.js now (Phase 1 step 5 + residual #1)
// instead of here. index.html's last raw showPage() call site (the profile
// modal's ✏️ profileEditBtn, onclick="closeProfileModal(); showPage('settings')")
// was converted to data-onclick="closeProfileModal,showPage" as part of
// residual #1. showPage stays in WINDOW EXPORTS below only for
// tests/people-filters.spec.js's window.showPage('people') call.

// openNotifItem registers from src/components/notifications.js now (Phase
// 6 step 25).

// Auth modal (openAuthModal/closeAuthModal/switchAuthTab/signInGoogle/
// signInEmail/signUpEmail) registered from src/components/authModal.js now
// (Phase 1 step 6) instead of here. openAuthModal/closeAuthModal still have
// many plain-JS call sites elsewhere in this file (e.g.
// `if (!currentUser) { openAuthModal(); return; }`, the keydown Escape
// listener above) — those are ordinary imported-function calls now, not
// markup-driven, so they need no registration of their own.

// Mobile menu. openFeatureRequestModal is also named directly in a
// comma-chained data-onclick list (zero-arg, synchronous, no delay) — see
// delegate.js. closeMobileMenu/signOutFromMobileMenu/navigateFromMobileMenu/
// openMyProfileFromMobileMenu registered from src/components/nav.js now
// (Phase 1 step 5 + residual #1), triggerPwaInstall from
// src/app/lifecycle.js now (Phase 1 step 7), openMyPreordersSheet from
// src/components/preordersSheet.js now (Phase 7 step 31).
registerActions({ openFeatureRequestModal });

// Feature requests — the general submit flow only; toggleFeatureVote/
// deleteFeatureRequest/updateFeatureStatus register from
// src/components/adminPanel.js now (Phase 6 step 23).
registerActions({ submitFeatureRequest });

// Bakeries page. setBakeryView/renderBakeries — the view-toggle buttons'
// data-onclick and the location filter's data-onchange — register from
// src/pages/bakeries.js itself now (Phase 7 step 26), along with
// geocodeMissingBakeries/populateBakeryLocationFilter/distKmUser and the
// bakeryViewMode/userGeoCoords state. buildBakeryIndex moved to
// src/state/appState.js (residual #2) — no longer registered/owned here.
// openBakeryProfile registers from src/components/bakeryModal.js (Phase 5
// step 21); toggleBookmark from src/components/profileModal.js (Phase 5
// step 22).

// People page view toggle + rankings/location-filter onchange handlers now
// register from src/pages/people.js itself (Phase 3 step 15) — setPeopleView/
// renderRankings/populateRankingLocationFilter all moved there.

// followAndRefreshProfile/followAndRefreshPeople are new wrapper functions
// (see followBtnHTML) replacing two toggleFollow(...).then(...) chains that
// didn't fit the plain data-onclick shape. switchProfileTab registers from
// src/components/profileModal.js now (Phase 5 step 22).
registerActions({
  followAndRefreshProfile, followAndRefreshPeople,
});

// openManageShopModal had no call sites anywhere else in the file, so it's
// been removed from WINDOW EXPORTS entirely (not just registered) — first
// function to be fully migrated off the global. openAddModalForBakery
// registers from src/components/addReviewModal.js now (Phase 4 step 18).
// switchBakeryTab registers from src/components/bakeryModal.js now (Phase 5
// step 21). openProfileModal registers from src/components/profileModal.js
// now (Phase 5 step 22). openManageBakeryModal registers from
// src/components/adminPanel.js now (Phase 6 step 23).
// openBakeryEditModal registers from
// src/components/businessBakeryManagement.js now (Phase 6 step 24).
registerActions({
  openManageShopModal,
});

// Pre-order discovery page. onPoCountryChange/onPoCityChange/poDetectNearest/
// renderPreorderPage/closeBakeryModalIfOpen register from
// src/pages/preorders.js itself now (Phase 7 step 30) — the poCountry/
// poCity/poBakeryFilter/poSortFilter <select>s' data-onchange and the
// poNearestBtn data-onclick. renderPreorderPage's registration there is
// also what bakeryModal.js's reserveOffering reaches via
// getAction('renderPreorderPage')() (global registry).

// My pre-orders sheet: loadMyPreorders/openMyPreordersSheet/
// closeMyPreordersSheet/viewOrdersFromMyPreordersSheet register from
// src/components/preordersSheet.js now (Phase 7 step 31).

// Profile Orders tab's cancel button. markCollected/openEditOffering/
// deleteOffering (the baker-side Manage Pre-orders modal) register from
// src/components/manageOfferingsModal.js instead (Phase 4 step 17).
// expandQR/closeExpandedQR (QR-code tap-to-enlarge and its close button)
// register from src/components/qrCode.js (Phase 2 step 10). reserveOffering
// registers from src/components/bakeryModal.js now (Phase 5 step 21) —
// cancelReservation stays here, unaffected (different deferral, see
// reservations.js's own header comment).
registerActions({ cancelReservation });

// Baker: manage offerings — the whole cluster (tab bar, Upcoming/Historic/
// Month/Forecast renderers, Add/Edit offering forms, catalogue) moved to
// src/components/manageOfferingsModal.js (2026-08-25, Phase 4 step 17),
// including its own registerActions() call. openManagePreordersModal/
// closeManagePreordersModal moved with it — pulled out of the two bulk
// registerActions() calls below/above that mix several other
// not-yet-extracted clusters' own open/close-modal functions.

// Explore page. onExploreCountryChange/onExploreCityChange/
// onExploreSortChange/toggleExploreNearby/onExploreRadiusChange/
// hideExploreResults/setExploreViewMode/closeExploreMapPopup register from
// src/pages/explore.js itself now (Phase 7 step 29) — the country/city/sort
// <select>s' data-onchange, the Nearby button + radius select, the "← All
// cities" button, and the List/Map view toggle, all resolve via the global
// registry regardless of which file calls registerActions().

// Leaderboard. switchLbMode/switchLbTab/closeLbAndOpenBakery/onLbFilterChange
// register from src/pages/leaderboard.js itself now (Phase 7 step 27) —
// the two mode buttons' and 8 tab buttons' data-onclick, and the two filter
// <select>s' data-onchange, all resolve via the global registry regardless
// of which file calls registerActions().

// Item detail modal (markup itself now lives in itemDetailModal.js).
// None of these have any call site left outside their own data-onclick
// attributes above — none need WINDOW EXPORTS. openEditModal (also reached
// via a comma-chained data-onclick, e.g. "closeDetailModal,openEditModal")
// registers from src/components/editReviewModal.js now (Phase 2 step 9).
// prefillItemForReview registers from src/components/addReviewModal.js now
// (Phase 4 step 18). openShareReviewModal registers from
// src/components/shareReviewModal.js now (Phase 5 step 20).
// closeDetailAndOpenProfile registers from src/components/profileModal.js
// now (Phase 5 step 22).
registerActions({ toggleSaveItem, flagReview });

// Category migration (admin settings panel) — single button, single
// zero-arg call site, no compound logic.
registerActions({ runCategoryMigration });

// Notifications panel — toggleNotifPanel/closeNotifPanel/
// markAllNotifsRead register from src/components/notifications.js now
// (Phase 6 step 25).

initDelegatedEvents();

// Init tasting dims and category chips
buildTastingDims();
buildCategoryChips();

// renderAdminUsers (dead code — zero real callers anywhere, confirmed via
// grep; carried the exact same #adminUsersPanel bug as
// refreshAdminUsersPanel) moved to src/components/adminPanel.js alongside
// that bug's other half (2026-08-26, Phase 6 step 23) rather than deleted,
// per this extraction's own scope (surface, don't fix/delete).

// ── NEXT SCRIPT BLOCK ──


// KEYBOARD-AWARE SCROLLING / APP UPDATE CHECK / MOBILE STATUS BAR FIX /
// PULL TO REFRESH / PWA INSTALL moved to src/app/lifecycle.js (2026-08-24,
// Phase 1 step 7) — imported above as a side-effect-only import.


// ─── WINDOW EXPORTS ──────────────────────────────────────────────────────
// Auto-generated list of every top-level function in this module, exposed
// onto window so the existing onclick="..." / onchange="..." attributes
// throughout index.html keep working exactly as before. Only genuinely
// top-level (column-0) functions are included here — functions nested
// inside IIFEs/blocks are deliberately excluded, since they were never
// reachable from onclick attributes in the original file either.
Object.assign(window, {
  closeProfileModal,
  handleBakeryPhoto,
  // handleSettingsPhoto/saveSettingsProfile/signOutFromSettings are in
  // src/pages/settings.js (Phase 7 step 32) but MUST stay here — index.html's
  // #page-settings still has raw onchange="handleSettingsPhoto(this)" /
  // onclick="saveSettingsProfile()" / onclick="signOutFromSettings()"
  // handlers (never in scope for the handler-delegation migration), and a
  // raw handler can only resolve window[name]. Same as switchFeedTab below.
  handleSettingsPhoto,
  openAddModal,
  processScannedReservation,
  refreshFollowButtons,
  renderManageShop,
  saveBakeryProfile,
  saveSettingsProfile,
  selectManualBakery,
  showKnownBakeries,
  showPage,
  signOutFromSettings,
  // Now in src/pages/feed.js (Phase 3 step 13) — kept here (unlike every
  // other moved function) since index.html's FEED TABS buttons still use a
  // raw, undelegated onclick="switchFeedTab(...)"; that cluster was out of
  // scope for the handler-delegation migration, so this is genuinely
  // unavoidable rather than staleness.
  switchFeedTab,
  updateOverallRating,
});
