// ─── BAKERIES PAGE ──────────────────────────────────────────────────────────
// The #page-bakeries routed view (pages/components carving, Phase 7 step 26 —
// see CLAUDE.md). Moved: bakeryViewMode/userGeoCoords (module state),
// geocodeMissingBakeries, setBakeryView, populateBakeryLocationFilter,
// distKmUser, renderBakeries.
//
// buildBakeryIndex() did NOT move — it reads exploreCache, owned by the
// not-yet-extracted Explore page (Phase 7 step 29). It stays in
// legacy-app.js, and setBakeryView/renderBakeries reach it via
// getAction('buildBakeryIndex')() rather than a forbidden direct import
// back — the same action-registry pattern bakeryModal.js (step 21) and
// adminPanel.js (step 23) already use for it. legacy-app.js registers it
// via registerActions({ buildBakeryIndex }) (unchanged, pre-existing).
// The Phase 0 stage 3b deferred follow-up (revisit whether
// loadData()/buildBakeryIndex() can move into appState.js once Explore's
// exploreCache has a real home) is unaffected — that decision belongs to
// step 29, not this one.
//
// distKm is now imported one-way from utils/geo.js (the step-2 note
// predicted this: distKmUser reads userGeoCoords, this page's own local
// state, so it was left behind then to move here now).
//
// showPage() (legacy-app.js, Phase 7 step 32) resets the view on nav to
// this page — it calls setBakeryViewMode('all') then renderBakeries(),
// both imported one-way back. Exact pre-existing behavior preserved: the
// old inline `bakeryViewMode = 'all'; renderBakeries()` did not touch the
// view-toggle button .active classes, and neither does setBakeryViewMode
// (setBakeryView, which does toggle them, is only reached from markup).

import { registerActions, getAction } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { GOOGLE_MAPS_KEY } from '../config.js';
import { currentUser, allBakeries, allItems, isBookmarked } from '../state/appState.js';
import { distKm } from '../utils/geo.js';
import { showToast } from '../utils/dom.js';

let bakeryViewMode = 'all'; // 'all' | 'nearest' | 'visited'
let userGeoCoords = null;   // { lat, lng } from geolocation

// showPage() resets this on nav to #page-bakeries — see header comment.
export function setBakeryViewMode(mode) {
  bakeryViewMode = mode;
}

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
      getAction('buildBakeryIndex')();
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

export function renderBakeries() {
  getAction('buildBakeryIndex')();
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

registerActions({ setBakeryView, renderBakeries });
