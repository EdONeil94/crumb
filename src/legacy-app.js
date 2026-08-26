import { registerActions } from './events/actions.js';
import { initDelegatedEvents, dataArgs } from './events/delegate.js';
import { GOOGLE_MAPS_KEY } from './config.js';
import {
  CATEGORY_TREE, CATEGORIES, SUB_TO_PARENT, SUB_LABEL, getCategoryDisplay,
  TASTING_DIMS_UNIVERSAL, TASTING_DIM_5TH, DEFAULT_DIM_5TH, getTastingDims,
  TASTING_DIMS,
} from './data/categories.js';
import { lockScroll, unlockScroll, showToast, timeAgo } from './utils/dom.js';
import { distKm, extractCity, extractCountry } from './utils/geo.js';
import { escJS } from './utils/strings.js';
import {
  SUPER_ADMIN_UID, currentUser, fb, currentUserRole,
  setCurrentUser, setFb, setCurrentUserRole,
  setCurrentUserBakery, isAdmin, isBusiness, ownsBakery, loadUserRole,
  loadBakeryProfiles,
  allItems, allBakeries, allProfiles, allItemRecords, setAllItems,
  setAllBakeries, loadItemRecords, ensureProfileExists,
  myFollowing, myFollowers, loadFollows, loadBookmarks,
  isBookmarked, userSavedItems, loadSavedItems,
} from './state/appState.js';
import {
  updateNav, toggleMobileMenu, closeMobileMenu, toggleUserMenu,
  closeAvatarDropdown, signOutFromAvatarMenu, closeOnClickOutside,
  signOutFromMobileMenu,
} from './components/nav.js';
import {
  openAuthModal, closeAuthModal, switchAuthTab, signInGoogle, signInEmail,
  signUpEmail, showAuthError, friendlyAuthError,
} from './components/authModal.js';
import {
  buildReactionBarInner, loadReactionsForItems,
} from './components/reactions.js';
import {
  closeEditModal, editingItemId, editPhotoFile, editPhotoDataURL,
} from './components/editReviewModal.js';
import { processScannedReservation } from './components/qrCode.js';
import {
  allProducts, loadProducts, renderShopPage, productCardHTML,
} from './pages/shop.js';
import { cardHTML, feedCardHTML } from './components/reviewCard.js';
import { switchFeedTab, renderFeed } from './pages/feed.js';
import {
  peopleViewMode, setPeopleView,
  populateRankingLocationFilter, renderRankings, renderPeople,
} from './pages/people.js';
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
import { openBakeryProfile, closeBakeryModal } from './components/bakeryModal.js';
import {
  openProfileModal, closeProfileModal, switchProfileTab, refreshOpenProfile,
} from './components/profileModal.js';
import {
  showAdminTab, closeManageBakeryModal, handleBakeryPhoto, saveBakeryProfile,
} from './components/adminPanel.js';
import {
  renderBusinessSection, closeBakeryEditModal,
} from './components/businessBakeryManagement.js';
// Side-effect only — PWA install/update-check/status-bar-fix/pull-to-refresh/
// keyboard-scroll all self-execute on import, no exports needed here.
import './app/lifecycle.js';

// lockScroll/unlockScroll, showToast, timeAgo, escJS, distKm, extractCity,
// extractCountry moved to src/utils/ (2026-08-24, pages/components carving
// Phase 0 step 2) — imported above.

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

async function loadProfiles() {
  if (!fb) return;
  const { db, collection, getDocs } = fb;
  try {
    const snap = await getDocs(collection(db, 'profiles'));
    snap.docs.forEach(d => { allProfiles[d.id] = d.data(); });
    if (currentUser) updateNav();
    // Re-render People page if visible
    const peoplePage = document.getElementById('page-people');
    if (peoplePage && peoplePage.classList.contains('active')) renderPeople();
  } catch(e) { console.log('Profiles load error:', e.message); }
}

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
let lbCurrentTab = 'all';

// CATEGORY_TREE, CATEGORIES, SUB_TO_PARENT, SUB_LABEL, getCategoryDisplay,
// TASTING_DIMS_UNIVERSAL, TASTING_DIM_5TH, DEFAULT_DIM_5TH, getTastingDims,
// and TASTING_DIMS moved to src/data/categories.js (2026-08-24, first step
// of the pages/components carving) — imported at the top of this file.
// allProfiles/allItems/allItemRecords/ensureProfileExists moved to
// src/state/appState.js (2026-08-24, Phase 0 step 3b) — imported above.

// GOOGLE_MAPS_KEY moved to src/config.js (2026-08-25, pages/components
// carving Phase 4 step 18) — imported above.

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
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (name === 'leaderboard') {
    populateLbLocationFilter();
    if (lbCurrentMode === 'bakeries') renderBakeryLeaderboard(); else renderLeaderboard(lbCurrentTab);
  }
  if (name === 'feed') renderFeed();
  if (name === 'bakeries') { bakeryViewMode = 'all'; renderBakeries(); }
  if (name === 'explore') initExplorePage();
  if (name === 'preorders') initPreorderPage();
  if (name === 'shop') renderShopPage();
  if (name === 'people') {
    populateRankingLocationFilter();
    if (peopleViewMode === 'rankings') renderRankings();
    else renderPeople();
  }
  if (name === 'settings') openSettingsPage();
}

// updateNav/toggleMobileMenu/closeMobileMenu/toggleUserMenu/
// closeAvatarDropdown/signOutFromAvatarMenu/closeOnClickOutside/
// signOutFromMobileMenu moved to src/components/nav.js (2026-08-24, Phase 1
// step 5) — imported above. showPage/navigateFromMobileMenu/
// openMyProfileFromMobileMenu stay here — see nav.js's own header comment
// for why.

// Mobile menu items that close the menu before acting, so the destination
// isn't rendered underneath a still-animating-out menu.
function navigateFromMobileMenu(page) {
  closeMobileMenu();
  setTimeout(() => showPage(page), 50);
}
function openMyProfileFromMobileMenu() {
  closeMobileMenu();
  setTimeout(() => { if (currentUser) openProfileModal(currentUser.uid); }, 50);
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
async function loadData() {
  if (!fb) return;
  const { db, collection, getDocs, query, orderBy, limit } = fb;
  try {
    const q = query(collection(db, 'items'));
    const snap = await getDocs(q);
    setAllItems(snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
        const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
        return tb - ta;
      }));
    renderRecentGrid();
    updateStats();
  } catch (e) {
    console.log('Data load error (likely not configured yet):', e.message);
  }
}

function updateStats() {
  document.getElementById('statItems').textContent = allItems.length;
  const bakeries = new Set(allItems.map(i => i.bakeryName).filter(Boolean));
  document.getElementById('statBakeries').textContent = bakeries.size;
  const raters = new Set(allItems.map(i => i.userId).filter(Boolean));
  document.getElementById('statRaters').textContent = raters.size;
}

function renderRecentGrid() {
  const grid = document.getElementById('recentGrid');
  if (!allItems.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🥐</div><div class="empty-state-title">Nothing here yet</div><div class="empty-state-text">Be the first to log a pastry and start the community.</div></div>`;
    return;
  }
  grid.innerHTML = allItems.slice(0, 9).map(item => cardHTML(item)).join('');
}

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
// allBakeries moved to src/state/appState.js (2026-08-24, Phase 0 step
// 3b), imported above; kept here since buildBakeryIndex() itself stays
// (it reads exploreCache, owned by the not-yet-extracted Explore page —
// see appState.js's own 3b note for why this function didn't move too).
// Registered below (not a click action — src/components/bakeryModal.js's
// openBakeryProfile calls it via getAction('buildBakeryIndex')() instead of
// a forbidden direct import, since openBakeryProfile itself had to move
// this step and this function couldn't move with it; Phase 4 step 18's
// modalNext/saveReview precedent, reused here — see bakeryModal.js's own
// header comment).

function buildBakeryIndex() {
  setAllBakeries({});
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

registerActions({ buildBakeryIndex });

let bakeryViewMode = 'all'; // 'all' | 'nearest' | 'visited'
let userGeoCoords = null;   // { lat, lng } from geolocation

async function geocodeMissingBakeries() {
  // For bakeries with an address but no lat/lng, use Places text search to get coords
  const missing = Object.values(allBakeries).filter(b => !b.lat && b.address);
  if (!missing.length || !GOOGLE_MAPS_KEY) return;
  await Promise.all(missing.map(async b => {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
          'X-Goog-FieldMask': 'places.id,places.location,places.displayName'
        },
        body: JSON.stringify({ textQuery: `${b.name} ${b.address}`, maxResultCount: 1 })
      });
      if (!res.ok) return;
      const data = await res.json();
      const place = data.places?.[0];
      if (place?.location) {
        b.lat = place.location.latitude;
        b.lng = place.location.longitude;
        if (!b.placeId) b.placeId = place.id;
      }
    } catch(e) { /* silent — best effort */ }
  }));
}

function setBakeryView(mode) {
  bakeryViewMode = mode;
  ['all','nearest','visited'].forEach(m => {
    const btn = document.getElementById('bakeryView' + m.charAt(0).toUpperCase() + m.slice(1));
    if (btn) btn.classList.toggle('active', m === mode);
  });
  if (mode === 'nearest') {
    const doNearest = async () => {
      buildBakeryIndex();
      const missing = Object.values(allBakeries).filter(b => !b.lat && b.address);
      if (missing.length) {
        document.getElementById('bakeriesGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 12px;"></div>Finding nearby bakeries…</div>';
      }
      await geocodeMissingBakeries();
      renderBakeries();
    };
    if (userGeoCoords) {
      doNearest();
    } else {
      navigator.geolocation.getCurrentPosition(
        pos => {
          userGeoCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          doNearest();
        },
        () => {
          showToast('Location access denied — can\'t sort by distance');
          setBakeryView('all');
        }
      );
    }
  } else {
    renderBakeries();
  }
}

function populateBakeryLocationFilter() {
  const sel = document.getElementById('bakeryLocationFilter');
  if (!sel) return;
  const cities = [...new Set(
    Object.values(allBakeries)
      .map(b => b.city)
      .filter(Boolean)
  )].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">All locations</option>' +
    cities.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('');
}

function distKmUser(b) {
  if (!userGeoCoords || !b.lat || !b.lng) return Infinity;
  return distKm(userGeoCoords.lat, userGeoCoords.lng, b.lat, b.lng);
}

function renderBakeries() {
  buildBakeryIndex();
  populateBakeryLocationFilter();

  const grid = document.getElementById('bakeriesGrid');
  const locationFilter = document.getElementById('bakeryLocationFilter')?.value || '';

  let bakeries = Object.values(allBakeries);

  // Location filter
  if (locationFilter) {
    bakeries = bakeries.filter(b => b.city === locationFilter);
  }

  // View mode filter
  if (bakeryViewMode === 'visited' && currentUser) {
    const myBakeryNames = new Set(allItems.filter(i => i.userId === currentUser.uid).map(i => i.bakeryName));
    bakeries = bakeries.filter(b => myBakeryNames.has(b.name));
  }

  // Sort
  if (bakeryViewMode === 'nearest' && userGeoCoords) {
    bakeries = bakeries
      .filter(b => b.lat && b.lng)
      .sort((a, b) => distKmUser(a) - distKmUser(b));
  } else {
    bakeries = bakeries.sort((a, b) => {
      const aAvg = a.totalScore / a.items.length;
      const bAvg = b.totalScore / b.items.length;
      return bAvg - aAvg;
    });
  }

  if (!bakeries.length) {
    const msg = bakeryViewMode === 'visited'
      ? 'You haven\'t reviewed any bakeries yet'
      : bakeryViewMode === 'nearest'
        ? 'No bakeries with location data found nearby'
        : 'No bakeries found';
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏪</div><div class="empty-state-title">${msg}</div></div>`;
    return;
  }

  const myBakeryNames = currentUser
    ? new Set(allItems.filter(i => i.userId === currentUser.uid).map(i => i.bakeryName))
    : new Set();

  grid.innerHTML = bakeries.map(b => {
    const avg = (b.totalScore / b.items.length).toFixed(1);
    const myReviewCount = b.items.filter(i => i.userId === currentUser?.uid).length;
    const distBadge = bakeryViewMode === 'nearest' && userGeoCoords && b.lat
      ? `<span class="bakery-dist-badge">📍 ${distKmUser(b).toFixed(1)} km away</span>`
      : '';
    const visitedBadge = myBakeryNames.has(b.name)
      ? `<span class="bakery-visited-badge">✓ ${myReviewCount} review${myReviewCount !== 1 ? 's' : ''} by you</span>`
      : '';
    const bookmarkBtnHTML = currentUser
      ? `<button class="bookmark-btn${isBookmarked(b.name) ? ' saved' : ''}" data-onclick="toggleBookmark" data-args='${dataArgs([b.name, b.address || ''])}' title="Save bakery">🔖</button>`
      : '';
    return `
      <div class="bakery-card" data-onclick="openBakeryProfile" data-args='${dataArgs([b.name])}'>
        <div class="bakery-card-header">
          <div style="flex:1;min-width:0;">
            <div class="bakery-card-name">${b.name}</div>
            ${b.address ? `<div class="bakery-card-address">📍 ${b.address}</div>` : ''}
            ${distBadge || visitedBadge ? `<div style="margin-top:4px;">${distBadge}${visitedBadge}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            ${bookmarkBtnHTML}
            <div class="bakery-card-score">${avg}</div>
          </div>
        </div>
        <div class="bakery-card-stats">
          <div class="bakery-card-stat"><strong>${b.items.length}</strong> review${b.items.length !== 1 ? 's' : ''}</div>
          <div class="bakery-card-stat"><strong>${avg}</strong> avg rating</div>
          <div class="bakery-card-stat"><strong>${new Set(b.items.map(i=>i.category)).size}</strong> item type${new Set(b.items.map(i=>i.category)).size !== 1 ? 's' : ''}</div>
        </div>
        ${b.blurb ? `<div class="bakery-card-blurb">"${b.blurb}"</div>` : ''}
      </div>`;
  }).join('');
}

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
let lbCurrentMode = 'items';

function switchLbMode(mode) {
  lbCurrentMode = mode;
  document.getElementById('lbModeItems').classList.toggle('active', mode === 'items');
  document.getElementById('lbModeItems').classList.toggle('active', mode === 'items');
  document.getElementById('lbModeBakeries').classList.toggle('active', mode === 'bakeries');
  document.getElementById('lbItemTabs').style.display = mode === 'items' ? 'flex' : 'none';
  populateLbLocationFilter();
  if (mode === 'bakeries') {
    renderBakeryLeaderboard();
  } else {
    renderLeaderboard(lbCurrentTab);
  }
}

function populateLbLocationFilter() {
  const sel = document.getElementById('lbLocationFilter');
  if (!sel) return;
  const cities = [...new Set(
    allItems.map(i => extractCity(i.bakeryAddress || '')).filter(Boolean)
  )].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">📍 All locations</option>' +
    cities.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('');
}

function onLbFilterChange() {
  if (lbCurrentMode === 'bakeries') renderBakeryLeaderboard();
  else renderLeaderboard(lbCurrentTab);
}

function getLbFilters() {
  return {
    location: document.getElementById('lbLocationFilter')?.value || '',
    minRating: parseFloat(document.getElementById('lbRatingFilter')?.value || '0') || 0
  };
}

function switchLbTab(tab, btn) {
  document.querySelectorAll('#lbItemTabs .lb-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  lbCurrentTab = tab;
  renderLeaderboard(tab);
}

function renderBakeryLeaderboard() {
  buildBakeryIndex();
  const list = document.getElementById('lbList');
  const { location, minRating } = getLbFilters();

  let bakeries = Object.values(allBakeries)
    .filter(b => b.items.length > 0)
    .map(b => ({
      ...b,
      avg: b.totalScore / b.items.length,
      reviewCount: b.items.length,
      topItem: [...b.items].sort((x,y) => (y.communityAvg||y.overallRating||0)-(x.communityAvg||x.overallRating||0))[0]
    }));

  // Apply location filter (by city)
  if (location) bakeries = bakeries.filter(b => extractCity(b.address || '') === location);
  // Apply min rating filter
  if (minRating) bakeries = bakeries.filter(b => b.avg >= minRating);

  bakeries = bakeries.sort((a, b) => b.avg - a.avg).slice(0, 20);

  // Update subtitle
  const subtitle = document.getElementById('lbSubtitle');
  if (subtitle) {
    const parts = [];
    if (location) parts.push(location);
    if (minRating) parts.push(`${minRating}+ rated`);
    subtitle.textContent = parts.length
      ? `Top bakeries — ${parts.join(', ')}`
      : 'Top bakeries, ranked by community average';
  }

  if (!bakeries.length) {
    list.innerHTML = `<div class="empty-state" style="color:var(--honey-light)"><div class="empty-state-icon">🏪</div><div class="empty-state-title" style="color:var(--honey)">No bakeries match</div><div class="empty-state-text">Try adjusting your filters.</div></div>`;
    return;
  }

  list.innerHTML = bakeries.map((b, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const emoji = b.topItem ? (CATEGORY_TREE[b.topItem.category]?.emoji || '🥐') : '🏪';
    const thumb = b.topItem?.photoURL
      ? `<img src="${b.topItem.photoURL}" style="width:42px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;" alt="">`
      : `<div class="lb-image">${emoji}</div>`;

    return `
      <div class="lb-item" data-onclick="closeLbAndOpenBakery" data-args='${dataArgs([b.name])}'>
        <div class="lb-rank ${rankClass}">${rank}</div>
        ${thumb}
        <div class="lb-info">
          <div class="lb-name">${b.name}</div>
          <div class="lb-bakery">📍 ${b.address || ''}</div>
          <div class="lb-reviews-line">${b.reviewCount} review${b.reviewCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="lb-right">
          <div class="lb-score">${b.avg.toFixed(1)}</div>
        </div>
      </div>`;
  }).join('');
}

function closeLbAndOpenBakery(name) {
  openBakeryProfile(name);
}

function renderLeaderboard(tab) {
  // If in bakery mode, delegate
  if (lbCurrentMode === 'bakeries') { renderBakeryLeaderboard(); return; }

  // Merge itemRecords with any orphaned allItems that have no itemRecord
  // This ensures reviews created before itemRecords existed still appear
  const byKey = {};

  // First pass — dedupe allItems by name+bakery
  allItems.forEach(item => {
    const key = (item.name || '').toLowerCase() + '||' + (item.bakeryName || '').toLowerCase();
    if (!byKey[key]) {
      byKey[key] = { ...item, _scores: [item.overallRating || 0], _count: 1 };
    } else {
      byKey[key]._scores.push(item.overallRating || 0);
      byKey[key]._count++;
      if (!byKey[key].photoURL && item.photoURL) byKey[key].photoURL = item.photoURL;
    }
  });

  const orphanedRecords = Object.values(byKey)
    .filter(r => {
      // Only include if there's no matching itemRecord
      const key = (r.name || '').toLowerCase() + '||' + (r.bakeryName || '').toLowerCase();
      return !allItemRecords.some(ir =>
        (ir.name || '').toLowerCase() === (r.name || '').toLowerCase() &&
        (ir.bakeryName || '').toLowerCase() === (r.bakeryName || '').toLowerCase()
      );
    })
    .map(r => ({
      ...r,
      communityAvg: r._scores.reduce((a,b) => a+b, 0) / r._scores.length,
      reviewCount: r._count
    }));

  // Combine itemRecords + orphaned reviews
  let records = [...allItemRecords, ...orphanedRecords];

  // Bayesian weighted score — items with few reviews are pulled toward global avg
  // until they have enough reviews to be trusted
  const MINIMUM_REVIEWS = 3; // reviews needed for full confidence
  const globalAvg = records.length
    ? records.reduce((s, r) => s + (r.communityAvg || 0), 0) / records.length
    : 3.0;

  function weightedScore(r) {
    const avg = r.communityAvg || r.overallRating || 0;
    const n = r.reviewCount || r.ratingCount || 1;
    return (n / (n + MINIMUM_REVIEWS)) * avg + (MINIMUM_REVIEWS / (n + MINIMUM_REVIEWS)) * globalAvg;
  }

  // Apply tab filter
  const { location: lbLoc, minRating: lbMinRating } = getLbFilters();
  let filtered = [...records];

  // Location filter (by city)
  if (lbLoc) filtered = filtered.filter(r => extractCity(r.bakeryAddress || '') === lbLoc);

  if (tab === 'value') {
    filtered = filtered.filter(r => r.avgPrice && r.communityAvg).sort((a, b) => {
      const aVal = weightedScore(a) / parseFloat(a.avgPrice);
      const bVal = weightedScore(b) / parseFloat(b.avgPrice);
      return bVal - aVal;
    });
  } else if (tab !== 'all') {
    filtered = filtered.filter(r => r.category === tab);
    filtered.sort((a, b) => weightedScore(b) - weightedScore(a));
  } else {
    filtered.sort((a, b) => weightedScore(b) - weightedScore(a));
  }

  // Min rating filter
  if (lbMinRating) filtered = filtered.filter(r => (r.communityAvg || r.overallRating || 0) >= lbMinRating);

  // Update subtitle
  const subtitle2 = document.getElementById('lbSubtitle');
  if (subtitle2) {
    const parts = [];
    if (lbLoc) parts.push(lbLoc);
    if (lbMinRating) parts.push(`${lbMinRating}+ rated`);
    if (tab !== 'all' && tab !== 'value') parts.push(CATEGORY_TREE[tab]?.label || tab);
    if (tab === 'value') parts.push('best value');
    subtitle2.textContent = parts.length
      ? `Top items — ${parts.join(', ')}`
      : "Community's highest-rated bakes, ranked by average score";
  }

  filtered = filtered.slice(0, 20);

  const list = document.getElementById('lbList');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state" style="color:var(--honey-light)"><div class="empty-state-icon">🥐</div><div class="empty-state-title" style="color:var(--honey)">No rankings yet</div><div class="empty-state-text">Start logging pastries to build the leaderboard.</div></div>`;
    return;
  }

  list.innerHTML = filtered.map((record, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const catDisp = getCategoryDisplay(record);
    const rawAvg = record.communityAvg || record.overallRating || 0;
    const reviewCount2 = record.reviewCount || record.ratingCount || 1;
    const wScore = reviewCount2 >= MINIMUM_REVIEWS
      ? rawAvg
      : ((reviewCount2 / (reviewCount2 + MINIMUM_REVIEWS)) * rawAvg + (MINIMUM_REVIEWS / (reviewCount2 + MINIMUM_REVIEWS)) * globalAvg);
    const score = rawAvg ? wScore.toFixed(1) : '–';
    const isLowConfidence = reviewCount2 < MINIMUM_REVIEWS;
    const reviewCount = record.reviewCount || record.ratingCount || 1;
    const ratingCount = reviewCount; // alias for template
    const avgPStr = record.avgPrice ? ' · £' + parseFloat(record.avgPrice).toFixed(2) + ' avg' : '';
    const imageContent = record.photoURL
      ? `<img src="${record.photoURL}" style="width:42px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;" alt="">`
      : `<div class="lb-image">${catDisp.emoji}</div>`;
    // Click opens the first matching review for this record
    const matchingItem = allItems.find(it => it.itemRecordId === record.id) || allItems.find(it => (it.name||'').toLowerCase() === (record.name||'').toLowerCase() && (it.bakeryName||'').toLowerCase() === (record.bakeryName||'').toLowerCase());
    const rowAction = matchingItem
      ? `data-onclick="openDetail" data-args='${dataArgs([matchingItem.id])}'`
      : `data-onclick="openBakeryProfile" data-args='${dataArgs([record.bakeryName || ''])}'`;
    return `
      <div class="lb-item" ${rowAction}>
        <div class="lb-rank ${rankClass}">${rank}</div>
        ${imageContent}
        <div class="lb-info">
          <div class="lb-name">${record.name || 'Unknown bake'}</div>
          <div class="lb-bakery">📍 ${record.bakeryName || 'Unknown'}${avgPStr}</div>
          <div class="lb-reviews-line">${reviewCount} review${reviewCount !== 1 ? 's' : ''}${isLowConfidence ? ' · <span style="opacity:0.6;">building confidence</span>' : ''}</div>
        </div>
        <div class="lb-right">
          <div class="lb-score">${score}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── ITEM DETAIL ──────────────────────────────────────────────────────────────
// openDetail/closeDetailModal/isSavedItem moved to
// src/components/itemDetailModal.js (2026-08-25, Phase 5 step 19) — imported
// below. closeDetailAndOpenProfile moved to src/components/profileModal.js
// (2026-08-26, Phase 5 step 22) — it calls openProfileModal, now local
// there; closeDetailModal imports one-way from itemDetailModal.js, verified
// no cycle since that file imports nothing from profileModal.js.

// ADD ITEM MODAL/IMAGE COMPRESSION/BAKERY SEARCH/RATING/MODAL STEPS/ITEM
// MATCHING moved to src/components/addReviewModal.js (2026-08-25, Phase 4
// step 18) — imported above. saveReview stays here — it depends on
// updateStats/renderRecentGrid/renderLeaderboard/lbCurrentTab/loadData,
// none extracted yet (Phase 7). modalNext (addReviewModal.js) reaches it
// via getAction('saveReview') instead of a direct import — see that
// file's own header comment for why. Registered below so that lookup
// resolves.
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
let settingsPhotoFile = null;

async function openSettingsPage() {
  if (!currentUser) { openAuthModal(); return; }
  // Re-check role in case it hasn't loaded yet
  if (!currentUserRole && currentUser.uid !== SUPER_ADMIN_UID) {
    await loadUserRole();
  }

  // Profile fields
  const profile = allProfiles[currentUser.uid] || {};
  document.getElementById('settingsName').value = profile.displayName || currentUser.displayName || '';
  document.getElementById('settingsLocation').value = profile.location || '';
  const countryEl = document.getElementById('settingsCountry');
  if (countryEl) {
    if (countryEl.options.length <= 1) {
      Object.keys(EXPLORE_COUNTRIES).sort().forEach(c => {
        countryEl.add(new Option(c, c));
      });
    }
    countryEl.value = profile.country || '';
  }
  document.getElementById('settingsBio').value = profile.bio || '';
  settingsPhotoFile = null;

  // Avatar preview
  const prev = document.getElementById('settingsAvatarPreview');
  const photo = profile.photoURL || currentUser.photoURL;
  if (photo) prev.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  else prev.textContent = (profile.displayName || currentUser.displayName || '?').charAt(0).toUpperCase();

  // Fave category dropdown
  const favSelect = document.getElementById('settingsFavCategory');
  favSelect.innerHTML = '<option value="">Auto — based on my reviews</option>';
  Object.entries(CATEGORY_TREE).forEach(([key, cat]) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = cat.emoji + ' ' + cat.label;
    if (profile.favCategory === key) opt.selected = true;
    favSelect.appendChild(opt);
  });

  // Show/hide business section
  const bizCard = document.getElementById('settingsBusinessCard');
  if (isBusiness()) {
    bizCard.style.display = 'block';
    renderBusinessSection();
  } else {
    bizCard.style.display = 'none';
  }

  // Show/hide admin section
  const adminCard = document.getElementById('settingsAdminCard');
  if (isAdmin()) {
    adminCard.style.display = 'block';
    showAdminTab('users');
  } else {
    adminCard.style.display = 'none';
  }
}

function handleSettingsPhoto(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('settingsAvatarPreview').innerHTML =
      `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  };
  reader.readAsDataURL(file);
  compressImage(file, 400, 0.85).then(blob => { settingsPhotoFile = blob; });
}

async function saveSettingsProfile() {
  if (!currentUser) return;
  const btn = document.querySelector('#settingsProfileBody .btn-espresso');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const { db, storage, doc, setDoc, updateProfile, ref, uploadBytes, getDownloadURL } = fb;
    let photoURL = allProfiles[currentUser.uid]?.photoURL || currentUser.photoURL || null;
    if (settingsPhotoFile) {
      const storageRef = ref(storage, `avatars/${currentUser.uid}.jpg`);
      const snap = await uploadBytes(storageRef, settingsPhotoFile, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(snap.ref);
    }
    const displayName = document.getElementById('settingsName').value.trim() || currentUser.displayName || 'Anonymous';
    await updateProfile(currentUser, { displayName, ...(photoURL ? { photoURL } : {}) });
    const profileData = {
      displayName,
      location: document.getElementById('settingsLocation').value.trim(),
      country: document.getElementById('settingsCountry')?.value || '',
      bio: document.getElementById('settingsBio').value.trim(),
      favCategory: document.getElementById('settingsFavCategory').value || '',
      photoURL, uid: currentUser.uid, updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'profiles', currentUser.uid), profileData, { merge: true });
    allProfiles[currentUser.uid] = profileData;
    updateNav();
    showToast('Profile saved ✓');
  } catch(e) { showToast('Could not save — try again'); console.error(e); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Save profile'; } }
}

function signOutFromSettings() {
  if (confirm('Sign out of Crumbz?')) {
    fb.signOut(fb.auth);
    showPage('home');
    showToast('Signed out');
  }
}

// renderBusinessSection/editingBakeryName/bakeryEditPhotoFile/
// openBakeryEditModal/handleBakeryEditPhoto/saveBakeryPage/
// closeBakeryEditModal moved to
// src/components/businessBakeryManagement.js (2026-08-26, Phase 6 step
// 24) — genuinely one clean, self-contained feature, no split needed.
// renderBusinessSection/closeBakeryEditModal imported below for this
// file's own remaining callers (openSettingsPage's plain call, and the
// #bakeryEditModal outside-click/keydown-Escape listeners). See that
// file's own header comment for the full reasoning, including how this
// differs from adminPanel.js's similarly-named MANAGE BAKERY cluster.

// ─── REVIEW FLAGGING ──────────────────────────────────────────────────────────
// Genuinely empty — no code under this header, confirmed while extracting
// src/components/adminPanel.js (2026-08-26, Phase 6 step 23).

// showAdminTab/renderAdminFlags/dismissFlag/removeReviewAndFlag (ADMIN
// PANEL) and openManageBakeryModal/closeManageBakeryModal/handleBakeryPhoto/
// saveBakeryProfile/managingBakeryName/bakeryPhotoFile (MANAGE BAKERY)
// moved to src/components/adminPanel.js (2026-08-26, Phase 6 step 23) —
// imported below. showAdminTab/closeManageBakeryModal/handleBakeryPhoto/
// saveBakeryProfile imported back for this file's own remaining callers
// (openSettingsPage's plain call, the #manageBakeryModal outside-click
// listener, and the two raw handlers on that same modal — see
// adminPanel.js's own header comment for the full reasoning, including a
// pre-existing bug surfaced in removeReviewAndFlag's dependency on
// loadData()). removeReviewAndFlag() calls loadData() (stays here, blocked
// on Explore's exploreCache — Phase 0 step 3b / Phase 7 step 29's own note)
// via getAction('loadData')() instead of a forbidden direct import; this
// file now registers loadData for that lookup to resolve (new — loadData
// had no prior action registration).
registerActions({ loadData });

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
// src/components/adminPanel.js (2026-08-26, Phase 6 step 23) — imported
// below. renderAdminBakeriesHTML's own buildBakeryIndex() call resolves via
// getAction('buildBakeryIndex')() there instead (same blocked dependency,
// same resolution as bakeryModal.js's openBakeryProfile at step 21).

// ─── EXPLORE PAGE ─────────────────────────────────────────────────────────────
// ─── EXPLORE: WORLD CITIES DATA ───────────────────────────────────────────────
const EXPLORE_COUNTRIES = {
  'United Kingdom': [
    { name: 'London',        lat: 51.5074, lng: -0.1278 },
    { name: 'Manchester',    lat: 53.4808, lng: -2.2426 },
    { name: 'Birmingham',    lat: 52.4862, lng: -1.8904 },
    { name: 'Edinburgh',     lat: 55.9533, lng: -3.1883 },
    { name: 'Bristol',       lat: 51.4545, lng: -2.5879 },
    { name: 'Leeds',         lat: 53.8008, lng: -1.5491 },
    { name: 'Liverpool',     lat: 53.4084, lng: -2.9916 },
    { name: 'Glasgow',       lat: 55.8642, lng: -4.2518 },
    { name: 'Brighton',      lat: 50.8225, lng: -0.1372 },
    { name: 'Oxford',        lat: 51.7520, lng: -1.2577 },
    { name: 'Cambridge',     lat: 52.2053, lng: 0.1218  },
    { name: 'Bath',          lat: 51.3781, lng: -2.3597 },
    { name: 'York',          lat: 53.9600, lng: -1.0873 },
    { name: 'Newcastle',     lat: 54.9783, lng: -1.6178 },
    { name: 'Nottingham',    lat: 52.9548, lng: -1.1581 },
    { name: 'Sheffield',     lat: 53.3811, lng: -1.4701 },
    { name: 'Cardiff',       lat: 51.4816, lng: -3.1791 },
    { name: 'Belfast',       lat: 54.5973, lng: -5.9301 },
    { name: 'Norwich',       lat: 52.6309, lng: 1.2974  },
    { name: 'Exeter',        lat: 50.7184, lng: -3.5339 },
    { name: 'Chester',       lat: 53.1905, lng: -2.8910 },
    { name: 'Cheltenham',    lat: 51.8994, lng: -2.0783 },
    { name: 'Harrogate',     lat: 53.9921, lng: -1.5413 },
    { name: 'Margate',       lat: 51.3813, lng: 1.3862  },
    { name: 'Whitby',        lat: 54.4858, lng: -0.6206 },
    { name: 'Salisbury',     lat: 51.0693, lng: -1.7942 },
    { name: 'Inverness',     lat: 57.4778, lng: -4.2247 },
    { name: 'Durham',        lat: 54.7753, lng: -1.5849 },
    { name: 'Leicester',     lat: 52.6369, lng: -1.1398 },
    { name: 'Southampton',   lat: 50.9097, lng: -1.4044 },
    { name: 'Portsmouth',    lat: 50.8198, lng: -1.0880 },
    { name: 'Reading',       lat: 51.4543, lng: -0.9781 },
    { name: 'Coventry',      lat: 52.4068, lng: -1.5197 },
    { name: 'Stoke-on-Trent',lat: 53.0027, lng: -2.1794 },
    { name: 'Swansea',       lat: 51.6214, lng: -3.9436 },
    { name: 'Aberdeen',      lat: 57.1497, lng: -2.0943 },
    { name: 'Dundee',        lat: 56.4620, lng: -2.9707 },
    { name: 'Perth',         lat: 56.3950, lng: -3.4310 },
    { name: 'St Andrews',    lat: 56.3398, lng: -2.7967 },
    { name: 'Stirling',      lat: 56.1165, lng: -3.9369 },
    { name: 'Shrewsbury',    lat: 52.7078, lng: -2.7540 },
    { name: 'Hereford',      lat: 52.0567, lng: -2.7160 },
    { name: 'Worcester',     lat: 52.1920, lng: -2.2200 },
    { name: 'Stratford-upon-Avon', lat: 52.1918, lng: -1.7083 },
    { name: 'Ludlow',        lat: 52.3680, lng: -2.7166 },
    { name: 'Padstow',       lat: 50.5387, lng: -4.9368 },
    { name: 'St Ives',       lat: 50.2129, lng: -5.4804 },
    { name: 'Whitstable',    lat: 51.3613, lng: 1.0261  },
    { name: 'Rye',           lat: 50.9498, lng: 0.7312  },
    { name: 'Ludlow',        lat: 52.3680, lng: -2.7166 },
    { name: 'Hebden Bridge', lat: 53.7430, lng: -2.0118 },
    { name: 'Totnes',        lat: 50.4319, lng: -3.6854 },
    { name: 'Hay-on-Wye',    lat: 52.0726, lng: -3.1296 },
    { name: 'Lewes',         lat: 50.8743, lng: 0.0116  },
    { name: 'Frome',         lat: 51.2313, lng: -2.3248 },
    { name: 'Bury St Edmunds',lat: 52.2467, lng: 0.7148 },
    { name: 'Stamford',      lat: 52.6530, lng: -0.4810 },
    { name: 'Ludlow',        lat: 52.3680, lng: -2.7166 },
    { name: 'Skipton',       lat: 53.9620, lng: -2.0175 },
    { name: 'Helmsley',      lat: 54.2468, lng: -1.0618 },
    { name: 'Beverley',      lat: 53.8421, lng: -0.4310 },
    { name: 'Ripon',         lat: 54.1386, lng: -1.5228 },
    { name: 'Northallerton', lat: 54.3380, lng: -1.4340 },
    { name: 'Malton',        lat: 54.1370, lng: -0.8020 },
  ],
  'France': [
    { name: 'Paris',         lat: 48.8566, lng: 2.3522  },
    { name: 'Lyon',          lat: 45.7640, lng: 4.8357  },
    { name: 'Marseille',     lat: 43.2965, lng: 5.3698  },
    { name: 'Bordeaux',      lat: 44.8378, lng: -0.5792 },
    { name: 'Toulouse',      lat: 43.6047, lng: 1.4442  },
    { name: 'Nice',          lat: 43.7102, lng: 7.2620  },
    { name: 'Strasbourg',    lat: 48.5734, lng: 7.7521  },
    { name: 'Nantes',        lat: 47.2184, lng: -1.5536 },
    { name: 'Montpellier',   lat: 43.6108, lng: 3.8767  },
    { name: 'Rennes',        lat: 48.1173, lng: -1.6778 },
    { name: 'Lille',         lat: 50.6292, lng: 3.0573  },
    { name: 'Grenoble',      lat: 45.1885, lng: 5.7245  },
    { name: 'Dijon',         lat: 47.3220, lng: 5.0415  },
    { name: 'Annecy',        lat: 45.8992, lng: 6.1294  },
    { name: 'Brest',         lat: 48.3904, lng: -4.4861 },
    { name: 'Rouen',         lat: 49.4432, lng: 1.0993  },
    { name: 'Tours',         lat: 47.3941, lng: 0.6848  },
    { name: 'Aix-en-Provence',lat: 43.5297, lng: 5.4474 },
    { name: 'Cannes',        lat: 43.5528, lng: 7.0174  },
    { name: 'Saint-Malo',    lat: 48.6493, lng: -2.0256 },
    { name: 'Bayonne',       lat: 43.4929, lng: -1.4748 },
    { name: 'Colmar',        lat: 48.0793, lng: 7.3585  },
    { name: 'Périgueux',     lat: 45.1855, lng: 0.7203  },
    { name: 'Épernay',       lat: 49.0400, lng: 3.9597  },
    { name: 'Beaune',        lat: 47.0261, lng: 4.8384  },
    { name: 'Cognac',        lat: 45.6956, lng: -0.3286 },
  ],
  'Spain': [
    { name: 'Madrid',        lat: 40.4168, lng: -3.7038 },
    { name: 'Barcelona',     lat: 41.3851, lng: 2.1734  },
    { name: 'Seville',       lat: 37.3891, lng: -5.9845 },
    { name: 'Valencia',      lat: 39.4699, lng: -0.3763 },
    { name: 'Bilbao',        lat: 43.2627, lng: -2.9253 },
    { name: 'Málaga',        lat: 36.7213, lng: -4.4214 },
    { name: 'San Sebastián', lat: 43.3183, lng: -1.9812 },
    { name: 'Granada',       lat: 37.1773, lng: -3.5986 },
    { name: 'Salamanca',     lat: 40.9701, lng: -5.6635 },
    { name: 'Palma',         lat: 39.5696, lng: 2.6502  },
    { name: 'Zaragoza',      lat: 41.6561, lng: -0.8773 },
    { name: 'Córdoba',       lat: 37.8882, lng: -4.7794 },
    { name: 'Toledo',        lat: 39.8628, lng: -4.0273 },
    { name: 'Pamplona',      lat: 42.8125, lng: -1.6458 },
    { name: 'Alicante',      lat: 38.3452, lng: -0.4810 },
    { name: 'Cádiz',         lat: 36.5271, lng: -6.2886 },
    { name: 'Tarragona',     lat: 41.1189, lng: 1.2445  },
    { name: 'Burgos',        lat: 42.3440, lng: -3.6970 },
    { name: 'Segovia',       lat: 40.9429, lng: -4.1088 },
    { name: 'Santiago de Compostela', lat: 42.8782, lng: -8.5448 },
    { name: 'Estepona',      lat: 36.4271, lng: -5.1453 },
    { name: 'Marbella',      lat: 36.5101, lng: -4.8825 },
    { name: 'Ronda',         lat: 36.7468, lng: -5.1644 },
  ],
  'Italy': [
    { name: 'Rome',          lat: 41.9028, lng: 12.4964 },
    { name: 'Milan',         lat: 45.4642, lng: 9.1900  },
    { name: 'Florence',      lat: 43.7696, lng: 11.2558 },
    { name: 'Venice',        lat: 45.4408, lng: 12.3155 },
    { name: 'Naples',        lat: 40.8518, lng: 14.2681 },
    { name: 'Bologna',       lat: 44.4949, lng: 11.3426 },
    { name: 'Turin',         lat: 45.0703, lng: 7.6869  },
    { name: 'Palermo',       lat: 38.1157, lng: 13.3615 },
    { name: 'Verona',        lat: 45.4384, lng: 10.9916 },
    { name: 'Genoa',         lat: 44.4056, lng: 8.9463  },
    { name: 'Siena',         lat: 43.3186, lng: 11.3307 },
    { name: 'Pisa',          lat: 43.7228, lng: 10.4017 },
    { name: 'Modena',        lat: 44.6471, lng: 10.9252 },
    { name: 'Parma',         lat: 44.8015, lng: 10.3279 },
    { name: 'Bari',          lat: 41.1171, lng: 16.8719 },
    { name: 'Lecce',         lat: 40.3516, lng: 18.1750 },
    { name: 'Amalfi',        lat: 40.6340, lng: 14.6027 },
    { name: 'Catania',       lat: 37.5079, lng: 15.0830 },
    { name: 'Trento',        lat: 46.0748, lng: 11.1217 },
    { name: 'Trieste',       lat: 45.6495, lng: 13.7768 },
    { name: 'Perugia',       lat: 43.1107, lng: 12.3908 },
    { name: 'Lucca',         lat: 43.8430, lng: 10.5079 },
    { name: 'Ravenna',       lat: 44.4184, lng: 12.2035 },
    { name: 'Bergamo',       lat: 45.6983, lng: 9.6773  },
    { name: 'Como',          lat: 45.8080, lng: 9.0852  },
  ],
  'Germany': [
    { name: 'Berlin',        lat: 52.5200, lng: 13.4050 },
    { name: 'Munich',        lat: 48.1351, lng: 11.5820 },
    { name: 'Hamburg',       lat: 53.5753, lng: 10.0153 },
    { name: 'Cologne',       lat: 50.9333, lng: 6.9500  },
    { name: 'Frankfurt',     lat: 50.1109, lng: 8.6821  },
    { name: 'Stuttgart',     lat: 48.7758, lng: 9.1829  },
    { name: 'Düsseldorf',    lat: 51.2217, lng: 6.7762  },
    { name: 'Leipzig',       lat: 51.3397, lng: 12.3731 },
    { name: 'Dresden',       lat: 51.0504, lng: 13.7373 },
    { name: 'Nuremberg',     lat: 49.4521, lng: 11.0767 },
    { name: 'Bremen',        lat: 53.0793, lng: 8.8017  },
    { name: 'Hanover',       lat: 52.3759, lng: 9.7320  },
    { name: 'Freiburg',      lat: 47.9990, lng: 7.8421  },
    { name: 'Heidelberg',    lat: 49.3988, lng: 8.6724  },
    { name: 'Bonn',          lat: 50.7374, lng: 7.0982  },
    { name: 'Münster',       lat: 51.9607, lng: 7.6261  },
    { name: 'Regensburg',    lat: 49.0134, lng: 12.1016 },
    { name: 'Bamberg',       lat: 49.8988, lng: 10.9028 },
    { name: 'Lübeck',        lat: 53.8655, lng: 10.6866 },
    { name: 'Erfurt',        lat: 50.9848, lng: 11.0299 },
    { name: 'Weimar',        lat: 50.9795, lng: 11.3235 },
    { name: 'Rothenburg ob der Tauber', lat: 49.3777, lng: 10.1794 },
  ],
  'Netherlands': [
    { name: 'Amsterdam',     lat: 52.3676, lng: 4.9041  },
    { name: 'Rotterdam',     lat: 51.9225, lng: 4.4792  },
    { name: 'Utrecht',       lat: 52.0907, lng: 5.1214  },
    { name: 'The Hague',     lat: 52.0705, lng: 4.3007  },
    { name: 'Eindhoven',     lat: 51.4416, lng: 5.4697  },
    { name: 'Groningen',     lat: 53.2194, lng: 6.5665  },
    { name: 'Delft',         lat: 52.0116, lng: 4.3571  },
    { name: 'Leiden',        lat: 52.1601, lng: 4.4970  },
    { name: 'Haarlem',       lat: 52.3874, lng: 4.6462  },
    { name: 'Maastricht',    lat: 50.8514, lng: 5.6910  },
    { name: 'Nijmegen',      lat: 51.8426, lng: 5.8546  },
    { name: 'Bruges',        lat: 51.2093, lng: 3.2247  },
    { name: 'Middelburg',    lat: 51.4988, lng: 3.6136  },
  ],
  'Belgium': [
    { name: 'Brussels',      lat: 50.8503, lng: 4.3517  },
    { name: 'Bruges',        lat: 51.2093, lng: 3.2247  },
    { name: 'Ghent',         lat: 51.0543, lng: 3.7174  },
    { name: 'Antwerp',       lat: 51.2194, lng: 4.4025  },
    { name: 'Liège',         lat: 50.6292, lng: 5.5797  },
    { name: 'Leuven',        lat: 50.8798, lng: 4.7005  },
    { name: 'Namur',         lat: 50.4669, lng: 4.8675  },
    { name: 'Mons',          lat: 50.4542, lng: 3.9522  },
    { name: 'Dinant',        lat: 50.2605, lng: 4.9121  },
  ],
  'Denmark': [
    { name: 'Copenhagen',    lat: 55.6761, lng: 12.5683 },
    { name: 'Aarhus',        lat: 56.1629, lng: 10.2039 },
    { name: 'Odense',        lat: 55.4038, lng: 10.4024 },
    { name: 'Aalborg',       lat: 57.0488, lng: 9.9217  },
    { name: 'Esbjerg',       lat: 55.4764, lng: 8.4594  },
    { name: 'Roskilde',      lat: 55.6415, lng: 12.0803 },
    { name: 'Helsingør',     lat: 56.0361, lng: 12.6136 },
  ],
  'Sweden': [
    { name: 'Stockholm',     lat: 59.3293, lng: 18.0686 },
    { name: 'Gothenburg',    lat: 57.7089, lng: 11.9746 },
    { name: 'Malmö',         lat: 55.6050, lng: 13.0038 },
    { name: 'Uppsala',       lat: 59.8586, lng: 17.6389 },
    { name: 'Lund',          lat: 55.7047, lng: 13.1910 },
  ],
  'Norway': [
    { name: 'Oslo',          lat: 59.9139, lng: 10.7522 },
    { name: 'Bergen',        lat: 60.3913, lng: 5.3221  },
    { name: 'Trondheim',     lat: 63.4305, lng: 10.3951 },
    { name: 'Stavanger',     lat: 58.9700, lng: 5.7331  },
    { name: 'Tromsø',        lat: 69.6492, lng: 18.9553 },
  ],
  'Austria': [
    { name: 'Vienna',        lat: 48.2082, lng: 16.3738 },
    { name: 'Salzburg',      lat: 47.8095, lng: 13.0550 },
    { name: 'Innsbruck',     lat: 47.2692, lng: 11.4041 },
    { name: 'Graz',          lat: 47.0707, lng: 15.4395 },
    { name: 'Hallstatt',     lat: 47.5622, lng: 13.6493 },
  ],
  'Switzerland': [
    { name: 'Zurich',        lat: 47.3769, lng: 8.5417  },
    { name: 'Geneva',        lat: 46.2044, lng: 6.1432  },
    { name: 'Basel',         lat: 47.5596, lng: 7.5886  },
    { name: 'Bern',          lat: 46.9481, lng: 7.4474  },
    { name: 'Lucerne',       lat: 47.0502, lng: 8.3093  },
    { name: 'Lausanne',      lat: 46.5197, lng: 6.6323  },
    { name: 'Zermatt',       lat: 46.0207, lng: 7.7491  },
  ],
  'Portugal': [
    { name: 'Lisbon',        lat: 38.7169, lng: -9.1395 },
    { name: 'Porto',         lat: 41.1579, lng: -8.6291 },
    { name: 'Braga',         lat: 41.5454, lng: -8.4265 },
    { name: 'Coimbra',       lat: 40.2033, lng: -8.4103 },
    { name: 'Évora',         lat: 38.5714, lng: -7.9130 },
    { name: 'Sintra',        lat: 38.7978, lng: -9.3902 },
    { name: 'Faro',          lat: 37.0194, lng: -7.9322 },
    { name: 'Cascais',       lat: 38.6979, lng: -9.4215 },
  ],
  'Japan': [
    { name: 'Tokyo',         lat: 35.6762, lng: 139.6503 },
    { name: 'Osaka',         lat: 34.6937, lng: 135.5023 },
    { name: 'Kyoto',         lat: 35.0116, lng: 135.7681 },
    { name: 'Fukuoka',       lat: 33.5904, lng: 130.4017 },
    { name: 'Sapporo',       lat: 43.0618, lng: 141.3545 },
    { name: 'Nagoya',        lat: 35.1815, lng: 136.9066 },
    { name: 'Hiroshima',     lat: 34.3853, lng: 132.4553 },
    { name: 'Nara',          lat: 34.6851, lng: 135.8048 },
    { name: 'Kamakura',      lat: 35.3197, lng: 139.5467 },
  ],
  'United States': [
    { name: 'New York',      lat: 40.7128, lng: -74.0060 },
    { name: 'Los Angeles',   lat: 34.0522, lng: -118.2437 },
    { name: 'Chicago',       lat: 41.8781, lng: -87.6298 },
    { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
    { name: 'Portland',      lat: 45.5051, lng: -122.6750 },
    { name: 'Seattle',       lat: 47.6062, lng: -122.3321 },
    { name: 'Boston',        lat: 42.3601, lng: -71.0589 },
    { name: 'Austin',        lat: 30.2672, lng: -97.7431 },
    { name: 'Nashville',     lat: 36.1627, lng: -86.7816 },
    { name: 'Denver',        lat: 39.7392, lng: -104.9903 },
    { name: 'Miami',         lat: 25.7617, lng: -80.1918 },
    { name: 'New Orleans',   lat: 29.9511, lng: -90.0715 },
    { name: 'Washington DC', lat: 38.9072, lng: -77.0369 },
    { name: 'Philadelphia',  lat: 39.9526, lng: -75.1652 },
    { name: 'Atlanta',       lat: 33.7490, lng: -84.3880 },
    { name: 'Minneapolis',   lat: 44.9778, lng: -93.2650 },
    { name: 'Pittsburgh',    lat: 40.4406, lng: -79.9959 },
    { name: 'Charleston',    lat: 32.7765, lng: -79.9311 },
    { name: 'Savannah',      lat: 32.0835, lng: -81.0998 },
    { name: 'San Diego',     lat: 32.7157, lng: -117.1611 },
    { name: 'Phoenix',       lat: 33.4484, lng: -112.0740 },
    { name: 'Houston',       lat: 29.7604, lng: -95.3698 },
    { name: 'Detroit',       lat: 42.3314, lng: -83.0458 },
    { name: 'Kansas City',   lat: 39.0997, lng: -94.5786 },
    { name: 'Salt Lake City',lat: 40.7608, lng: -111.8910 },
    { name: 'Burlington',    lat: 44.4759, lng: -73.2121 },
  ],
  'Canada': [
    { name: 'Toronto',       lat: 43.6532, lng: -79.3832 },
    { name: 'Vancouver',     lat: 49.2827, lng: -123.1207 },
    { name: 'Montreal',      lat: 45.5017, lng: -73.5673 },
    { name: 'Calgary',       lat: 51.0447, lng: -114.0719 },
    { name: 'Ottawa',        lat: 45.4215, lng: -75.6972 },
    { name: 'Quebec City',   lat: 46.8139, lng: -71.2080 },
    { name: 'Halifax',       lat: 44.6488, lng: -63.5752 },
    { name: 'Victoria',      lat: 48.4284, lng: -123.3656 },
  ],
  'Australia': [
    { name: 'Melbourne',     lat: -37.8136, lng: 144.9631 },
    { name: 'Sydney',        lat: -33.8688, lng: 151.2093 },
    { name: 'Brisbane',      lat: -27.4698, lng: 153.0251 },
    { name: 'Adelaide',      lat: -34.9285, lng: 138.6007 },
    { name: 'Perth',         lat: -31.9505, lng: 115.8605 },
    { name: 'Hobart',        lat: -42.8821, lng: 147.3272 },
    { name: 'Canberra',      lat: -35.2809, lng: 149.1300 },
    { name: 'Gold Coast',    lat: -28.0167, lng: 153.4000 },
    { name: 'Byron Bay',     lat: -28.6474, lng: 153.6020 },
    { name: 'Fremantle',     lat: -32.0569, lng: 115.7439 },
  ],
  'New Zealand': [
    { name: 'Auckland',      lat: -36.8509, lng: 174.7645 },
    { name: 'Wellington',    lat: -41.2865, lng: 174.7762 },
    { name: 'Christchurch',  lat: -43.5321, lng: 172.6362 },
    { name: 'Queenstown',    lat: -45.0312, lng: 168.6626 },
    { name: 'Dunedin',       lat: -45.8788, lng: 170.5028 },
  ],
};

// Flatten all cities for geo lookup
const ALL_CITIES = Object.entries(EXPLORE_COUNTRIES).flatMap(([country, cities]) =>
  cities.map(c => ({ ...c, country }))
);

// Legacy alias
const UK_CITIES = EXPLORE_COUNTRIES['United Kingdom'];

let exploreCache = {};
let exploreActiveCity = null;
let exploreActiveCountry = 'United Kingdom';
let exploreSortMode = 'top';
let exploreNearestCity = null;
let exploreNearbyActive = false;
let exploreNearbyRadiusMiles = 5;
let exploreNearbyCoords = null;

// ─── EXPLORE: MAP VIEW ─────────────────────────────────────────────────────────
let exploreViewMode = 'list';
let exploreLastResults = [];
let exploreMapInstance = null;

function setExploreViewMode(mode) {
  exploreViewMode = mode;
  document.getElementById('exploreViewListBtn').classList.toggle('active', mode === 'list');
  document.getElementById('exploreViewMapBtn').classList.toggle('active', mode === 'map');
  document.getElementById('exploreBakeryList').style.display = mode === 'list' ? 'flex' : 'none';
  document.getElementById('exploreMapWrap').style.display = mode === 'map' ? 'block' : 'none';
  if (mode === 'map') renderExploreMap(exploreLastResults);
}

// ─── EXPLORE MAP DIAGNOSTICS (temporary — remove once mobile bug is found) ────
function exploreMapLog(msg) {
  const panel = document.getElementById('exploreMapDebugLog');
  if (!panel) return;
  panel.style.display = 'block';
  const line = document.createElement('div');
  const t = new Date().toLocaleTimeString();
  line.textContent = `[${t}] ${msg}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

async function renderExploreMap(bakeries) {
  const debugPanel = document.getElementById('exploreMapDebugLog');
  if (debugPanel) { debugPanel.innerHTML = ''; debugPanel.style.display = 'block'; }
  exploreMapLog(`Start. ${bakeries.length} bakeries passed in. UA: ${navigator.userAgent.slice(0,60)}`);
  exploreMapLog(`GOOGLE_MAPS_KEY present: ${!!GOOGLE_MAPS_KEY}. window.L present: ${!!window.L}. markerClusterGroup present: ${!!(window.L && window.L.markerClusterGroup)}`);

  const el = document.getElementById('exploreMapEl');
  const loader = document.getElementById('exploreMapLoading');
  const loaderText = document.getElementById('exploreMapLoadingText');
  if (!el) { exploreMapLog('FATAL: #exploreMapEl not found in DOM'); return; }
  if (loader) loader.style.display = 'flex';
  if (loaderText) loaderText.textContent = 'Loading map…';

  // Many bakeries — especially older Crumbz reviews added before Places-based
  // selection was the norm — never had lat/lng stored at all. Rather than
  // silently dropping them from the map, geocode the ones that are missing it
  // (same approach already used for the profile "My Map" and Bakeries→Nearest).
  const withCoords = bakeries.filter(b => b.lat && b.lng);
  const missingCoords = bakeries.filter(b => !b.lat || !b.lng);
  exploreMapLog(`withCoords: ${withCoords.length}, missingCoords (need geocoding): ${missingCoords.length}`);

  if (missingCoords.length && loaderText) {
    loaderText.textContent = `Locating ${missingCoords.length} bakery${missingCoords.length !== 1 ? 'ies' : ''}…`;
  }

  let points;
  try {
    exploreMapLog('Starting geocode step…');
    const geocoded = await Promise.all(missingCoords.map(async b => {
      const coords = await geocodeBakeryAddress(b.name, b.address);
      exploreMapLog(`  geocode "${b.name}": ${coords ? `OK (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : 'FAILED / no result'}`);
      return coords ? { ...b, lat: coords.lat, lng: coords.lng } : null;
    }));
    points = [...withCoords, ...geocoded.filter(Boolean)];
    exploreMapLog(`Geocode step complete. Total plottable points: ${points.length}`);
  } catch(geoErr) {
    exploreMapLog(`Geocode step THREW: ${geoErr.message || geoErr}`);
    points = withCoords;
  }

  function setupMap() {
    exploreMapLog('setupMap() called');
    try {
      if (loader) loader.style.display = 'none';
      if (exploreMapInstance) { exploreMapInstance.remove(); exploreMapInstance = null; }

      const L = window.L;
      exploreMapInstance = L.map('exploreMapEl', { center: [54, -1], zoom: 6, zoomControl: true, scrollWheelZoom: false, tap: true, touchZoom: true, dragging: true });
      exploreMapLog('L.map() created OK');

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19
      }).addTo(exploreMapInstance);
      exploreMapLog('Tile layer added OK');

      // Two earlier approaches both failed: inline SVG in a divIcon silently
      // failed to paint on iOS Safari (no error, just invisible), and
      // circleMarker + a permanent Leaflet tooltip threw a hard "appendChild"
      // crash on EVERY browser including desktop (confirmed — this was never
      // iOS-specific, it was a genuine bug in that combination). Plain HTML/CSS
      // inside a divIcon — no SVG, no Leaflet tooltip system — sidesteps both:
      // it's just a styled <div> with text in it, the most basic possible
      // rendering path.
      function makeIcon(label, isCrumb) {
        const fill = isCrumb ? '#2c1810' : '#8a8a8a';
        const stroke = isCrumb ? '#d4a574' : '#cfcfcf';
        const html = `<div style="width:30px;height:30px;border-radius:50%;background:${fill};border:2px solid ${stroke};display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:9px;font-weight:700;color:${stroke};box-sizing:border-box;">${label}</div>`;
        return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
      }

      const markerLayer = L.layerGroup();
      exploreMapLog(`Using plain HTML divIcon rendering. About to add ${points.length} point(s)…`);

      if (!points.length) {
        exploreMapLog('points.length is 0 — showing "no mappable bakeries" message, nothing to plot');
        el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:400;"><div style="background:rgba(250,246,240,0.92);border-radius:8px;padding:12px 20px;font-size:0.82rem;color:var(--text-muted);text-align:center;">📍 No mappable bakeries in this result set</div></div>`);
      }

      let markersAdded = 0;
      points.forEach(b => {
        try {
          const isCrumb = b.source === 'crumb';
          const scoreLabel = isCrumb ? (b.communityAvg || 0).toFixed(1) : (b.googleRating || '–');

          const marker = L.marker([b.lat, b.lng], { icon: makeIcon(scoreLabel, isCrumb) });

          const cardAction = isCrumb
            ? `data-onclick="closeExploreMapPopup,openBakeryProfile" data-args='${dataArgs([b.name])}'`
            : '';
          const actionHtml = isCrumb
            ? `<button data-onclick="closeExploreMapPopup,openBakeryProfile" data-args='${dataArgs([b.name])}' style="margin-top:6px;width:100%;background:#2c1810;color:#d4a574;border:none;border-radius:100px;padding:8px 12px;font-size:0.8rem;font-weight:600;cursor:pointer;">View bakery →</button>`
            : `<button data-onclick="closeExploreMapPopup,openAddModalForBakery" data-args='${dataArgs([b.name, b.address || '', b.placeId || '', b.lat || '', b.lng || ''])}' style="margin-top:6px;width:100%;background:#2c1810;color:#d4a574;border:none;border-radius:100px;padding:8px 12px;font-size:0.8rem;font-weight:600;cursor:pointer;">+ Be first to review</button>`;

          // For reviewed bakeries, the whole card is tappable (not just the small
          // button) — much easier to hit accurately on a touchscreen. Google-only
          // cards keep just the explicit "+ Be first to review" button, since
          // that's a deliberate add action rather than a passive drill-through.
          // Neither the card nor the button needs event.stopPropagation() any
          // more: our delegated click handler resolves to the innermost
          // data-onclick match only, so the button's action never also
          // re-triggers the card's.
          marker.bindPopup(`
            <div style="font-family:sans-serif;min-width:170px;${isCrumb ? 'cursor:pointer;' : ''}" ${cardAction}>
              <div style="font-weight:700;font-size:0.88rem;margin-bottom:3px;">${b.name}</div>
              <div style="font-size:0.74rem;color:#888;margin-bottom:4px;">${b.address || ''}</div>
              <div style="font-size:0.8rem;">${isCrumb ? `<strong>${b.reviewCount || 1}</strong> review${(b.reviewCount||1) !== 1 ? 's' : ''} &nbsp;·&nbsp; <strong style="color:#2c1810;">⭐ ${scoreLabel}</strong>` : `<strong style="color:#2c1810;">★ ${scoreLabel} Google</strong>${b.googleReviews ? ` &nbsp;·&nbsp; ${b.googleReviews.toLocaleString()} reviews` : ''}`}</div>
              ${actionHtml}
            </div>`, { maxWidth: 220 });
          markerLayer.addLayer(marker);
          markersAdded++;
        } catch(markerErr) {
          exploreMapLog(`Marker FAILED for "${b.name}": ${markerErr.message || markerErr}`);
        }
      });
      exploreMapLog(`Marker loop done. ${markersAdded}/${points.length} added successfully.`);

      exploreMapInstance.addLayer(markerLayer);
      exploreMapLog('markerLayer added to map');

      if (points.length) {
        const group = L.featureGroup(points.map(b => L.marker([b.lat, b.lng])));
        try {
          exploreMapInstance.fitBounds(group.getBounds().pad(0.3), { maxZoom: 14 });
          exploreMapLog('fitBounds OK');
        } catch(fbErr) {
          exploreMapLog(`fitBounds THREW: ${fbErr.message || fbErr}`);
        }
      }

      // Leaflet measures its container's pixel size at the moment it initialises.
      // Since #exploreMapWrap goes from display:none to visible right before this
      // runs, the browser may not have finished laying it out yet — on slower
      // mobile devices in particular, a fixed setTimeout delay isn't always long
      // enough. A ResizeObserver is the robust fix: it fires whenever the
      // container's actual rendered size changes, however long that takes.
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          if (exploreMapInstance) exploreMapInstance.invalidateSize();
        });
        ro.observe(el);
        // Stop observing once the map is torn down again
        exploreMapInstance.on('unload', () => ro.disconnect());
      } else {
        // Fallback for older browsers without ResizeObserver support
        setTimeout(() => { if (exploreMapInstance) exploreMapInstance.invalidateSize(); }, 100);
        setTimeout(() => { if (exploreMapInstance) exploreMapInstance.invalidateSize(); }, 500);
      }

      if (markersAdded === 0 && points.length > 0) {
        el.insertAdjacentHTML('beforeend', `<div style="position:absolute;top:8px;left:8px;right:8px;z-index:600;background:#c0392b;color:white;border-radius:8px;padding:10px 14px;font-size:0.78rem;">⚠️ Found ${points.length} location${points.length!==1?'s':''} but couldn't place any pins — please screenshot this and let Ed know.</div>`);
      }
      exploreMapLog('setupMap() completed successfully ✅');
    } catch(fatalErr) {
      exploreMapLog(`FATAL error in setupMap: ${fatalErr.message || fatalErr}`);
      console.error('Explore map failed to render:', fatalErr);
      if (loader) loader.style.display = 'none';
      el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--parchment);z-index:600;padding:20px;text-align:center;"><div><div style="font-size:1.5rem;margin-bottom:8px;">⚠️</div><div style="font-size:0.85rem;color:var(--text-body);margin-bottom:6px;font-weight:600;">Map couldn't load</div><div style="font-size:0.72rem;color:var(--text-muted);word-break:break-word;">${(fatalErr && fatalErr.message) || 'Unknown error'}</div></div></div>`);
    }
  }

  if (window.L) {
    exploreMapLog('Branch: Leaflet already loaded — calling setupMap() directly');
    setupMap();
  } else {
    exploreMapLog('Branch: Leaflet not loaded — loading leaflet.js…');
    const s1 = document.createElement('script');
    s1.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s1.onload = () => { exploreMapLog('leaflet.js onload fired'); setupMap(); };
    s1.onerror = () => {
      exploreMapLog('leaflet.js onerror fired — CORE LIBRARY FAILED TO LOAD');
      if (loader) loader.style.display = 'none';
      el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--parchment);z-index:600;padding:20px;text-align:center;"><div><div style="font-size:1.5rem;margin-bottom:8px;">⚠️</div><div style="font-size:0.85rem;color:var(--text-body);font-weight:600;">Couldn't load the map library</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Check your connection and try again</div></div></div>`);
    };
    document.head.appendChild(s1);
  }
}

// Leaflet popups render inside iframe-free DOM but outside Explore's own
// click-handling context, so route "view" / "review" taps back through a
// small registrable action that closes the popup first for a clean
// transition — used as the "cleanup" half of the comma-list "cleanup, then
// one parameterized action" shape.
function closeExploreMapPopup() {
  if (exploreMapInstance) exploreMapInstance.closePopup();
}

function hideExploreResults() {
  document.getElementById('exploreResults').style.display = 'none';
}

// ─── EXPLORE: NEARBY MODE (radius-based, not tied to any city) ────────────────
function toggleExploreNearby() {
  exploreNearbyActive = !exploreNearbyActive;
  const btn = document.getElementById('exploreNearbyBtn');
  const radiusSel = document.getElementById('exploreNearbyRadius');

  if (exploreNearbyActive) {
    btn.classList.add('active');
    btn.style.background = 'var(--honey)';
    btn.style.color = 'var(--espresso)';
    radiusSel.style.display = 'inline-block';
    // Deselect any city — nearby and city selection are mutually exclusive
    exploreActiveCity = null;
    document.getElementById('exploreCitySelect').value = '';
    runExploreNearbySearch();
  } else {
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.color = '';
    radiusSel.style.display = 'none';
    document.getElementById('exploreResults').style.display = 'none';
  }
}

function onExploreRadiusChange() {
  exploreNearbyRadiusMiles = parseInt(document.getElementById('exploreNearbyRadius').value);
  if (exploreNearbyActive) runExploreNearbySearch();
}

async function runExploreNearbySearch() {
  const resultsEl = document.getElementById('exploreResults');
  const btn = document.getElementById('exploreNearbyBtn');
  const originalLabel = '📍 Nearby';
  btn.textContent = '📍 Locating…';

  const coords = await new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    );
  });

  btn.textContent = originalLabel;

  if (!coords) {
    showToast('Could not get your location');
    resultsEl.style.display = 'block';
    document.getElementById('exploreEyebrow').textContent = '📍 Nearby';
    document.getElementById('exploreTitle').textContent = 'Location unavailable';
    document.getElementById('exploreCrumbBanner').style.display = 'none';
    document.getElementById('exploreBakeryList').innerHTML = `<div class="empty-state"><div class="empty-state-icon">📍</div><div class="empty-state-title">Couldn't get your location</div><div class="empty-state-text">Check your device's location permissions and try again.</div></div>`;
    return;
  }

  exploreNearbyCoords = coords;
  const radiusKm = exploreNearbyRadiusMiles * 1.60934;

  resultsEl.style.display = 'block';
  document.getElementById('exploreEyebrow').textContent = '📍 Nearby';
  document.getElementById('exploreTitle').textContent = `Within ${exploreNearbyRadiusMiles} mile${exploreNearbyRadiusMiles !== 1 ? 's' : ''} of you`;
  document.getElementById('exploreBakeryList').innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div></div>';
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const crumbBakeries = getCrumbBakeriesNearPoint(coords.lat, coords.lng, radiusKm);

  const crumbBanner = document.getElementById('exploreCrumbBanner');
  const crumbBannerText = document.getElementById('exploreCrumbBannerText');
  if (crumbBakeries.length > 0) {
    crumbBanner.style.display = 'flex';
    crumbBannerText.textContent = `${crumbBakeries.length} bakeries reviewed by the Crumbz community nearby`;
  } else {
    crumbBanner.style.display = 'none';
  }

  let googleResults = [];
  try {
    googleResults = await fetchGoogleBakeriesNearPoint(coords.lat, coords.lng, radiusKm);
  } catch(e) {
    console.warn('Google Places nearby error:', e);
  }

  renderExploreResults({ name: 'this area' }, crumbBakeries, googleResults, true);
}

function getCrumbBakeriesNearPoint(lat, lng, radiusKm) {
  const results = {};
  allItems.forEach(item => {
    if (!item.bakeryName || !item.bakeryLat) return;
    const dist = distKm(lat, lng, item.bakeryLat, item.bakeryLng);
    if (dist > radiusKm) return;
    const key = item.bakeryName;
    if (!results[key]) results[key] = { name: key, address: item.bakeryAddress || '', lat: item.bakeryLat, lng: item.bakeryLng, items: [], totalScore: 0, dist };
    results[key].items.push(item);
    results[key].totalScore += (item.communityAvg || item.overallRating || 0);
  });
  return Object.values(results)
    .map(b => ({ ...b, communityAvg: b.items.length ? b.totalScore / b.items.length : 0, topItem: [...b.items].sort((a,b) => (b.communityAvg||b.overallRating||0) - (a.communityAvg||a.overallRating||0))[0] }))
    .sort((a, b) => b.communityAvg - a.communityAvg)
    .slice(0, 20);
}

async function fetchGoogleBakeriesNearPoint(lat, lng, radiusKm) {
  if (!GOOGLE_MAPS_KEY) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.websiteUri,places.regularOpeningHours'
    },
    body: JSON.stringify({
      textQuery: 'bakery cafe patisserie',
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusKm * 1000, 50000) }
      },
      maxResultCount: 20
    })
  });
  const data = await res.json();
  return (data.places || [])
    .filter(p => p.rating && p.rating >= 3.5)
    // locationBias is only a soft preference for the Places API — it does NOT
    // exclude results outside the radius, so enforce the actual distance ourselves.
    .filter(p => {
      if (!p.location?.latitude || !p.location?.longitude) return false;
      return distKm(lat, lng, p.location.latitude, p.location.longitude) <= radiusKm;
    })
    .sort((a, b) => {
      const scoreA = (a.rating || 0) * Math.log10((a.userRatingCount || 1) + 1);
      const scoreB = (b.rating || 0) * Math.log10((b.userRatingCount || 1) + 1);
      return scoreB - scoreA;
    })
    .slice(0, 20);
}

// ─── EXPLORE: DROPDOWNS ───────────────────────────────────────────────────────
function populateExploreCountryDropdown(selectedCountry) {
  const sel = document.getElementById('exploreCountrySelect');
  if (!sel) return;
  sel.innerHTML = Object.keys(EXPLORE_COUNTRIES).sort().map(c =>
    `<option value="${c}" ${c === selectedCountry ? 'selected' : ''}>${c}</option>`
  ).join('');
}

function populateExploreCityDropdown(country, selectedCity) {
  const sel = document.getElementById('exploreCitySelect');
  if (!sel) return;
  const cities = (EXPLORE_COUNTRIES[country] || []).slice().sort((a,b) => a.name.localeCompare(b.name));
  const nearestName = exploreNearestCity?.country === country ? exploreNearestCity?.name : null;
  sel.innerHTML = `<option value="">Select a city…</option>` +
    cities.map(c => {
      const label = c.name === nearestName ? `📍 ${c.name} (nearest)` : c.name;
      return `<option value="${c.name}" ${c.name === selectedCity ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

function onExploreCountryChange() {
  deactivateExploreNearby();
  exploreActiveCountry = document.getElementById('exploreCountrySelect').value;
  exploreActiveCity = null;
  document.getElementById('exploreResults').style.display = 'none';
  populateExploreCityDropdown(exploreActiveCountry, null);
}

function onExploreCityChange() {
  const city = document.getElementById('exploreCitySelect').value;
  if (city) {
    deactivateExploreNearby();
    selectExploreCity(city);
  }
}

function deactivateExploreNearby() {
  if (!exploreNearbyActive) return;
  exploreNearbyActive = false;
  const btn = document.getElementById('exploreNearbyBtn');
  const radiusSel = document.getElementById('exploreNearbyRadius');
  if (btn) { btn.classList.remove('active'); btn.style.background = ''; btn.style.color = ''; }
  if (radiusSel) radiusSel.style.display = 'none';
}

function onExploreSortChange() {
  exploreSortMode = document.getElementById('exploreSortSelect').value;
  if (exploreActiveCity) selectExploreCity(exploreActiveCity);
}

// ─── EXPLORE: GEO DETECTION ───────────────────────────────────────────────────
async function detectExploreLocation() {
  populateExploreCountryDropdown('United Kingdom');
  populateExploreCityDropdown('United Kingdom', null);

  if (!navigator.geolocation) return;

  document.getElementById('exploreCountrySelect').innerHTML = '<option>🌍 Detecting location…</option>';

  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;

    let nearest = null, nearestDist = Infinity;
    ALL_CITIES.forEach(city => {
      const d = distKm(latitude, longitude, city.lat, city.lng);
      if (d < nearestDist) { nearestDist = d; nearest = city; }
    });

    exploreNearestCity = nearest;
    exploreActiveCountry = nearest?.country || 'United Kingdom';

    populateExploreCountryDropdown(exploreActiveCountry);
    populateExploreCityDropdown(exploreActiveCountry, nearest?.name);

    if (nearest) {
      document.getElementById('exploreCitySelect').value = nearest.name;
      selectExploreCity(nearest.name, true);
    }
  }, () => {
    populateExploreCountryDropdown('United Kingdom');
    populateExploreCityDropdown('United Kingdom', null);
  }, { timeout: 6000 });
}

function renderExploreCityGrid() {
  // No-op — city grid replaced by dropdown; kept for compatibility
}

function initExplorePage() {
  populateExploreCountryDropdown(exploreActiveCountry);
  populateExploreCityDropdown(exploreActiveCountry, exploreActiveCity);
  if (exploreActiveCity) {
    document.getElementById('exploreCitySelect').value = exploreActiveCity;
    document.getElementById('exploreResults').style.display = 'block';
  }
  detectExploreLocation();
}

// ─── EXPLORE: TRENDING LOGIC ──────────────────────────────────────────────────
function getTrendingBakeriesNearCity(city) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const results = {};

  allItems.forEach(item => {
    const ts = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
    if (!ts || ts < cutoff) return;

    let nearCity = false;
    if (item.bakeryLat) {
      nearCity = distKm(city.lat, city.lng, item.bakeryLat, item.bakeryLng) <= 20;
    } else {
      nearCity = (item.bakeryAddress || '').toLowerCase().includes(city.name.toLowerCase());
    }
    if (!nearCity) return;

    const key = item.bakeryName || 'Unknown';
    if (!results[key]) results[key] = { name: key, address: item.bakeryAddress || '', lat: item.bakeryLat, lng: item.bakeryLng, items: [], totalScore: 0, recentCount: 0 };
    results[key].items.push(item);
    results[key].totalScore += (item.communityAvg || item.overallRating || 0);
    results[key].recentCount++;
  });

  return Object.values(results)
    .map(b => ({
      ...b,
      communityAvg: b.items.length ? b.totalScore / b.items.length : 0,
      topItem: [...b.items].sort((a,b) => (b.communityAvg||b.overallRating||0) - (a.communityAvg||a.overallRating||0))[0]
    }))
    .sort((a, b) => b.recentCount - a.recentCount || b.communityAvg - a.communityAvg);
}

function getCrumbBakeriesNearCity(city) {
  const results = {};
  allItems.forEach(item => {
    if (!item.bakeryName) return;
    let nearCity = false;
    if (item.bakeryLat) {
      nearCity = distKm(city.lat, city.lng, item.bakeryLat, item.bakeryLng) <= 20;
    } else {
      nearCity = (item.bakeryAddress || '').toLowerCase().includes(city.name.toLowerCase());
    }
    if (!nearCity) return;
    const key = item.bakeryName;
    if (!results[key]) results[key] = { name: key, address: item.bakeryAddress || '', lat: item.bakeryLat, lng: item.bakeryLng, items: [], totalScore: 0, dist: item.bakeryLat ? distKm(city.lat, city.lng, item.bakeryLat, item.bakeryLng) : 0 };
    results[key].items.push(item);
    results[key].totalScore += (item.communityAvg || item.overallRating || 0);
  });
  return Object.values(results)
    .map(b => ({ ...b, communityAvg: b.items.length ? b.totalScore / b.items.length : 0, topItem: [...b.items].sort((a,b) => (b.communityAvg||b.overallRating||0) - (a.communityAvg||a.overallRating||0))[0] }))
    .sort((a,b) => b.communityAvg - a.communityAvg);
}

async function selectExploreCity(cityName, isAutoDetected = false) {
  exploreActiveCity = cityName;

  // Look up city across all countries (active country first)
  const countryCities = EXPLORE_COUNTRIES[exploreActiveCountry] || [];
  const city = countryCities.find(c => c.name === cityName) || ALL_CITIES.find(c => c.name === cityName);
  if (!city) return;

  // Update chips
  document.querySelectorAll('.city-chip').forEach(c => {
    const chipName = c.textContent.replace('📍 ','').replace(' 🥐','').trim();
    c.classList.toggle('active', chipName === cityName);
  });

  const resultsEl = document.getElementById('exploreResults');
  resultsEl.style.display = 'block';

  const eyebrow = exploreSortMode === 'trending' ? '🔥 Trending bakeries in' : '⭐ Top bakeries in';
  const nearestLabel = isAutoDetected ? ' (nearest to you)' : '';
  document.getElementById('exploreEyebrow').textContent = eyebrow;
  document.getElementById('exploreTitle').textContent = cityName + nearestLabel;
  document.getElementById('exploreBakeryList').innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div></div>';
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Get Crumbz data
  const crumbBakeries = exploreSortMode === 'trending'
    ? getTrendingBakeriesNearCity(city)
    : getCrumbBakeriesNearCity(city);

  const crumbBanner = document.getElementById('exploreCrumbBanner');
  const crumbBannerText = document.getElementById('exploreCrumbBannerText');
  if (crumbBakeries.length > 0) {
    crumbBanner.style.display = 'flex';
    crumbBannerText.textContent = exploreSortMode === 'trending'
      ? `${crumbBakeries.length} bakeries active in ${cityName} in the last 30 days`
      : `${crumbBakeries.length} bakeries reviewed by the Crumbz community in ${cityName}`;
  } else {
    crumbBanner.style.display = 'none';
  }

  // Google Places (only for top rated; trending shows Crumbz-only)
  let googleResults = [];
  let googleFailed = false;
  if (exploreSortMode === 'top') {
    const cacheKey = cityName;
    if (exploreCache[cacheKey]) {
      googleResults = exploreCache[cacheKey];
    } else {
      try {
        googleResults = await fetchGoogleBakeries(city);
        exploreCache[cacheKey] = googleResults;
      } catch(e) {
        console.warn('Google Places error:', e);
        googleFailed = true;
      }
    }
  }

  renderExploreResults(city, crumbBakeries, googleResults, googleFailed);
}

async function fetchGoogleBakeries(city) {
  if (!GOOGLE_MAPS_KEY) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.websiteUri,places.regularOpeningHours'
    },
    body: JSON.stringify({
      textQuery: `bakery cafe patisserie in ${city.name} ${city.country || ''}`,
      locationBias: {
        circle: { center: { latitude: city.lat, longitude: city.lng }, radius: 8000 }
      },
      maxResultCount: 20
    })
  });
  const data = await res.json();
  return (data.places || [])
    .filter(p => p.rating && p.rating >= 3.5)
    .sort((a, b) => {
      // Score = rating * log(reviews) to balance quality and popularity
      const scoreA = (a.rating || 0) * Math.log10((a.userRatingCount || 1) + 1);
      const scoreB = (b.rating || 0) * Math.log10((b.userRatingCount || 1) + 1);
      return scoreB - scoreA;
    })
    .slice(0, 20);
}

function renderExploreResults(city, crumbBakeries, googleResults, isNearby) {
  const list = document.getElementById('exploreBakeryList');

  // Merge: Crumbz bakeries take priority, then Google fills the rest
  const combined = [];
  const crumbNames = new Set(crumbBakeries.map(b => b.name.toLowerCase()));

  // Add Crumbz bakeries first
  crumbBakeries.forEach(b => combined.push({ ...b, source: 'crumb' }));

  // Add Google results that aren't already in Crumbz
  googleResults.forEach(p => {
    const pName = (p.displayName?.text || '').toLowerCase();
    const alreadyInCrumb = [...crumbNames].some(cn => pName.includes(cn) || cn.includes(pName));
    if (!alreadyInCrumb) {
      combined.push({
        source: 'google',
        name: p.displayName?.text || 'Unknown',
        address: p.formattedAddress || '',
        googleRating: p.rating,
        googleReviews: p.userRatingCount,
        website: p.websiteUri || null,
        placeId: p.id,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      });
    }
  });

  if (!combined.length) {
    const nearbyHint = isNearby ? ' Try a wider radius to see more options.' : '';
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏪</div><div class="empty-state-title">No bakeries found ${isNearby ? 'within this radius' : 'yet'}</div><div class="empty-state-text">Be the first to review a bakery in ${city.name} on Crumbz!${nearbyHint}</div></div>`;
    const countEl = document.getElementById('exploreResultCount');
    if (countEl) countEl.textContent = '';
    exploreLastResults = [];
    if (exploreViewMode === 'map') renderExploreMap([]);
    return;
  }

  const countEl = document.getElementById('exploreResultCount');
  if (countEl) {
    countEl.textContent = isNearby
      ? `${combined.length} bakeries found within this radius`
      : '';
  }

  // Stash the latest result set so the Map view (and re-toggling into it) can
  // use it without needing to re-fetch anything.
  exploreLastResults = combined;
  if (exploreViewMode === 'map') renderExploreMap(combined);

  list.innerHTML = combined.slice(0, 20).map((b, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

    if (b.source === 'crumb') {
      // Crumbz-reviewed bakery
      const avg = b.communityAvg.toFixed(1);
      const topItem = b.topItem;
      const topItemHTML = topItem ? `
        <div class="explore-top-item" data-onclick="closeMobileMenu,openBakeryProfile" data-args='${dataArgs([b.name])}'>
          ${topItem.photoURL ? `<img src="${topItem.photoURL}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;" alt="">` : `<span style="font-size:1.2rem;">${getCategoryDisplay(topItem).emoji}</span>`}
          <div>
            <div class="explore-top-item-label">Best rated item</div>
            <div class="explore-top-item-name">${topItem.name || 'Unknown'}</div>
          </div>
          <div class="explore-top-item-score">${(topItem.communityAvg || topItem.overallRating || 0).toFixed(1)}</div>
        </div>` : '';
      return `
        <div class="explore-bakery-card">
          <div class="explore-bakery-header">
            <div class="explore-rank ${rankClass}">${rank}</div>
            <div class="explore-bakery-info">
              <div class="explore-bakery-name">${b.name}</div>
              <div class="explore-bakery-address">📍 ${b.address}</div>
              <div class="explore-bakery-meta">
                <span class="explore-score-badge crumb">🥐 ${avg} Crumbz</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${b.items.length} review${b.items.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${currentUser ? `<button class="bookmark-btn${isBookmarked(b.name) ? ' saved' : ''}" data-onclick="toggleBookmark" data-args='${dataArgs([b.name, b.address || ''])}' title="Save bakery">🔖</button>` : ''}
              <button class="admin-btn primary" data-onclick="openBakeryProfile" data-args='${dataArgs([b.name])}' style="font-size:0.78rem;">View →</button>
            </div>
          </div>
          ${topItemHTML}
        </div>`;
    } else {
      // Google-sourced bakery — not yet reviewed on Crumbz
      const stars = '★'.repeat(Math.round(b.googleRating || 0));
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + ' ' + (b.address || ''))}&query_place_id=${b.placeId}`;
      // Matches the old hand-built onclick="...openBakeryProfile(name,'',{...})"
      // JS-object-literal source field-for-field: address/placeId always a
      // string (placeId defaults to '', not null — openBakeryProfile's own
      // `googleData.placeId || null` normalizes that further downstream, so
      // either default behaves identically once it gets there), lat/lng/
      // googleRating/googleReviews all number-or-null.
      const googleData = {
        address: b.address || '',
        placeId: b.placeId || '',
        lat: b.lat || null,
        lng: b.lng || null,
        googleRating: b.googleRating || null,
        googleReviews: b.googleReviews || null,
      };
      return `
        <div class="explore-bakery-card">
          <div class="explore-bakery-header">
            <div class="explore-rank ${rankClass}">${rank}</div>
            <div class="explore-bakery-info">
              <div class="explore-bakery-name">${b.name}</div>
              <div class="explore-bakery-address">📍 ${b.address}</div>
              <div class="explore-bakery-meta">
                <span class="explore-score-badge google">★ ${b.googleRating} Google</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${b.googleReviews?.toLocaleString() || '?'} reviews</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
              ${currentUser ? `<button class="bookmark-btn${isBookmarked(b.name) ? ' saved' : ''}" data-onclick="toggleBookmark" data-args='${dataArgs([b.name, b.address || ''])}' title="Save bakery">🔖</button>` : ''}
              <button class="admin-btn primary" data-onclick="openBakeryProfile" data-args='${dataArgs([b.name, '', googleData])}' style="font-size:0.78rem;">View →</button>
            </div>
          </div>
          <div class="explore-no-crumb">
            <span>Not yet reviewed on Crumbz</span>
            <button class="admin-btn primary" style="font-size:0.75rem;" data-onclick="openAddModalForBakery" data-args='${dataArgs([b.name, b.address, b.placeId || '', b.lat || '', b.lng || ''])}'>+ Be first to review</button>
          </div>
        </div>`;
    }
  }).join('');
}

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
// saveEdit/deleteReview stay here, still deferred — see CLAUDE.md's own
// callout for why and when to revisit (step 29, a separate trigger).

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

// Edit Review modal. saveEdit/deleteReview's onclick= call sites are in
// index.html (the modal's static footer buttons), not here.
// updateDimDisplay/updateEditSubCategory/closeEditModal/clearEditPhoto/
// handleEditPhoto registered from src/components/editReviewModal.js now
// (Phase 2 step 9 / Phase 4 step 18); saveEdit/deleteReview stay
// registered here — deferred, see CLAUDE.md.
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
// moved to src/components/reactions.js (2026-08-24, Phase 2 step 8) —
// buildReactionBarInner/loadReactionsForItems imported above (called from
// feedCardHTML, still in this file).

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
// Phase 0 step 3c) — imported above. isBookmarked moved there too
// (2026-08-25, Phase 5 step 21) — a trivial derived-state helper, same
// treatment as isAdmin/isBusiness/ownsBakery; see appState.js's own
// comment for why it went there instead of bakeryModal.js. toggleBookmark
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
let poActiveCountry = 'United Kingdom';
let poActiveCity = null;
let poUserCoords = null;
let poNearestCity = null;

function initPreorderPage() {
  // Determine user's country — profile setting takes priority, then geolocation, then UK
  const profileCountry = allProfiles[currentUser?.uid]?.country || '';
  const detectedCountry = poNearestCity?.country || '';
  const country = profileCountry || detectedCountry || 'United Kingdom';
  poActiveCountry = country;

  // Country display (read-only — locked to home country)
  const countryDisplay = document.getElementById('poCountrySelect');
  if (countryDisplay) {
    countryDisplay.innerHTML = `<option value="${country}">${country}</option>`;
    countryDisplay.disabled = true;
    countryDisplay.title = 'Showing pre-orders in your home country. Update in Settings → Profile.';
  }

  populatePoCityDropdown(poActiveCountry, poActiveCity);
  if (poActiveCity) renderPreorderPage();

  // Auto-detect nearest city if not yet done
  if (!poNearestCity) poDetectNearest();
}

function onPoCountryChange() {
  // No-op — country is locked to user's home country
}

function onPoCityChange() {
  poActiveCity = document.getElementById('poCitySelect').value;
  if (poActiveCity) renderPreorderPage();
}

function populatePoCityDropdown(country, selectedCity) {
  const sel = document.getElementById('poCitySelect');
  if (!sel) return;
  const cities = (EXPLORE_COUNTRIES[country] || []).slice().sort((a,b) => a.name.localeCompare(b.name));
  const nearestName = poNearestCity?.country === country ? poNearestCity?.name : null;
  sel.innerHTML = '<option value="">Select a city…</option>' +
    cities.map(c => {
      const label = c.name === nearestName ? `📍 ${c.name} (nearest)` : c.name;
      return `<option value="${c.name}" ${c.name === selectedCity ? 'selected' : ''}>${label}</option>`;
    }).join('');
  if (selectedCity) sel.value = selectedCity;
}

function poDetectNearest() {
  const btn = document.getElementById('poNearestBtn');
  if (btn) { btn.disabled = true; btn.textContent = '📍 Detecting…'; }
  navigator.geolocation?.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    poUserCoords = { lat: latitude, lng: longitude };
    const countryCities = EXPLORE_COUNTRIES[poActiveCountry] || [];
    let nearest = null, nearestDist = Infinity;
    (countryCities.length ? countryCities : ALL_CITIES).forEach(city => {
      const d = distKm(latitude, longitude, city.lat, city.lng);
      if (d < nearestDist) { nearestDist = d; nearest = city; }
    });
    poNearestCity = nearest ? { ...nearest, country: poActiveCountry } : null;
    poActiveCity = nearest?.name || null;
    populatePoCityDropdown(poActiveCountry, poActiveCity);
    if (btn) { btn.disabled = false; btn.textContent = '📍 Nearest'; }
    if (poActiveCity) {
      showToast(`📍 Nearest: ${poActiveCity}`);
      renderPreorderPage();
    } else {
      showToast('Could not find a nearby city');
    }
  }, () => {
    if (btn) { btn.disabled = false; btn.textContent = '📍 Nearest'; }
    showToast('Location access denied');
  }, { timeout: 6000 });
}


async function renderPreorderPage() {
  if (!fb) return;
  const results = document.getElementById('preorderPageResults');
  const city = poActiveCity;
  if (!city) return;

  results.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto 12px;"></div><div style="font-size:0.82rem;color:var(--text-muted);">Finding pre-orders near ' + city + '…</div></div>';

  const { db, collection, query, where, getDocs } = fb;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  try {
    // Find bakeries in this city by matching address
    const cityObj = ALL_CITIES.find(c => c.name === city && c.country === poActiveCountry)
      || ALL_CITIES.find(c => c.name === city);

    // Get all active offerings (filter by city/bakery client-side)
    const snap = await getDocs(query(collection(db, 'preorderOfferings'), where('active','==',true)));
    let offerings = snap.docs.map(d => ({id:d.id,...d.data()}))
      .filter(o => {
        if (o.collectDate < todayStr) return false;
        // Go-live check
        const goLive = o.goLiveAt ? new Date(o.goLiveAt) : (() => {
          const d = new Date(o.collectDate + 'T00:00:00');
          d.setDate(d.getDate()-1); d.setHours(8,0,0,0); return d;
        })();
        return now >= goLive;
      });

    // Filter by city using Crumbz item data for that bakery
    const bakeriesInCity = new Set(
      allItems
        .filter(item => {
          const itemCity = extractCity(item.bakeryAddress || '');
          return itemCity.toLowerCase() === city.toLowerCase();
        })
        .map(i => i.bakeryName)
    );

    // Also try matching by bakeryName against Explore city data if no address match
    offerings = offerings.filter(o => bakeriesInCity.has(o.bakeryName) || offerings.length < 5);

    // If we got no city-matched offerings, fall back to showing all for now
    // with a message — bakeries without Crumbz reviews won't match by address
    const bakeryFilter = document.getElementById('poBakeryFilter')?.value || '';
    if (bakeryFilter) offerings = offerings.filter(o => o.bakeryName === bakeryFilter);

    // Populate bakery filter dropdown
    const bakeryNames = [...new Set(offerings.map(o => o.bakeryName).filter(Boolean))].sort();
    const poBakeryFilter = document.getElementById('poBakeryFilter');
    if (poBakeryFilter) {
      const current = poBakeryFilter.value;
      poBakeryFilter.innerHTML = '<option value="">🏪 All bakeries</option>' +
        bakeryNames.map(n => `<option value="${n}" ${n===current?'selected':''}>${n}</option>`).join('');
    }

    // Sort
    const sort = document.getElementById('poSortFilter')?.value || 'slot';
    if (sort === 'slot') offerings.sort((a,b) => (a.collectDate+a.slot).localeCompare(b.collectDate+b.slot));
    else if (sort === 'bakery') offerings.sort((a,b) => (a.bakeryName||'').localeCompare(b.bakeryName||''));
    else if (sort === 'price_asc') offerings.sort((a,b) => (a.price||0)-(b.price||0));
    else if (sort === 'price_desc') offerings.sort((a,b) => (b.price||0)-(a.price||0));

    if (!offerings.length) {
      results.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🗓️</div>
        <div class="empty-state-title">No pre-orders in ${city} yet</div>
        <div class="empty-state-text">Check back later — bakeries update their listings daily.</div>
      </div>`;
      return;
    }

    // Group by date then bakery
    const byDate = {};
    offerings.forEach(o => {
      if (!byDate[o.collectDate]) byDate[o.collectDate] = {};
      if (!byDate[o.collectDate][o.bakeryName]) byDate[o.collectDate][o.bakeryName] = [];
      byDate[o.collectDate][o.bakeryName].push(o);
    });

    results.innerHTML = `
      <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;">${offerings.length} item${offerings.length!==1?'s':''} available in ${city}</div>
      ${Object.entries(byDate).map(([date, bakeries]) => {
        const dateLabel = new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
        return `<div style="margin-bottom:28px;">
          <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:var(--espresso);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--border);">Collection: ${dateLabel}</div>
          ${Object.entries(bakeries).map(([bakeryName, items]) => `
            <div style="margin-bottom:20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="font-size:0.88rem;font-weight:600;color:var(--caramel);cursor:pointer;" data-onclick="closeBakeryModalIfOpen,openBakeryProfile" data-args='${dataArgs([bakeryName])}'>🏪 ${bakeryName} ↗</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${items.length} item${items.length!==1?'s':''}</div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
                ${items.map(o => {
                  const remaining = o.remaining ?? o.quantity ?? 0;
                  const soldOut = remaining <= 0;
                  return `<div class="preorder-card">
                    ${o.photoURL ? `<img src="${o.photoURL}" class="preorder-img" alt="${o.name}">` : `<div class="preorder-img">🥐</div>`}
                    <div class="preorder-body">
                      <div class="preorder-name">${o.name}</div>
                      ${o.description ? `<div class="preorder-desc">${o.description}</div>` : ''}
                      <div class="preorder-meta">
                        <span class="preorder-slot">🕐 ${o.slot}</span>
                        <span class="preorder-qty${remaining<=2&&!soldOut?' low':''}">${soldOut?'Sold out':`${remaining} left`}</span>
                      </div>
                      <div style="display:flex;align-items:center;justify-content:space-between;">
                        <span class="preorder-price">£${parseFloat(o.price||0).toFixed(2)}</span>
                        ${soldOut
                          ? `<button class="btn-ghost" disabled style="opacity:0.4;font-size:0.78rem;">Sold out</button>`
                          : currentUser
                            ? `<button class="btn-espresso" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openReserveModal" data-args='${dataArgs([o.id, o.bakeryName, o.name, o.slot, o.collectDate, remaining||0, o.maxPerPerson||2])}'>Reserve</button>`
                            : `<button class="btn-espresso" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openAuthModal">Sign in</button>`}
                      </div>
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>`;
      }).join('')}`;
  } catch(e) {
    results.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load pre-orders.</div>';
    console.error(e);
  }
}

function closeBakeryModalIfOpen() {
  document.getElementById('bakeryModal')?.classList.remove('open');
}

// ─── MY PRE-ORDERS (burger menu) ─────────────────────────────────────────────
let myPendingPreorders = [];

// Registered below (not a click action — src/components/bakeryModal.js's
// reserveOffering calls it via getAction('loadMyPreorders')() instead of a
// forbidden direct import, since reserveOffering itself had to move this
// step and this function couldn't move with it — Phase 7 step 31's own
// future cluster; Phase 4 step 18's modalNext/saveReview precedent, reused
// here — see bakeryModal.js's own header comment).
async function loadMyPreorders() {
  if (!currentUser || !fb) return;
  const { db, collection, query, where, getDocs } = fb;
  try {
    const snap = await getDocs(query(
      collection(db, 'reservations'),
      where('userId', '==', currentUser.uid),
      where('status', '==', 'pending')
    ));
    myPendingPreorders = snap.docs.map(d => ({id: d.id, ...d.data()}))
      .filter(r => r.collectDate >= new Date().toISOString().split('T')[0])
      .sort((a,b) => a.collectDate.localeCompare(b.collectDate));
    updatePreorderBadge();
  } catch(e) { console.warn('Preorders load error:', e); }
}

registerActions({ loadMyPreorders });

function updatePreorderBadge() {
  const count = myPendingPreorders.length;
  const hamburgerBadge = document.getElementById('hamburgerPreorderBadge');
  const menuBadge = document.getElementById('mobilePreordersBadge');
  const menuBtn = document.getElementById('mobilePreordersBtn');

  if (hamburgerBadge) {
    hamburgerBadge.textContent = count > 9 ? '9+' : count;
    hamburgerBadge.style.display = count > 0 ? 'flex' : 'none';
  }
  if (menuBadge) {
    menuBadge.textContent = count;
    menuBadge.style.display = count > 0 ? 'inline' : 'none';
  }
  if (menuBtn) menuBtn.style.display = currentUser ? '' : 'none';
}

function openMyPreordersSheet() {
  if (!currentUser) { openAuthModal(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'myPreordersSheet';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';

  const rows = myPendingPreorders.length ? myPendingPreorders.map(r => {
    const collectDate = new Date(r.collectDate + 'T12:00:00').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
    const ref = r.id.slice(-6).toUpperCase();
    const qty = r.quantity > 1 ? `${r.quantity}× ` : '';
    const daysUntil = Math.ceil((new Date(r.collectDate) - new Date()) / (1000*60*60*24));
    const urgency = daysUntil === 0 ? '🔴 Today!' : daysUntil === 1 ? '🟡 Tomorrow' : `🟢 ${daysUntil} days`;
    return `
      <div style="padding:14px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px;">
          <div>
            <div style="font-size:0.92rem;font-weight:700;color:var(--espresso);">${qty}${r.offeringName}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">📍 ${r.bakeryName}</div>
          </div>
          <span style="font-size:0.7rem;font-weight:600;white-space:nowrap;">${urgency}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:0.78rem;color:var(--caramel);font-weight:600;">🕐 ${r.slot}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">${collectDate} · Ref: <strong>${ref}</strong></div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">Pay in store · £${parseFloat(r.totalPrice || r.price || 0).toFixed(2)}</div>
          </div>
          <div id="miniQR_${r.id}" style="width:52px;height:52px;flex-shrink:0;"></div>
        </div>
      </div>`;
  }).join('') : `<div class="empty-state" style="padding:24px 0;">
    <div class="empty-state-icon">🗓️</div>
    <div class="empty-state-title">No upcoming pre-orders</div>
    <div class="empty-state-text">Browse the Pre-order page to reserve tomorrow's bakes.</div>
  </div>`;

  overlay.innerHTML = `
    <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--espresso);">🗓️ My pre-orders</div>
          ${myPendingPreorders.length ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${myPendingPreorders.length} upcoming reservation${myPendingPreorders.length !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <button data-onclick="closeMyPreordersSheet" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding:0 20px 24px;">${rows}</div>
      ${myPendingPreorders.length ? `
        <div style="padding:12px 20px 28px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:10px;">
          <button class="btn-ghost" style="flex:1;" data-onclick="closeMyPreordersSheet,showPage" data-args='${dataArgs(['preorders'])}'>Browse more</button>
          <button class="btn-espresso" style="flex:1;" data-onclick="viewOrdersFromMyPreordersSheet">View all orders</button>
        </div>` : `
        <div style="padding:12px 20px 28px;border-top:1px solid var(--border);flex-shrink:0;">
          <button class="btn-espresso" style="width:100%;" data-onclick="closeMyPreordersSheet,showPage" data-args='${dataArgs(['preorders'])}'>Browse pre-orders</button>
        </div>`}
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Generate mini QR codes
  requestAnimationFrame(() => {
    myPendingPreorders.forEach(r => {
      const el = document.getElementById(`miniQR_${r.id}`);
      if (el && window.QRCode) {
        try {
          new QRCode(el, {
            text: `crumbz:reservation:${r.id}`,
            width: 52, height: 52,
            colorDark: '#2c1810', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
          });
        } catch(e) {
          el.innerHTML = `<div style="font-size:0.5rem;font-family:monospace;font-weight:700;color:#2c1810;text-align:center;line-height:1.3;">${r.id.slice(-6).toUpperCase()}</div>`;
        }
      }
    });
  });
}

function closeMyPreordersSheet() {
  document.getElementById('myPreordersSheet')?.remove();
}

// The "View all orders" action chains a promise (switchProfileTab only once
// openProfileModal's data has loaded) rather than the plain "cleanup, then
// one call" shape delegate.js handles natively, so it needs this small named
// wrapper instead of a comma-list data-onclick.
function viewOrdersFromMyPreordersSheet() {
  closeMyPreordersSheet();
  openProfileModal(currentUser.uid).then(() => switchProfileTab('orders', currentUser.uid));
}

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

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
let notifLastSeen = null; // timestamp of last time user opened panel
let notifItems = [];      // cached notification objects

async function loadNotifications() {
  if (!currentUser || !fb) return;
  const { db, collection, query, where, orderBy, getDocs, getDoc, doc } = fb;

  // Load last-seen timestamp from profile
  try {
    const profileSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
    notifLastSeen = profileSnap.data()?.notifLastSeen?.toDate() || null;
  } catch(e) { notifLastSeen = null; }

  const notifications = [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

  // 1. New followers
  try {
    const followsSnap = await getDocs(
      query(collection(db, 'follows'), where('followingId', '==', currentUser.uid))
    );
    followsSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.createdAt?.toDate();
      if (!ts || ts < cutoff) return;
      notifications.push({
        id: d.id,
        type: 'follow',
        actorId: data.followerId,
        actorName: data.followerName || 'Someone',
        actorPhoto: data.followerPhoto || null,
        text: `started following you`,
        ts,
        unread: !notifLastSeen || ts > notifLastSeen,
        onClick: () => openProfileModal(data.followerId)
      });
    });
  } catch(e) { console.warn('Notif follows error:', e); }

  // 2. Reactions on my items
  try {
    const reactSnap = await getDocs(
      query(collection(db, 'reactions'), where('targetUserId', '==', currentUser.uid))
    );
    reactSnap.docs.forEach(d => {
      const data = d.data();
      if (data.userId === currentUser.uid) return; // skip own reactions
      const ts = data.createdAt?.toDate();
      if (!ts || ts < cutoff) return;
      notifications.push({
        id: d.id,
        type: 'reaction',
        actorId: data.userId,
        actorName: data.userName || 'Someone',
        actorPhoto: data.userPhoto || null,
        emoji: data.emoji,
        itemName: data.itemName || 'your review',
        text: `reacted ${data.emoji} to <em>${data.itemName || 'your review'}</em>`,
        ts,
        unread: !notifLastSeen || ts > notifLastSeen,
        onClick: () => { /* could open item detail */ }
      });
    });
  } catch(e) { console.warn('Notif reactions error:', e); }

  // 3. Shared reviews
  try {
    const shareSnap = await getDocs(
      query(collection(db, 'sharedReviews'), where('toUserId', '==', currentUser.uid))
    );
    shareSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.createdAt?.toDate();
      if (!ts || ts < cutoff) return;
      notifications.push({
        id: d.id,
        type: 'shared',
        actorId: data.fromUserId,
        actorName: data.fromUserName || 'Someone',
        actorPhoto: data.fromUserPhoto || null,
        itemName: data.itemName || 'a review',
        text: `shared <em>${data.itemName || 'a review'}</em> from ${data.bakeryName || 'a bakery'} with you`,
        ts,
        unread: !notifLastSeen || ts > notifLastSeen,
        onClick: () => openDetail(data.itemId)
      });
    });
  } catch(e) { console.warn('Notif shared reviews error:', e); }

  // Sort newest first
  notifications.sort((a, b) => b.ts - a.ts);
  notifItems = notifications;

  const unreadCount = notifications.filter(n => n.unread).length;
  updateBellBadge(unreadCount);
}

function updateBellBadge(count) {
  const badge = document.getElementById('navBellBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  const backdrop = document.getElementById('notifBackdrop');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    closeNotifPanel();
  } else {
    // Always fetch the latest notifications when opening — don't rely on
    // whatever was cached at login, since shares/reactions have no live push.
    loadNotifications().then(renderNotifPanel);
    renderNotifPanel(); // show cached data immediately while the refresh runs
    panel.classList.add('open');
    backdrop.style.display = 'block';
    // Mark as seen after a short delay
    setTimeout(() => markAllNotifsRead(), 1500);
  }
}

function closeNotifPanel() {
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('notifBackdrop').style.display = 'none';
}

function renderNotifPanel() {
  const list = document.getElementById('notifList');
  if (!notifItems.length) {
    list.innerHTML = `<div class="notif-empty"><div class="notif-empty-icon">🔔</div>No notifications yet</div>`;
    return;
  }
  list.innerHTML = notifItems.map((n, i) => {
    const avatarHTML = n.type === 'reaction'
      ? `<div class="notif-emoji">${n.emoji}</div>`
      : n.actorPhoto
        ? `<div class="notif-avatar"><img src="${n.actorPhoto}" alt=""></div>`
        : `<div class="notif-avatar">${(n.actorName || '?').charAt(0).toUpperCase()}</div>`;
    return `
      <div class="notif-item ${n.unread ? 'unread' : ''}" data-onclick="closeNotifPanel,openNotifItem" data-args='${dataArgs([i])}'>
        ${avatarHTML}
        <div class="notif-body">
          <div class="notif-text"><strong>${escJS(n.actorName)}</strong> ${n.text}</div>
          <div class="notif-time">${timeAgo(n.ts)}</div>
        </div>
      </div>`;
  }).join('');
}

// Each notification carries its own ad-hoc onClick closure (see
// loadNotifications) rather than a single named action, so this thin,
// index-based wrapper is what's registered — it looks the closure up from
// module-scope notifItems and invokes it, instead of the old raw
// onclick="notifItems[i].onClick()", which broke post-modularization for the
// same reason as the avatar dropdown: notifItems is a plain module-level
// `let`, invisible to inline onclick="..." attributes (global scope) — it
// was never in WINDOW EXPORTS, only functions are.
function openNotifItem(i) {
  notifItems[i]?.onClick?.();
}

async function markAllNotifsRead() {
  if (!currentUser || !fb) return;
  const { db, doc, updateDoc, serverTimestamp } = fb;
  notifItems.forEach(n => n.unread = false);
  updateBellBadge(0);
  // Persist last-seen timestamp to profile
  try {
    await updateDoc(doc(db, 'profiles', currentUser.uid), { notifLastSeen: serverTimestamp() });
    notifLastSeen = new Date();
  } catch(e) { console.warn('Could not save notif seen time:', e); }
}

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

// showPage still has a real raw call site (index.html's profileEditBtn,
// SETTINGS cluster) so it stays in WINDOW EXPORTS — see its own note there.
// toggleUserMenu/toggleMobileMenu/closeAvatarDropdown/signOutFromAvatarMenu
// registered from src/components/nav.js now (Phase 1 step 5) instead of here.
registerActions({ showPage });

// Notifications panel item click. openNotifItem is new — replaces the raw
// onclick="notifItems[i].onClick()", broken the same way (notifItems is a
// bare module-scope array) — see openNotifItem's own comment for why a thin
// index-based wrapper was the fix instead of a bigger redesign.
registerActions({ openNotifItem });

// Auth modal (openAuthModal/closeAuthModal/switchAuthTab/signInGoogle/
// signInEmail/signUpEmail) registered from src/components/authModal.js now
// (Phase 1 step 6) instead of here. openAuthModal/closeAuthModal still have
// many plain-JS call sites elsewhere in this file (e.g.
// `if (!currentUser) { openAuthModal(); return; }`, the keydown Escape
// listener above) — those are ordinary imported-function calls now, not
// markup-driven, so they need no registration of their own.

// Mobile menu. openMyPreordersSheet/openFeatureRequestModal are each also
// named directly in comma-chained data-onclick lists (zero-arg,
// synchronous, no delay) — see delegate.js. closeMobileMenu/
// signOutFromMobileMenu registered from src/components/nav.js now (Phase 1
// step 5), triggerPwaInstall from src/app/lifecycle.js now (Phase 1 step
// 7) — navigateFromMobileMenu/openMyProfileFromMobileMenu (staying here,
// see nav.js's own header comment) still call closeMobileMenu() as a plain
// imported function, not through the registry.
registerActions({
  navigateFromMobileMenu, openMyProfileFromMobileMenu,
  openMyPreordersSheet, openFeatureRequestModal,
});

// Feature requests — the general submit flow only; toggleFeatureVote/
// deleteFeatureRequest/updateFeatureStatus register from
// src/components/adminPanel.js now (Phase 6 step 23).
registerActions({ submitFeatureRequest });

// Bakeries page. renderBakeries stays in WINDOW EXPORTS — the location
// filter's onchange is converted, but renderBakeries is also called from
// plenty of plain JS elsewhere. openBakeryProfile registers from
// src/components/bakeryModal.js now (Phase 5 step 21) — this comment's
// earlier "~25 call sites... stays in WINDOW EXPORTS" claim predates the
// handler delegation migration's completion (every one of those call
// sites is now a delegated data-onclick, not a raw handler, so the global
// registry resolves it regardless of which file registers it). toggleBookmark
// registers from src/components/profileModal.js now (Phase 5 step 22).
registerActions({ setBakeryView, renderBakeries });

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
// renderPreorderPage/closeBakeryModalIfOpen had no call sites anywhere else
// in the file, so they've been removed from WINDOW EXPORTS entirely.
// openReserveModal registers from src/components/bakeryModal.js now (Phase
// 5 step 21) — renderPreorderPage's own registration here is also what
// bakeryModal.js's reserveOffering now reaches via
// getAction('renderPreorderPage')(), see that file's own header comment.
registerActions({
  onPoCountryChange, onPoCityChange, poDetectNearest, renderPreorderPage,
  closeBakeryModalIfOpen,
});

// My pre-orders sheet (burger menu). closeMyPreordersSheet and
// viewOrdersFromMyPreordersSheet are both new — neither needs WINDOW
// EXPORTS since they have no call sites outside this sheet's own markup.
registerActions({ closeMyPreordersSheet, viewOrdersFromMyPreordersSheet });

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

// Explore page. closeExploreMapPopup is new — replaces passing a closure
// through data-args, which can't serialize a function, with the same
// comma-list "cleanup step, then one parameterized action" shape used
// everywhere else.
// hideExploreResults is a new one-line wrapper for a handler that was
// previously raw inline JS with no named function at all. The temporary
// EXPLORE MAP DIAGNOSTICS debug panel (exploreMapLog) isn't handler-driven —
// it's a plain internal function, unrelated to this migration.
registerActions({
  onExploreCountryChange, onExploreCityChange, onExploreSortChange,
  toggleExploreNearby, onExploreRadiusChange, hideExploreResults,
  setExploreViewMode, closeExploreMapPopup,
});

// Leaderboard. switchLbTab's signature was reordered (tab, btn) — it had no
// call sites other than its own onclick="switchLbTab(this,'x')" attributes,
// so its parameter order could just follow the trailing-element convention
// instead of needing a wrapper. The two filter <select>s' onchange are now
// converted too (see onchange/oninput delegation, below).
// openDetail registers from src/components/itemDetailModal.js now (Phase 5
// step 19) instead of here, so the leaderboard row's conditional action
// still resolves via the delegated data-onclick registry.
registerActions({ switchLbMode, switchLbTab, closeLbAndOpenBakery, onLbFilterChange });

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

// Notifications panel. Each notif-item's click is now converted too — see
// openNotifItem, registered further up alongside the avatar-dropdown bug fix.
registerActions({ toggleNotifPanel, closeNotifPanel, markAllNotifsRead });

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
  deactivateExploreNearby,
  detectExploreLocation,
  distKmUser,
  exploreMapLog,
  fetchGoogleBakeries,
  fetchGoogleBakeriesNearPoint,
  geocodeMissingBakeries,
  getCrumbBakeriesNearCity,
  getCrumbBakeriesNearPoint,
  getLbFilters,
  getTrendingBakeriesNearCity,
  handleBakeryPhoto,
  handleSettingsPhoto,
  initExplorePage,
  initPreorderPage,
  loadNotifications,
  openAddModal,
  openSettingsPage,
  populateBakeryLocationFilter,
  populateExploreCityDropdown,
  populateExploreCountryDropdown,
  populateLbLocationFilter,
  populatePoCityDropdown,
  processScannedReservation,
  refreshFollowButtons,
  renderBakeryLeaderboard,
  renderExploreCityGrid,
  renderExploreMap,
  renderExploreResults,
  renderLeaderboard,
  renderManageShop,
  renderNotifPanel,
  renderRecentGrid,
  runExploreNearbySearch,
  saveBakeryProfile,
  saveSettingsProfile,
  selectExploreCity,
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
  switchLbTab,
  updateBellBadge,
  updateOverallRating,
  updatePreorderBadge,
  updateStats,
});
