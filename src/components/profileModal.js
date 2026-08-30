// ─── PROFILE MODAL ──────────────────────────────────────────────────────────
// Extracted from src/legacy-app.js (2026-08-26, Phase 5 step 22). Closes out
// Phase 5. The user profile modal — hero/stats/reviews (own rendering, the
// literal last code under legacy-app.js's old "FILTER HELPERS" header, which
// is now fully empty of code — see that header's own updated comment) plus
// every one of its tabs: Followers/Following (inline here), Orders
// (renderOrdersTab, imported from reservations.js), Saved (renderSavedTab,
// moved here this step), Activity (the whole Activity Calendar cluster,
// brought in below), and My Map (the whole Dining Map cluster, also brought
// in below) — plus the Bookmarks feature (toggleBookmark) that Saved tab
// needs to function.
//
// This step resolves the largest backlog of deferred items in the whole
// plan — five separate earlier steps each left something behind specifically
// because it depended on the Profile modal's own not-yet-extracted state
// (profileModalUid/profileActiveCatFilter/profileActiveLocFilter) or
// openProfileModal()/switchProfileTab() themselves. Each is resolved
// explicitly below, not assumed just because this file now exists:
//
// - closeDetailAndOpenProfile (deferred at step 19, itemDetailModal.js) —
//   moved wholesale. It only ever needed openProfileModal (now local) and
//   closeDetailModal, imported one-way from itemDetailModal.js — verified
//   itemDetailModal.js imports nothing from here, so no cycle.
// - renderSavedTab/removeBookmarkAndRefreshSaved (deferred at step 20,
//   shareReviewModal.js) — both moved wholesale, per that step's own header
//   comment identifying them as genuinely Profile-modal internals that only
//   shared a file section with Share Review by position, not topic.
// - openProfileIfSignedIn (deferred at step 12, reviewCard.js) — moved
//   wholesale. Its data-onclick="openProfileIfSignedIn" references inside
//   cardHTML/feedCardHTML markup (reviewCard.js) keep resolving fine via the
//   global registerActions() registry regardless of which file registers it.
// - openProfileModal/closeProfileModal/switchProfileTab themselves
//   (referenced as the blocker in follows.js step 14, people.js step 15,
//   reviewCard.js step 12, itemDetailModal.js step 19, shareReviewModal.js
//   step 20, reservations.js step 16, nav.js step 5) — all three moved
//   wholesale.
//
// A fifth, narrower deferral resolved as a direct consequence of the above,
// surfaced during this step's own dependency read rather than pre-flagged in
// CLAUDE.md: follows.js's step-14 header comment named a *pair* —
// followAndRefreshProfile/refreshOpenProfile — as both waiting for this
// step. Only refreshOpenProfile actually belongs here: it reads
// profileModalUid/profileActiveCatFilter/profileActiveLocFilter (now local
// state) and calls openProfileModal (now local) — a clean wholesale move,
// exported since legacy-app.js's own followAndRefreshProfile needs it
// imported back. followAndRefreshProfile itself could NOT move too, despite
// being the pair's other half: it also calls toggleFollow(), which stays in
// legacy-app.js (follows.js's own step-14/15 reasoning — toggleFollow calls
// refreshFollowButtons, which calls renderPeople(), still local to
// legacy-app.js). Moving followAndRefreshProfile here would have meant this
// file importing toggleFollow back from legacy-app.js — the forbidden
// direction, since legacy-app.js already needs openProfileModal/
// closeProfileModal/switchProfileTab/refreshOpenProfile imported the normal
// way. followAndRefreshProfile stays behind as a genuine one-function
// leftover of that pair, not an oversight.
//
// A second new dependency, also found only by reading (not pre-flagged
// anywhere) rather than assumed from removeBookmarkAndRefreshSaved's own
// name: it calls toggleBookmark(), which had never been claimed by any step
// and was still sitting in legacy-app.js's own "BOOKMARKS" section. A fresh
// grep for every real (non-markup) call site of toggleBookmark found exactly
// one: removeBookmarkAndRefreshSaved, moving this same step. Its other two
// "callers" (bakeryModal.js's bookmark button, and renderBakeries — in
// legacy-app.js then, src/pages/bakeries.js since Phase 7 step 26) are both
// data-onclick="toggleBookmark"
// markup strings, resolved via the global registerActions() registry
// regardless of which file registers the action — no import needed for
// either. So toggleBookmark moved here too, alongside its sole real caller,
// the same "small self-contained function moves with its only caller"
// reasoning as step 19's isSavedItem and step 15's computeUserScore.
//
// Activity Calendar (renderActivityTab/renderCalendar/calNav/onCalDayClick/
// closeCalDayModal + calViewYear/calViewMonth/calUid, module-private) and
// Dining Map (renderDiningMapTab/switchDmTab/renderDmStats/renderDmStatRows/
// buildBakeryCoords/loadLeafletThenMap + diningMapInstance, module-private;
// geocodeBakeryAddress moved out to src/services/places.js at Phase 7
// step 29, now shared with explore.js's map) were never named as their own
// steps in
// CLAUDE.md's 32-step list — confirmed by reading, not assumed from that
// omission, that both are genuinely Profile-modal-tab-only: each cluster's
// only caller anywhere in the codebase is switchProfileTab's own 'activity'/
// 'map' branches, respectively (verified via a full-file grep before moving
// either). Brought in here rather than left as a future standalone module,
// matching this file's own role as the last and largest of Phase 5's
// composite modals.
//
// Every dependency this file needs already has a real importable home —
// unlike step 18 (addReviewModal.js) and step 21 (bakeryModal.js), nothing
// here required the getAction() action-registry workaround for a genuinely
// blocked cross-cluster call. buildCategoryFilterBar/openBakeryProfile
// import one-way from bakeryModal.js (confirmed it imports nothing from
// here — no cycle), computeCountryRank one-way from pages/people.js
// (confirmed no cycle there either), followBtnHTML/getFollowersForUser/
// getFollowingForUser/buildFollowUserRowHTML one-way from follows.js, and
// renderOrdersTab one-way from reservations.js — all ordinary leaf-to-leaf
// imports, the same shape as qrCode.js importing markCollected from
// manageOfferingsModal.js.
//
// Export policy follows bakeryModal.js's precedent (the immediately
// preceding step, itself a large composite module), not
// manageOfferingsModal.js's "export everything uniformly": only
// openProfileModal/closeProfileModal/switchProfileTab/refreshOpenProfile are
// exported, since legacy-app.js's own leftover functions (
// openMyProfileFromMobileMenu, followAndRefreshProfile,
// viewOrdersFromMyPreordersSheet, loadNotifications, the #profileModal
// outside-click listener, the keydown Escape handler, and index.html's own
// raw onclick="closeProfileModal(); showPage('settings');" edit-profile
// button — genuinely NOT stale, confirmed via grep, the SETTINGS cluster's
// one raw call site named in the handler-delegation migration's own status
// table) are these four functions' only real callers outside this file.
// Everything else here — including toggleBookmark, despite
// src/pages/bakeries.js's renderBakeries referencing it too — is reached
// exclusively via delegated data-onclick markup or from within this file,
// so none of it needs a JS-level export, only a registerActions() entry.
import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { geocodeBakeryAddress } from '../services/places.js';
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION, MAP_TILE_MAX_ZOOM } from '../config.js';
import { CATEGORY_TREE, CATEGORIES, getCategoryDisplay } from '../data/categories.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { extractCity, extractCountry } from '../utils/geo.js';
import {
  currentUser, fb, allItems, allBakeries, allProfiles, allItemRecords,
  userBookmarks, loadBookmarks, userSavedItems, loadSavedItems,
} from '../state/appState.js';
import { openAuthModal } from './authModal.js';
import { openBakeryProfile, buildCategoryFilterBar } from './bakeryModal.js';
import { closeDetailModal } from './itemDetailModal.js';
import {
  followBtnHTML, getFollowersForUser, getFollowingForUser, buildFollowUserRowHTML,
} from './follows.js';
import { computeCountryRank } from '../pages/people.js';
import { renderOrdersTab } from './reservations.js';

let profileActiveCatFilter = '';
let profileActiveLocFilter = '';
let profileModalUid = null;

export async function openProfileModal(uid, catFilter, locFilter) {
  if (!currentUser) { openAuthModal(); return; }
  profileModalUid = uid;
  profileActiveCatFilter = catFilter || '';
  profileActiveLocFilter = locFilter || '';
  document.getElementById('profileModal').classList.add('open');
  lockScroll();
  document.getElementById('profileModalContent').innerHTML = `<div style="padding:40px; text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;
  let profile = allProfiles[uid] || {};
  try {
    const { db, doc, getDoc } = fb;
    const snap = await getDoc(doc(db, 'profiles', uid));
    if (snap.exists()) { profile = snap.data(); allProfiles[uid] = profile; }
  } catch(e) {}
  const userItems = allItems.filter(i => i.userId === uid);
  const name = profile.displayName || profile.name || (userItems[0]?.userName) || 'Anonymous';
  const photo = profile.photoURL || userItems[0]?.userPhoto || null;
  const initials = name.charAt(0).toUpperCase();
  const avgRating = userItems.length ? (userItems.reduce((s,i) => s + (i.overallRating||0), 0) / userItems.length).toFixed(1) : '–';
  const catCounts = {};
  userItems.forEach(i => { const c = i.category || 'other'; catCounts[c] = (catCounts[c]||0)+1; });
  const topCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0];
  const autoTopCat = topCat ? (CATEGORY_TREE[topCat[0]]?.label || topCat[0]) : '–';
  const faveCatKey = profile.favCategory || (topCat ? topCat[0] : null);
  const faveCatLabel = faveCatKey ? (CATEGORY_TREE[faveCatKey]?.label || autoTopCat) : autoTopCat;
  const isOwnProfile = currentUser && currentUser.uid === uid;
  document.getElementById('profileModalTitle').textContent = isOwnProfile ? 'Your profile' : name;
  const editBtn = document.getElementById('profileEditBtn');
  if (editBtn) editBtn.style.display = isOwnProfile ? 'flex' : 'none';
  let filtered = [...userItems].sort((a,b)=>(b.communityAvg||b.overallRating||0)-(a.communityAvg||a.overallRating||0));
  if (profileActiveCatFilter) filtered = filtered.filter(i => i.category === profileActiveCatFilter);
  if (profileActiveLocFilter) filtered = filtered.filter(i => i.bakeryName === profileActiveLocFilter);
  const catFilterBar = buildCategoryFilterBar(userItems, profileActiveCatFilter, 'openProfileModal', cat => [uid, cat, '']);
  const locs = [...new Set(userItems.map(i => i.bakeryName).filter(Boolean))];
  let locFilterBar = '';
  if (locs.length > 1) {
    const allBtn = `<button class="filter-chip location-chip${!profileActiveLocFilter ? ' active' : ''}" data-onclick="openProfileModal" data-args='${dataArgs([uid, profileActiveCatFilter || '', ''])}'>All locations</button>`;
    const locBtns = locs.map(loc => {
      const isActive = profileActiveLocFilter === loc;
      return `<button class="filter-chip location-chip${isActive ? ' active' : ''}" data-onclick="openProfileModal" data-args='${dataArgs([uid, profileActiveCatFilter, loc])}'>${loc}${isActive ? ` <span data-onclick="closeProfileModal,openBakeryProfile" data-args='${dataArgs([loc])}' style="opacity:0.7;margin-left:4px;">↗</span>` : ''}</button>`;
    }).join('');
    locFilterBar = `<div class="filter-bar">${allBtn}${locBtns}</div>`;
  } else if (locs.length === 1) {
    locFilterBar = `<div style="margin-bottom:12px;font-size:0.82rem;">All reviews from <span style="color:var(--caramel);cursor:pointer;font-weight:600;" data-onclick="closeProfileModal,openBakeryProfile" data-args='${dataArgs([locs[0]])}'>📍 ${locs[0]} ↗</span></div>`;
  }
  const reviewsHTML = filtered.map(item => {
    const catDisp = getCategoryDisplay(item);
    const record = item.itemRecordId ? allItemRecords.find(r => r.id === item.itemRecordId) : null;
    const score = record ? record.communityAvg.toFixed(1) : (item.communityAvg ? item.communityAvg.toFixed(1) : (item.overallRating ? item.overallRating.toFixed(1) : '–'));
    const thumb = item.photoURL ? `<div class="bakery-item-thumb"><img src="${item.photoURL}" alt="${item.name}"></div>` : `<div class="bakery-item-thumb">${catDisp.emoji}</div>`;
    return `<div class="bakery-item-row" data-onclick="closeProfileModal,openDetail" data-args='${dataArgs([item.id])}'>
      ${thumb}
      <div class="bakery-item-info">
        <div class="bakery-item-name">${item.name || 'Unknown bake'}</div>
        <div class="bakery-item-meta"><span style="cursor:pointer;color:var(--caramel);" data-onclick="closeProfileModal,openBakeryProfile" data-args='${dataArgs([item.bakeryName || ''])}'>📍 ${item.bakeryName || ''}</span> · ${catDisp.sub || catDisp.main}</div>
      </div>
      <div class="bakery-item-score">${score}</div>
    </div>`;
  }).join('');
  const filterLabel = [profileActiveCatFilter ? CATEGORY_TREE[profileActiveCatFilter]?.label : '', profileActiveLocFilter ? `at ${profileActiveLocFilter}` : ''].filter(Boolean).join(' ') || 'All';
  // Follow counts
  let followerCount = 0; let followingCount = 0;
  try {
    const { db, collection, query, where, getDocs } = fb;
    const [frs, fng] = await Promise.all([
      getDocs(query(collection(db, 'follows'), where('followingId', '==', uid))),
      getDocs(query(collection(db, 'follows'), where('followerId', '==', uid)))
    ]);
    followerCount = frs.size;
    followingCount = fng.size;
  } catch(e) {}

  const followBtn = !isOwnProfile && currentUser ? followBtnHTML(uid, true) : '';

  const bakeriesTriedCount = new Set(userItems.map(i => i.bakeryName).filter(Boolean)).size;
  const memberSince = profile.createdAt?.toDate ? profile.createdAt.toDate() : null;
  const memberSinceStr = memberSince ? memberSince.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : null;

  // Compute country ranking based on profile home country
  let countryRankHTML = '';
  const homeCountry = profile.country || extractCountry(profile.location || '');
  if (homeCountry) {
    const countryRank = computeCountryRank(uid, homeCountry);
    if (countryRank.rank) {
      const medal = countryRank.rank === 1 ? '🥇' : countryRank.rank === 2 ? '🥈' : countryRank.rank === 3 ? '🥉' : `#${countryRank.rank}`;
      countryRankHTML = `<div class="profile-stats-strip-divider"></div>
      <div class="profile-stats-strip-item">
        <div class="profile-stats-strip-num">${medal}</div>
        <div class="profile-stats-strip-label">📍 ${homeCountry}</div>
      </div>`;
    }
  }

  const statsStrip = isOwnProfile ? `
    <div class="profile-stats-strip">
      <div class="profile-stats-strip-item">
        <div class="profile-stats-strip-num">${bakeriesTriedCount}</div>
        <div class="profile-stats-strip-label">🏪 Bakeries tried</div>
      </div>
      <div class="profile-stats-strip-divider"></div>
      <div class="profile-stats-strip-item">
        <div class="profile-stats-strip-num">${userItems.length}</div>
        <div class="profile-stats-strip-label">🥐 Items rated</div>
      </div>
      ${countryRankHTML}
      ${memberSinceStr ? `<div class="profile-stats-strip-divider"></div>
      <div class="profile-stats-strip-item">
        <div class="profile-stats-strip-num" style="font-size:0.78rem;">${memberSinceStr}</div>
        <div class="profile-stats-strip-label">📅 Member since</div>
      </div>` : ''}
    </div>` : '';

  document.getElementById('profileModalContent').innerHTML = `
    <div class="profile-hero">
      <div class="profile-hero-avatar">${photo ? `<img src="${photo}" alt="${name}">` : initials}</div>
      <div class="profile-hero-info">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:4px;">
          <div class="profile-hero-name">${name}</div>
          ${followBtn}
        </div>
        ${profile.location ? `<div class="profile-hero-location">📍 ${profile.location}</div>` : ''}
        ${profile.bio ? `<div style="font-size:0.8rem; color:var(--honey-light); margin:6px 0; font-style:italic; line-height:1.4;">"${profile.bio}"</div>` : ''}
        <div class="profile-hero-stats">
          <div class="profile-stat"><div class="profile-stat-num">${userItems.length}</div><div class="profile-stat-label">Reviews</div></div>
          <div class="profile-stat"><div class="profile-stat-num">${avgRating}</div><div class="profile-stat-label">Avg score</div></div>
          <div class="profile-stat" style="cursor:pointer;" data-onclick="switchProfileTab" data-args='${dataArgs(['followers', uid])}'><div class="profile-stat-num">${followerCount}</div><div class="profile-stat-label">Followers</div></div>
          <div class="profile-stat" style="cursor:pointer;" data-onclick="switchProfileTab" data-args='${dataArgs(['following', uid])}'><div class="profile-stat-num">${followingCount}</div><div class="profile-stat-label">Following</div></div>
        </div>
      </div>
    </div>
    ${statsStrip}
    <div class="profile-tabs">
      <div class="profile-tab active" data-onclick="switchProfileTab" data-args='${dataArgs(['reviews', uid])}'>Reviews</div>
      <div class="profile-tab" data-onclick="switchProfileTab" data-args='${dataArgs(['followers', uid])}'>Followers</div>
      <div class="profile-tab" data-onclick="switchProfileTab" data-args='${dataArgs(['following', uid])}'>Following</div>
      ${isOwnProfile ? `<div class="profile-tab" data-onclick="switchProfileTab" data-args='${dataArgs(['saved', uid])}'>Saved</div>` : ''}
      ${isOwnProfile ? `<div class="profile-tab" data-onclick="switchProfileTab" data-args='${dataArgs(['orders', uid])}'>Orders</div>` : ''}
      ${isOwnProfile ? `<div class="profile-tab" data-onclick="switchProfileTab" data-args='${dataArgs(['activity', uid])}'>Activity</div>` : ''}
      ${isOwnProfile ? `<div class="profile-tab" data-onclick="switchProfileTab" data-args='${dataArgs(['map', uid])}'>My Map</div>` : ''}
    </div>
    <div class="profile-tab-content" id="profileTabContent">
      ${catFilterBar}${locFilterBar}
      ${userItems.length ? `<div class="profile-reviews-title">${filterLabel} reviews (${filtered.length})</div><div>${reviewsHTML || '<div class="empty-state" style="padding:20px 0;"><div class="empty-state-icon">🥐</div><div class="empty-state-title">No reviews match this filter</div></div>'}</div>`
        : `<div class="empty-state"><div class="empty-state-icon">🥐</div><div class="empty-state-title">No reviews yet</div></div>`}
    </div>`;
}

export function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('open');
  unlockScroll();
}

export async function switchProfileTab(tab, uid) {
  // Update active tab
  document.querySelectorAll('.profile-tab').forEach(t => {
    const tabText = t.textContent.toLowerCase().trim();
    t.classList.toggle('active', tabText === tab || (tab === 'map' && tabText === 'my map'));
  });
  const content = document.getElementById('profileTabContent');
  if (!content) return;
  content.innerHTML = '<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div></div>';

  if (tab === 'reviews') {
    await openProfileModal(uid, '', '');
    return;
  }

  if (tab === 'orders') {
    await renderOrdersTab(content);
    return;
  }

  if (tab === 'activity') {
    renderActivityTab(content, uid);
    return;
  }

  if (tab === 'saved') {
    await renderSavedTab(content);
    return;
  }

  if (tab === 'map') {
    renderDiningMapTab(content, uid);
    return;
  }

  try {
    const follows = tab === 'followers'
      ? await getFollowersForUser(uid)
      : await getFollowingForUser(uid);

    const ids = tab === 'followers'
      ? follows.map(f => f.followerId)
      : follows.map(f => f.followingId);

    if (!ids.length) {
      content.innerHTML = `<div class="empty-state" style="padding:32px 0;">
        <div class="empty-state-icon">👤</div>
        <div class="empty-state-title">${tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</div>
      </div>`;
      return;
    }

    // Fetch profile data for each user
    const rows = await Promise.all(ids.map(async fuid => {
      let fName = 'Anonymous'; let fPhoto = null;
      if (allProfiles[fuid]) {
        fName = allProfiles[fuid].displayName || fName;
        fPhoto = allProfiles[fuid].photoURL || null;
      } else {
        // Try to get from items
        const item = allItems.find(i => i.userId === fuid);
        if (item) { fName = item.userName || fName; fPhoto = item.userPhoto || null; }
      }
      return buildFollowUserRowHTML(fuid, fName, fPhoto, tab === 'following');
    }));

    content.innerHTML = `<div>${rows.join('')}</div>`;
  } catch(e) {
    content.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load.</div>';
    console.error(e);
  }
}

function openProfileIfSignedIn(uid) {
  if (currentUser) openProfileModal(uid);
}

function closeDetailAndOpenProfile(userId) {
  closeDetailModal();
  if (currentUser) openProfileModal(userId);
}

export async function refreshOpenProfile() {
  if (profileModalUid) await openProfileModal(profileModalUid, profileActiveCatFilter, profileActiveLocFilter);
}

// ─── ACTIVITY CALENDAR ────────────────────────────────────────────────────────
let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let calUid = null;

function renderActivityTab(container, uid) {
  calUid = uid;
  calViewYear = new Date().getFullYear();
  calViewMonth = new Date().getMonth();
  container.innerHTML = `<div id="activityCalendarRoot" style="padding:0 4px 16px;"></div>`;
  renderCalendar();
}

function renderCalendar() {
  const root = document.getElementById('activityCalendarRoot');
  if (!root) return;
  const myItems = allItems.filter(i => i.userId === calUid);
  const today = new Date();

  const dateMap = {};
  myItems.forEach(item => {
    const ts = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null);
    if (!ts) return;
    if (ts.getFullYear() === calViewYear && ts.getMonth() === calViewMonth) {
      const d = ts.getDate();
      if (!dateMap[d]) dateMap[d] = [];
      dateMap[d].push({ ...item, _ts: ts });
    }
  });

  const monthItems = Object.values(dateMap).flat();
  const monthBakeries = new Set(monthItems.map(i => i.bakeryName).filter(Boolean)).size;
  const monthCities = new Set(monthItems.map(i => extractCity(i.bakeryAddress || '')).filter(Boolean)).size;
  const monthName = new Date(calViewYear, calViewMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const dayLabels = ['S','M','T','W','T','F','S'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += `<div class="cal-day"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && calViewMonth === today.getMonth() && calViewYear === today.getFullYear();
    const reviews = dateMap[d] || [];
    const hasReview = reviews.length > 0;
    const countBadge = reviews.length > 1 ? `<span class="cal-review-count">${reviews.length}</span>` : '';
    const classes = `cal-day${hasReview ? ' has-review' : ''}${isToday ? ' today' : ''}`;
    const click = hasReview ? `data-onclick="onCalDayClick" data-args='${dataArgs([d])}'` : '';
    cells += `<div class="${classes}" ${click}>${d}${countBadge}</div>`;
  }

  const canGoNext = !(calViewYear === today.getFullYear() && calViewMonth === today.getMonth());

  root.innerHTML = `
    <div class="activity-month-header">
      <div class="activity-month-title">${monthName}</div>
      <div class="activity-month-nav">
        <button data-onclick="calNav" data-args='${dataArgs([-1])}'>‹</button>
        <button data-onclick="calNav" data-args='${dataArgs([1])}' ${!canGoNext ? 'disabled style="opacity:0.3;cursor:default;"' : ''}>›</button>
      </div>
    </div>
    <div class="activity-month-stats">
      <div class="activity-month-stat"><strong>${monthItems.length}</strong> review${monthItems.length !== 1 ? 's' : ''}</div>
      ${monthBakeries ? `<div class="activity-month-stat"><strong>${monthBakeries}</strong> baker${monthBakeries !== 1 ? 'ies' : 'y'}</div>` : ''}
      ${monthCities ? `<div class="activity-month-stat"><strong>${monthCities}</strong> cit${monthCities !== 1 ? 'ies' : 'y'}</div>` : ''}
    </div>
    <div class="cal-grid">
      ${dayLabels.map(l => `<div class="cal-day-label">${l}</div>`).join('')}
      ${cells}
    </div>
    ${!monthItems.length ? `<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:0.85rem;">No reviews this month</div>` : ''}`;

  root._dateMap = dateMap;
}

function calNav(dir) {
  calViewMonth += dir;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
}

function onCalDayClick(day) {
  const root = document.getElementById('activityCalendarRoot');
  const reviews = root?._dateMap?.[day] || [];
  if (!reviews.length) return;

  if (reviews.length === 1) {
    // Close the profile modal first — both it and #bakeryModal share the
    // same .modal-overlay z-index (src/styles/main.css), and #profileModal
    // sits later in index.html's DOM order, so leaving it open would make
    // it visually/interactively sit on top of the bakery modal we're about
    // to open (blocking its own close button). Same pattern already used
    // everywhere else in the app for a profile-modal-relative "jump to a
    // bakery" action (follow-list rows, location chips, etc.).
    closeProfileModal();
    openBakeryProfile(reviews[0].bakeryName);
    return;
  }

  // Multiple reviews — bottom sheet
  const dateStr = new Date(calViewYear, calViewMonth, day)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const rows = reviews.map((item, i) => {
    const score = (item.communityAvg || item.overallRating || 0).toFixed(1);
    const photo = item.photoURL
      ? `<img src="${item.photoURL}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;" alt="">`
      : `<div style="width:44px;height:44px;border-radius:8px;background:var(--parchment-dark);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">${CATEGORIES?.[item.category]||'🥐'}</div>`;
    return `<div data-calday-idx="${i}" style="display:flex;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid var(--border);cursor:pointer;"
      onmouseover="this.style.background='var(--parchment)';this.style.margin='0 -20px';this.style.padding='11px 20px';"
      onmouseout="this.style.background='';this.style.margin='';this.style.padding='11px 0';">
      ${photo}
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.88rem;font-weight:600;color:var(--espresso);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name || 'Review'}</div>
        <div style="font-size:0.74rem;color:var(--text-muted);">${item.bakeryName || ''}</div>
      </div>
      <div style="font-size:1rem;font-weight:700;color:var(--caramel);flex-shrink:0;">${score}</div>
    </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.id = 'calDayModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:560px;max-height:72vh;overflow-y:auto;padding:20px 20px 36px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--espresso);">${dateStr}</div>
        <button data-onclick="closeCalDayModal" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-muted);padding:4px 8px;">✕</button>
      </div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:16px;">${reviews.length} reviews</div>
      ${rows}
    </div>`;
  document.body.appendChild(overlay);

  // Attach click handlers with item data
  overlay.querySelectorAll('[data-calday-idx]').forEach(el => {
    const item = reviews[parseInt(el.dataset.caldayIdx)];
    el.addEventListener('click', () => { closeCalDayModal(); closeProfileModal(); if (item?.bakeryName) openBakeryProfile(item.bakeryName); });
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) closeCalDayModal(); });
}

function closeCalDayModal() {
  document.getElementById('calDayModal')?.remove();
}


// ─── DINING MAP ───────────────────────────────────────────────────────────────
let diningMapInstance = null;


function renderDiningMapTab(container, uid) {
  const myItems = allItems.filter(i => i.userId === uid && i.bakeryName);

  const cityMap = {}, countryMap = {}, categoryMap = {};
  myItems.forEach(item => {
    const score = item.communityAvg || item.overallRating || 0;
    const city = extractCity(item.bakeryAddress || '');
    const country = extractCountry(item.bakeryAddress || '');
    const cat = item.category || 'other';
    if (city) {
      if (!cityMap[city]) cityMap[city] = { count: 0, total: 0, lat: item.bakeryLat, lng: item.bakeryLng };
      cityMap[city].count++; cityMap[city].total += score;
      if (!cityMap[city].lat && item.bakeryLat) { cityMap[city].lat = item.bakeryLat; cityMap[city].lng = item.bakeryLng; }
    }
    if (country) {
      if (!countryMap[country]) countryMap[country] = { count: 0, total: 0 };
      countryMap[country].count++; countryMap[country].total += score;
    }
    if (!categoryMap[cat]) categoryMap[cat] = { count: 0, total: 0 };
    categoryMap[cat].count++; categoryMap[cat].total += score;
  });

  const cityCount = Object.keys(cityMap).length;
  const countryCount = Object.keys(countryMap).length;
  const bakeryCount = new Set(myItems.map(i => i.bakeryName)).size;

  container.innerHTML = `
    <div style="margin:-16px -24px 0;">
      <div style="padding:16px 20px 12px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-family:'Playfair Display',serif; font-size:1.1rem; font-weight:700; color:var(--espresso);">🗺️ Your Baking Map</div>
          <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">${cityCount} cit${cityCount !== 1 ? 'ies' : 'y'} · ${bakeryCount} baker${bakeryCount !== 1 ? 'ies' : 'y'} · ${myItems.length} review${myItems.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div id="diningMapEl" style="height:280px; width:100%; background:var(--parchment-dark); position:relative;">
        <div id="diningMapLoading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--parchment);z-index:500;font-size:0.82rem;color:var(--text-muted);">
          <div style="text-align:center;"><div class="spinner" style="margin:0 auto 8px;"></div>Loading map…</div>
        </div>
      </div>
      <div style="display:flex; border-bottom:1px solid var(--border); background:var(--cream-white);">
        <button class="dm-stat-tab active" data-onclick="switchDmTab" data-args='${dataArgs(['bakes'])}' style="flex:1; padding:10px; font-size:0.8rem; font-weight:600; border:none; background:none; cursor:pointer; color:var(--espresso); border-bottom:2px solid var(--honey);">Bakes</button>
        <button class="dm-stat-tab" data-onclick="switchDmTab" data-args='${dataArgs(['cities'])}' style="flex:1; padding:10px; font-size:0.8rem; font-weight:500; border:none; background:none; cursor:pointer; color:var(--text-muted); border-bottom:2px solid transparent;">Cities</button>
        <button class="dm-stat-tab" data-onclick="switchDmTab" data-args='${dataArgs(['countries'])}' style="flex:1; padding:10px; font-size:0.8rem; font-weight:500; border:none; background:none; cursor:pointer; color:var(--text-muted); border-bottom:2px solid transparent;">Countries</button>
      </div>
      <div id="dmStatContent" style="padding:0 20px 24px;"></div>
    </div>`;

  container._dmData = { myItems, cityMap, countryMap, categoryMap };

  requestAnimationFrame(() => {
    loadLeafletThenMap(myItems);
    renderDmStats('bakes', container._dmData);
  });
}

async function buildBakeryCoords(myItems) {
  // Group by bakery name
  const bakeries = {};
  myItems.forEach(item => {
    const key = item.bakeryName;
    if (!bakeries[key]) bakeries[key] = { name: key, address: item.bakeryAddress || '', lat: item.bakeryLat, lng: item.bakeryLng, reviews: [] };
    if (!bakeries[key].lat && item.bakeryLat) { bakeries[key].lat = item.bakeryLat; bakeries[key].lng = item.bakeryLng; }
    bakeries[key].reviews.push(item);
  });

  // Geocode any still missing coords
  await Promise.all(Object.values(bakeries).filter(b => !b.lat && b.address).map(async b => {
    const coords = await geocodeBakeryAddress(b.name, b.address);
    if (coords) { b.lat = coords.lat; b.lng = coords.lng; }
  }));

  return Object.values(bakeries).filter(b => b.lat && b.lng);
}

function loadLeafletThenMap(myItems) {
  function setupMap(bakeryList) {
    const el = document.getElementById('diningMapEl');
    const loader = document.getElementById('diningMapLoading');
    if (!el) return;
    if (loader) loader.style.display = 'none';
    if (diningMapInstance) { diningMapInstance.remove(); diningMapInstance = null; }

    const L = window.L;
    diningMapInstance = L.map('diningMapEl', { center: [54, -1], zoom: 6, zoomControl: true, scrollWheelZoom: false });

    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_TILE_ATTRIBUTION, maxZoom: MAP_TILE_MAX_ZOOM
    }).addTo(diningMapInstance);

    function makeIcon(label) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
        <circle cx="17" cy="17" r="15" fill="#2c1810" stroke="#d4a574" stroke-width="2"/>
        <text x="17" y="21" font-family="sans-serif" font-size="9" font-weight="700" fill="#d4a574" text-anchor="middle">${label}</text>
      </svg>`;
      return L.divIcon({
        html: svg,
        className: '',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
    }

    const clusters = L.markerClusterGroup({
      maxClusterRadius: 60,
      iconCreateFunction: cluster => {
        const n = cluster.getChildCount();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
          <circle cx="19" cy="19" r="17" fill="#2c1810" stroke="#d4a574" stroke-width="2"/>
          <text x="19" y="23" font-family="sans-serif" font-size="10" font-weight="700" fill="#d4a574" text-anchor="middle">${n}🥐</text>
        </svg>`;
        return L.divIcon({ html: svg, className: '', iconSize: [38, 38], iconAnchor: [19, 19] });
      }
    });

    if (!bakeryList.length) {
      // No coords at all — just show a message overlay
      el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:400;"><div style="background:rgba(250,246,240,0.92);border-radius:8px;padding:12px 20px;font-size:0.82rem;color:var(--text-muted);text-align:center;">📍 Add bakeries via search to see pins</div></div>`);
    }

    bakeryList.forEach(b => {
      const avg = b.reviews.reduce((s, i) => s + (i.communityAvg || i.overallRating || 0), 0) / b.reviews.length;
      const marker = L.marker([b.lat, b.lng], { icon: makeIcon(avg.toFixed(1)) });
      marker.bindPopup(`
        <div style="font-family:sans-serif;min-width:150px;">
          <div style="font-weight:700;font-size:0.88rem;margin-bottom:3px;">${b.name}</div>
          <div style="font-size:0.74rem;color:#888;margin-bottom:6px;">${b.address}</div>
          <div style="font-size:0.8rem;"><strong>${b.reviews.length}</strong> review${b.reviews.length !== 1 ? 's' : ''} &nbsp;·&nbsp; <strong style="color:#2c1810;">⭐ ${avg.toFixed(1)}</strong></div>
        </div>`, { maxWidth: 220 });
      clusters.addLayer(marker);
    });

    diningMapInstance.addLayer(clusters);

    if (bakeryList.length) {
      const group = L.featureGroup(bakeryList.map(b => L.marker([b.lat, b.lng])));
      try { diningMapInstance.fitBounds(group.getBounds().pad(0.4), { maxZoom: 13 }); } catch(e) {}
    }
  }

  async function withLeaflet() {
    const bakeryList = await buildBakeryCoords(myItems);

    if (window.L?.markerClusterGroup) {
      setupMap(bakeryList);
    } else if (window.L) {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
      s.onload = () => setupMap(bakeryList);
      document.head.appendChild(s);
    } else {
      const s1 = document.createElement('script');
      s1.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s1.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
        s2.onload = () => setupMap(bakeryList);
        document.head.appendChild(s2);
      };
      document.head.appendChild(s1);
    }
  }

  withLeaflet();
}

// Parameter order follows delegate.js's trailing-clicked-element convention
// (tab, then btn) — its only call sites are its own data-onclick attribute.
function switchDmTab(tab, btn) {
  document.querySelectorAll('.dm-stat-tab').forEach(t => {
    t.style.fontWeight = '500';
    t.style.color = 'var(--text-muted)';
    t.style.borderBottom = '2px solid transparent';
  });
  btn.style.fontWeight = '700';
  btn.style.color = 'var(--espresso)';
  btn.style.borderBottom = '2px solid var(--honey)';
  const container = document.getElementById('profileTabContent');
  if (container?._dmData) renderDmStats(tab, container._dmData);
}

function renderDmStats(tab, data) {
  const el = document.getElementById('dmStatContent');
  if (!el) return;
  const { myItems, cityMap, countryMap, categoryMap } = data;

  const catLabels = {
    bread: '🍞 Bread', pastry: '🥐 Pastry', cake: '🎂 Cake',
    tart: '🥧 Tarts', bun: '🧁 Buns', cookie: '🍪 Biscuits', other: '☕ Other'
  };

  if (tab === 'bakes') {
    const rows = Object.entries(categoryMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([cat, d]) => ({ label: catLabels[cat] || cat, count: d.count, avg: d.count ? d.total / d.count : 0 }));
    el.innerHTML = renderDmStatRows(rows, `${myItems.length} bakes rated`);
  } else if (tab === 'cities') {
    const rows = Object.entries(cityMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([city, d]) => ({ label: city, count: d.count, avg: d.count ? d.total / d.count : 0 }));
    el.innerHTML = renderDmStatRows(rows, `${Object.keys(cityMap).length} cities visited`);
  } else {
    const rows = Object.entries(countryMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([country, d]) => ({ label: country, count: d.count, avg: d.count ? d.total / d.count : 0 }));
    el.innerHTML = renderDmStatRows(rows, `${Object.keys(countryMap).length} countries visited`);
  }
}

function renderDmStatRows(rows, subtitle) {
  if (!rows.length) return `<div style="padding:24px 0;text-align:center;color:var(--text-muted);font-size:0.85rem;">No data yet</div>`;
  return `
    <div style="font-size:0.72rem;color:var(--text-muted);padding:12px 0 8px;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">${subtitle}</div>
    ${rows.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:0.88rem;font-weight:600;color:var(--espresso);">${r.label}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${r.count} review${r.count !== 1 ? 's' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:38px;height:38px;border-radius:50%;border:2px solid ${r.avg >= 4 ? '#27ae60' : r.avg >= 3 ? 'var(--honey)' : 'var(--text-muted)'};display:flex;align-items:center;justify-content:center;font-size:0.82rem;font-weight:700;color:${r.avg >= 4 ? '#27ae60' : r.avg >= 3 ? 'var(--caramel)' : 'var(--text-muted)'};">${r.avg.toFixed(1)}</div>
        </div>
      </div>`).join('')}`;
}


async function toggleBookmark(bakeryName, address, btnEl) {
  if (!currentUser) { openAuthModal(); return; }
  if (!fb) return;
  const { db, collection, addDoc, doc, deleteDoc, serverTimestamp } = fb;

  const already = userBookmarks[bakeryName];
  if (already) {
    // Remove
    try {
      await deleteDoc(doc(db, 'bookmarks', already.id));
      delete userBookmarks[bakeryName];
      if (btnEl) { btnEl.classList.remove('saved'); btnEl.title = 'Save bakery'; }
      showToast('Bookmark removed');
    } catch(e) { showToast('Could not remove bookmark'); }
  } else {
    // Add
    try {
      const docRef = await addDoc(collection(db, 'bookmarks'), {
        userId: currentUser.uid,
        bakeryName,
        address: address || '',
        createdAt: serverTimestamp()
      });
      userBookmarks[bakeryName] = { id: docRef.id, address };
      if (btnEl) { btnEl.classList.add('saved'); btnEl.title = 'Remove bookmark'; }
      showToast('🔖 Bakery saved!');
    } catch(e) { showToast('Could not save bookmark'); console.error(e); }
  }
}

function removeBookmarkAndRefreshSaved(bakeryName, address) {
  toggleBookmark(bakeryName, address, null).then(() => switchProfileTab('saved', currentUser.uid));
}

async function renderSavedTab(container) {
  if (!currentUser) {
    container.innerHTML = '<div class="empty-state" style="padding:32px 0;"><div class="empty-state-icon">🔖</div><div class="empty-state-title">Sign in to see saved bakeries</div></div>';
    return;
  }
  await loadBookmarks();
  await loadSavedItems();
  const saved = Object.entries(userBookmarks);
  const savedItemsList = Object.values(userSavedItems);

  const bakeriesSectionHTML = !saved.length
    ? `<div class="empty-state" style="padding:24px 0;">
        <div class="empty-state-icon">🏪</div>
        <div class="empty-state-title">No saved bakeries yet</div>
        <div class="empty-state-text">Tap the 🔖 on any bakery to save it for later</div>
      </div>`
    : `<div>${saved.map(([name, data]) => {
        const hasReviews = !!allBakeries[name];
        return `
          <div class="bookmark-card">
            <div class="bookmark-card-icon">🏪</div>
            <div class="bookmark-card-body">
              <div class="bookmark-card-name">${name}</div>
              ${data.address ? `<div class="bookmark-card-address">📍 ${data.address}</div>` : ''}
            </div>
            <div class="bookmark-card-actions">
              ${hasReviews ? `<button class="admin-btn primary" style="font-size:0.75rem;" data-onclick="closeProfileModal,openBakeryProfile" data-args='${dataArgs([name, ''])}'>View →</button>` : ''}
              <button class="admin-btn" style="font-size:0.75rem;color:#e74c3c;" data-onclick="removeBookmarkAndRefreshSaved" data-args='${dataArgs([name, data.address])}'>Remove</button>
            </div>
          </div>`;
      }).join('')}</div>`;

  const itemsSectionHTML = !savedItemsList.length
    ? `<div class="empty-state" style="padding:24px 0;">
        <div class="empty-state-icon">🥐</div>
        <div class="empty-state-title">No items saved to try</div>
        <div class="empty-state-text">Tap 🔖 Save to try on any review you'd like to remember</div>
      </div>`
    : `<div>${savedItemsList.map(s => {
        const catDisp = CATEGORY_TREE[s.category]?.emoji || '🥐';
        const thumb = s.photoURL ? `<img src="${s.photoURL}" alt="${s.name}">` : catDisp;
        return `
          <div class="saved-item-card" data-onclick="closeProfileModal,openDetail" data-args='${dataArgs([s.itemId])}'>
            <div class="saved-item-thumb">${s.photoURL ? `<img src="${s.photoURL}" alt="${s.name}">` : catDisp}</div>
            <div class="saved-item-body">
              <div class="saved-item-name">${s.name}</div>
              <div class="saved-item-bakery">📍 ${s.bakeryName}</div>
            </div>
            <button class="admin-btn" style="font-size:0.72rem;color:#e74c3c;flex-shrink:0;" data-onclick="removeSavedItem" data-args='${dataArgs([s.itemId])}'>Remove</button>
          </div>`;
      }).join('')}</div>`;

  container.innerHTML = `
    <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">🏪 Saved bakeries</div>
    ${bakeriesSectionHTML}
    <div style="font-size:0.78rem;font-weight:700;color:var(--espresso);text-transform:uppercase;letter-spacing:0.5px;margin:24px 0 10px;">🥐 Items to try</div>
    ${itemsSectionHTML}`;
}

// openProfileModal/closeProfileModal/switchProfileTab/refreshOpenProfile are
// exported above for legacy-app.js's own remaining callers; everything else
// below is only ever reached via delegated data-onclick markup, so this is
// the only registration each of them needs.
registerActions({
  openProfileModal, closeProfileModal, switchProfileTab,
  openProfileIfSignedIn, closeDetailAndOpenProfile,
  calNav, onCalDayClick, closeCalDayModal, switchDmTab,
  toggleBookmark, removeBookmarkAndRefreshSaved,
});
