// ─── ADD REVIEW MODAL ───────────────────────────────────────────────────────
// The "Rate a Bake!" wizard: modal shell, bakery search (step 1), category
// picker + tasting-dimension sliders + photo upload (step 2), item matching
// against existing itemRecords, and step navigation. Pages/components
// carving, Phase 4 step 18 — see CLAUDE.md. Kept as ONE module per the
// plan, not split further — internal state is deeply cross-referential (11
// module-level variables, all read/written across most of these functions),
// and this is the exact cluster where modalNext/modalBack broke and shipped
// silently unregistered during the original handler-delegation migration
// (found only because a real E2E click timed out, past both check:dead-refs
// and npm run build). That history doesn't make this extraction inherently
// riskier — the verification bar is just held to the same standard
// deliberately, not shortcut by familiarity with "just move one module":
// this file's own modalNext/modalBack registration was checked against
// checkDeadRegisterActionsRefs specifically (the checker added after that
// exact bug shape, step 9) before trusting it, not just check:dead-refs in
// general.
//
// Explicitly out of scope: saveReview() — stays in legacy-app.js. It calls
// updateStats()/renderRecentGrid()/renderLeaderboard()/loadData() and reads
// lbCurrentTab, none extracted before Phase 7 (steps 27-29). Every function
// in this file is otherwise self-contained or only reaches into already-
// extracted modules — verified via a full-file grep before writing any
// code, not assumed.
//
// modalNext() calls saveReview() on the final step — this is the first
// step in the whole plan where a function that MUST move (modalNext, core
// to this cluster's own reason for existing) calls one that can't yet
// (saveReview). Every prior deferral resolved this shape by leaving the
// dependent function behind in legacy-app.js; that doesn't work here
// because modalNext itself is the one moving, and deferring saveReview
// alone would just flip which file needs the forbidden import. Confirmed
// with the user before writing any code (a genuinely new situation, not a
// unilateral call): modalNext calls `getAction('saveReview')()` instead of
// importing saveReview directly — the same action-registry lookup
// delegate.js already uses to resolve every data-onclick by name, just
// invoked once here from plain code instead of only from click dispatch.
// saveReview stays in legacy-app.js and self-registers there via
// registerActions({ saveReview }); this file only imports the neutral
// getAction() helper, never anything from legacy-app.js itself — the sink
// invariant this whole plan has held since Phase 0 (leaf modules never
// import from legacy-app.js — verified via a fresh grep across every
// extracted file before deciding this, not assumed) stays intact. No
// ordering risk: registerActions({ saveReview }) runs at legacy-app.js's
// own module-evaluation time, which always completes before any user click
// could reach modalNext() — the identical guarantee delegate.js's own
// dispatch already relies on for every markup handler in the app.
//
// openAddModalForBakery moved in too, despite being called only from other
// not-yet-extracted clusters' own markup (bakery profile modal, Explore map
// popup, ADMIN PANEL RENDERERS' bakeries table) — every one of its own
// dependencies (openAddModal, selectedBakery, showKnownBakeries) belongs to
// this cluster, so it's a genuine fit by dependency, not by caller. Pulled
// out of a bulk registerActions() call in legacy-app.js that mixes several
// other not-yet-extracted clusters' own open-modal functions (same pattern
// as authModal.js's closeAuthModal, Phase 1 step 6) — registers from here
// instead now. closeAddModal and prefillItemForReview got the same
// treatment, pulled out of two other bulk calls (the shared modal-close
// block; the item detail modal's own block, alongside flagReview which
// stays).
//
// Three functions keep raw call sites, confirmed by grepping index.html for
// every one of this file's ~32 candidate names before assuming any WINDOW
// EXPORTS entry was stale, per the switchFeedTab lesson (step 13) — all
// three belong to clusters CLAUDE.md's own migration-status table already
// named as permanently out of scope for the handler-delegation migration,
// not new staleness:
//   - openAddModal: index.html's nav "+ Add" button and Home page's
//     "Rate a Bake!" trigger both still use raw onclick="openAddModal()".
//   - showKnownBakeries: #bakerySearch's onfocus="if(!this.value)
//     showKnownBakeries()" — delegate.js's one deliberately-unconverted
//     onfocus site (a single call site isn't worth wiring up).
//   - updateOverallRating: the overall-rating slider's own
//     oninput="updateOverallRating(this.value)" — RATING's own slider,
//     never in scope for that migration either.
// All three keep their WINDOW EXPORTS entry, re-imported into
// legacy-app.js purely for that — raw markup can only ever resolve
// window[name], never a delegated data-onclick. selectManualBakery keeps
// its entry too, for a different reason: tests/utils/reviews.js and
// several specs call window.selectManualBakery() directly to bypass the
// Google Places results UI (confirmed via grep — 5 call sites across 4
// spec files) — removing it would break every spec that creates a review.
//
// compressImage/compressToDataURL moved in as this cluster's own
// handlePhotoChange dependency, but turned out to have a much wider
// fan-out than CLAUDE.md's original step-9 deferral note described: a
// fresh grep found 5 external callers, not just editReviewModal.js's
// handleEditPhoto — Settings' own photo upload, Business bakery-edit
// photo, the admin Manage Bakery photo, and Shop Management's product
// photo, all still in legacy-app.js, all now importing these two back
// one-way. Corrected here since it changes the shape of the deferred
// handleEditPhoto follow-up (still tied to this step landing, just a
// bigger fan-out than documented) — see CLAUDE.md's own updated note.
//
// GOOGLE_MAPS_KEY moved to src/config.js (not part of this file, but a
// necessary side-effect of it) — see that file's own header comment for
// why: it's used by 6+ still-unextracted clusters, and this file needing
// it too meant it could no longer stay a legacy-app.js-local constant
// without breaking the same sink invariant modalNext/saveReview's own
// resolution above was built to preserve.

import { registerActions, getAction } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { GOOGLE_MAPS_KEY } from '../config.js';
import { currentUser, fb, allItems, allProfiles, allItemRecords, loadItemRecords } from '../state/appState.js';
import { CATEGORY_TREE, SUB_TO_PARENT, SUB_LABEL, getTastingDims, getCategoryDisplay } from '../data/categories.js';
import { distKm } from '../utils/geo.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { openAuthModal } from './authModal.js';

let currentStep = 1;
let totalSteps = 4;
export let selectedCategory = '';
export let selectedBakery = null;
export let photoFile = null;
let photoDataURL = null;

let userLatLng = null; // cached geolocation

export function openAddModal() {
  if (!currentUser) { openAuthModal(); return; }
  resetAddModal();
  // Always refresh item records so we see other users' recent additions
  loadItemRecords();
  // Request location silently in background
  if (navigator.geolocation && !userLatLng) {
    navigator.geolocation.getCurrentPosition(
      pos => { userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {}, // silent fail
      { timeout: 5000, maximumAge: 300000 }
    );
  }
  document.getElementById('addModal').classList.add('open');
  lockScroll();
}

export function closeAddModal() {
  document.getElementById('addModal').classList.remove('open');
  unlockScroll();
}

export function resetAddModal() {
  currentStep = 1;
  selectedCategory = '';
  selectedBakery = null;
  photoFile = null;
  photoDataURL = null;
  matchedItemRecord = null;
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) { nextBtn.disabled = false; }
  document.getElementById('itemName').value = '';
  document.getElementById('bakerySearch').value = '';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemNotes').value = '';
  document.getElementById('overallRating').value = 0;
  document.getElementById('overallRatingDisplay').textContent = '–';
  document.getElementById('locationSelected').classList.remove('visible');
  document.getElementById('bakeryResultsKnown').innerHTML = ''; document.getElementById('bakeryResultsGoogle').innerHTML = '';
  const photoInputEl = document.getElementById('photoInput');
  if (photoInputEl) photoInputEl.value = '';
  const matchResults = document.getElementById('itemMatchResults');
  const matchSelected = document.getElementById('itemMatchSelected');
  const catGroup = document.getElementById('categoryGroup');
  if (matchResults) matchResults.innerHTML = '';
  if (matchSelected) matchSelected.style.display = 'none';
  if (catGroup) catGroup.style.display = 'block';
  document.getElementById('photoUploadWrap').innerHTML = `
    <div class="photo-upload" id="photoUploadArea">
      <input type="file" accept="image/*" id="photoInput" data-onchange="handlePhotoChange">
      <div class="photo-upload-icon">📷</div>
      <div class="photo-upload-text">Tap to take a photo or <strong>upload from your camera roll</strong></div>
    </div>`;
  document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
  buildTastingDims();
  buildCategoryChips();
  selectedSubCategory = '';
  goToStep(1);
}

export function buildTastingDims(category) {
  const cat = category || selectedCategory || 'other';
  const dims = getTastingDims(cat);
  const wrap = document.getElementById('tastingDims');
  if (!wrap) return;

  // Update category emoji in header
  const catEmoji = document.getElementById('tastingDimsCatEmoji');
  if (catEmoji) catEmoji.textContent = CATEGORY_TREE[cat]?.emoji || '✦';

  // Universal dims use standard emojis; 5th dim uses category emoji
  const dimEmojis = ['👁️', '🤌', '👅', '💰'];

  wrap.innerHTML = dims.map((d, i) => {
    const emoji = i < 4 ? dimEmojis[i] : (CATEGORY_TREE[cat]?.emoji || '✦');
    return `
    <div class="tasting-dim-row">
      <div class="tasting-dim-emoji">${emoji}</div>
      <div class="tasting-dim-right">
        <div class="tasting-dim-top">
          <div>
            <span class="tasting-dim-name">${d.label}</span>
            ${d.tip ? `<span class="tasting-dim-tip"> — ${d.tip}</span>` : ''}
          </div>
          <span class="tasting-dim-val" id="display_${d.key}">–</span>
        </div>
        <input type="range" class="rating-slider" id="${d.key}" min="0" max="5" step="0.1" value="0"
          data-oninput="updateDimDisplay" data-args='${dataArgs([`display_${d.key}`])}' style="margin:0;">
      </div>
    </div>`;
  }).join('');
}

// ─── IMAGE COMPRESSION ────────────────────────────────────────────────────────
export function compressImage(file, maxPx, quality) {
  // maxPx: max dimension in pixels, quality: 0-1 JPEG quality
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = maxPx || 1200;
        const Q = quality || 0.82;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', Q);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function compressToDataURL(file, maxPx, quality) {
  const blob = await compressImage(file, maxPx, quality);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(blob);
  });
}

export async function handlePhotoChange(input) {
  if (!input.files[0]) return;
  const original = input.files[0];
  // Compress to max 1200px, 82% quality before storing
  const compressed = await compressImage(original, 1200, 0.82);
  photoFile = compressed;
  photoDataURL = await compressToDataURL(original, 1200, 0.82);
  document.getElementById('photoUploadWrap').innerHTML = `
    <div class="photo-preview">
      <img src="${photoDataURL}" alt="Preview">
      <button class="photo-preview-remove" data-onclick="removePhoto">✕</button>
    </div>`;

}

export function removePhoto() {
  photoFile = null; photoDataURL = null;
  document.getElementById('photoUploadWrap').innerHTML = `
    <div class="photo-upload" id="photoUploadArea">
      <input type="file" accept="image/*" id="photoInput" data-onchange="handlePhotoChange">
      <div class="photo-upload-icon">📷</div>
      <div class="photo-upload-text">Tap to take a photo or <strong>upload from your camera roll</strong></div>
    </div>`;
}



export let selectedSubCategory = '';

export function buildCategoryChips() {
  const parentWrap = document.getElementById('categoryParentChips');
  const subWrap = document.getElementById('categorySubChips');
  if (!parentWrap) return;
  renderParentChips(parentWrap);
  subWrap.innerHTML = '';
  subWrap.style.display = 'none';
}

export function renderParentChips(parentWrap) {
  parentWrap.innerHTML = Object.entries(CATEGORY_TREE).map(([key, cat]) =>
    `<div class="category-chip" data-onclick="selectParentCategory" data-args='${dataArgs([key])}'>${cat.emoji} ${cat.label}</div>`
  ).join('');
}

export function selectParentCategory(parentKey) {
  selectedCategory = parentKey;
  selectedSubCategory = '';
  const cat = CATEGORY_TREE[parentKey];
  const parentWrap = document.getElementById('categoryParentChips');
  const subWrap = document.getElementById('categorySubChips');
  if (!parentWrap || !cat) return;

  // Collapse parent chips to just the selected one with a ✕
  parentWrap.innerHTML = `
    <div class="category-chip selected" style="display:flex; align-items:center; gap:6px;">
      ${cat.emoji} ${cat.label}
      <span data-onclick="clearParentCategory" style="
        display:inline-flex; align-items:center; justify-content:center;
        width:16px; height:16px; border-radius:50%;
        background:rgba(255,255,255,0.25); font-size:0.7rem;
        cursor:pointer; margin-left:2px; line-height:1;
        transition:background 0.15s;" title="Change category">✕</span>
    </div>`;

  // Show sub-categories
  const subs = cat.subs || {};
  subWrap.innerHTML = `<div style="font-size:0.72rem; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); width:100%; margin-bottom:4px;">Choose type</div>` +
    Object.entries(subs).map(([key, label]) =>
      `<div class="category-chip" data-subcat="${key}" data-onclick="selectSubCategory" data-args='${dataArgs([key])}'>${label}</div>`
    ).join('');
  subWrap.style.display = 'flex';
  subWrap.style.flexWrap = 'wrap';
  subWrap.style.gap = '8px';

  // Rebuild tasting dims for this category
  buildTastingDims(parentKey);
  // Update emoji in tasting header immediately
  const catEmoji = document.getElementById('tastingDimsCatEmoji');
  if (catEmoji) catEmoji.textContent = CATEGORY_TREE[parentKey]?.emoji || '✦';
}

export function clearParentCategory() {
  selectedCategory = '';
  selectedSubCategory = '';
  const parentWrap = document.getElementById('categoryParentChips');
  const subWrap = document.getElementById('categorySubChips');
  if (parentWrap) renderParentChips(parentWrap);
  if (subWrap) { subWrap.innerHTML = ''; subWrap.style.display = 'none'; }
  buildTastingDims('other'); // reset to default
}

// Parameter order follows delegate.js's trailing-clicked-element convention
// (subKey, then el) — its only two call sites are its own data-onclick
// attribute and one plain call from prefillItemForReview, both updated here.
export function selectSubCategory(subKey, el) {
  document.querySelectorAll('#categorySubChips .category-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedSubCategory = subKey;
  selectedCategory = SUB_TO_PARENT[subKey] || selectedCategory;
}

// IMAGE COMPRESSION + the category-chip picker, which shares this file
// section by position rather than topic (no header of its own).
// handlePhotoChange was registered here first (this cluster's removePhoto
// rebuild was its first delegated call site); ADD ITEM MODAL later
// converted its other two raw call sites (resetAddModal, index.html), so
// it now comes out of WINDOW EXPORTS entirely too, same as the rest of
// this block. selectCategory (an unused "legacy shim for AI auto-select",
// per its own comment, with zero call sites anywhere) was deleted rather
// than converted — same treatment as buildItemRowHTML/buildLocationFilterBar
// in FILTER HELPERS.
registerActions({
  removePhoto, handlePhotoChange, selectParentCategory, clearParentCategory,
  selectSubCategory,
});

// ─── BAKERY SEARCH ────────────────────────────────────────────────────────────
let searchTimeout;

export function showKnownBakeries() {
  if (selectedBakery) return; // already selected
  document.getElementById('bakeryResultsGoogle').innerHTML = '';
  const resultsEl = document.getElementById('bakeryResultsKnown');

  // Build sorted list of previously reviewed bakeries
  const bakeryMap = {};
  allItems.forEach(item => {
    if (!item.bakeryName) return;
    const key = item.bakeryName;
    if (!bakeryMap[key]) bakeryMap[key] = { name: item.bakeryName, address: item.bakeryAddress || '', placeId: item.bakeryPlaceId || null, lat: item.bakeryLat || null, lng: item.bakeryLng || null, count: 0 };
    bakeryMap[key].count++;
  });

  let known = Object.values(bakeryMap).sort((a, b) => b.count - a.count);
  if (!known.length) { resultsEl.innerHTML = ''; return; }

  // If we have location, sort by distance within equal review counts
  if (userLatLng && known.some(b => b.lat)) {
    known = known.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const da = a.lat ? distKm(userLatLng.lat, userLatLng.lng, a.lat, a.lng) : 999;
      const db = b.lat ? distKm(userLatLng.lat, userLatLng.lng, b.lat, b.lng) : 999;
      return da - db;
    });
  }

  resultsEl.innerHTML = `<div style="font-size:0.72rem; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px;">Previously reviewed</div>` +
    known.slice(0, 5).map(b => `
      <div data-onclick="selectBakery" data-args='${dataArgs([b.placeId || '', b.name, b.address])}'
        style="padding:10px 12px; background:var(--parchment); border-radius:var(--radius-sm); cursor:pointer; border:1.5px solid var(--sage); transition:border-color 0.2s; margin-bottom:6px;"
        onmouseover="this.style.borderColor='var(--honey)'" onmouseout="this.style.borderColor='var(--sage)'">
        <div style="font-size:0.88rem; font-weight:600; color:var(--espresso); display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.8rem;">📍</span> ${b.name}
          <span style="font-size:0.7rem; color:var(--sage); font-weight:500; margin-left:auto;">${b.count} review${b.count !== 1 ? 's' : ''}</span>
        </div>
        ${b.address ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${b.address}</div>` : ''}
      </div>`).join('');
}

// Track which known bakery names are currently shown, so Google results can skip duplicates
let knownMatchNamesLower = [];

export function renderKnownMatches(query) {
  const bakeryMap = {};
  allItems.forEach(item => {
    if (!item.bakeryName) return;
    const key = item.bakeryName;
    if (!bakeryMap[key]) bakeryMap[key] = { name: item.bakeryName, address: item.bakeryAddress || '', placeId: item.bakeryPlaceId || null, lat: item.bakeryLat || null, lng: item.bakeryLng || null, count: 0 };
    bakeryMap[key].count++;
  });

  const q = query.toLowerCase();
  let matches = Object.values(bakeryMap).filter(b =>
    b.name.toLowerCase().includes(q) || (b.address || '').toLowerCase().includes(q)
  );

  matches.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (userLatLng && a.lat && b.lat) {
      const da = distKm(userLatLng.lat, userLatLng.lng, a.lat, a.lng);
      const db = distKm(userLatLng.lat, userLatLng.lng, b.lat, b.lng);
      return da - db;
    }
    return 0;
  });

  const el = document.getElementById('bakeryResultsKnown');
  if (!matches.length) { el.innerHTML = ''; knownMatchNamesLower = []; return; }

  knownMatchNamesLower = matches.map(m => m.name.toLowerCase());

  el.innerHTML = `<div style="font-size:0.72rem; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--sage); margin-bottom:4px;">⭐ Already on Crumbz</div>` +
    matches.slice(0, 5).map(b => `
      <div data-onclick="selectBakery" data-args='${dataArgs([b.placeId || '', b.name, b.address])}'
        style="padding:10px 12px; background:var(--parchment); border-radius:var(--radius-sm); cursor:pointer; border:1.5px solid var(--sage); transition:border-color 0.2s; margin-bottom:6px;"
        onmouseover="this.style.borderColor='var(--honey)'" onmouseout="this.style.borderColor='var(--sage)'">
        <div style="font-size:0.88rem; font-weight:600; color:var(--espresso); display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.8rem;">📍</span> ${b.name}
          <span style="font-size:0.7rem; color:var(--sage); font-weight:500; margin-left:auto;">${b.count} review${b.count !== 1 ? 's' : ''}</span>
        </div>
        ${b.address ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${b.address}</div>` : ''}
      </div>`).join('');
}


// Takes the input element itself (delegate.js's trailing-clicked-element
// convention for handlers that need the live value) rather than a string —
// same as filterShareCandidates/searchExistingItems.
export function searchBakery(el) {
  const val = el.value;
  clearTimeout(searchTimeout);
  if (!val) { showKnownBakeries(); return; }
  if (val.length < 2) {
    document.getElementById('bakeryResultsKnown').innerHTML = '';
    document.getElementById('bakeryResultsGoogle').innerHTML = '';
    return;
  }
  // Show already-rated bakeries instantly — no network wait
  renderKnownMatches(val);
  searchTimeout = setTimeout(() => fetchBakeryPlaces(val), 400);
}

export async function fetchBakeryPlaces(query) {
  const googleEl = document.getElementById('bakeryResultsGoogle');
  if (!GOOGLE_MAPS_KEY) {
    googleEl.innerHTML = `
      <div style="font-size:0.8rem; color:var(--text-muted); padding:8px; background:var(--parchment); border-radius:var(--radius-sm);">
        Google Maps API key required. <strong><span style="cursor:pointer; color:var(--caramel);" data-onclick="selectManualBakery" data-args='${dataArgs([query])}'>Use "${query}" as entered →</span></strong>
      </div>`;
    return;
  }
  try {
    // Determine best location bias
    const profileCountry = allProfiles[currentUser?.uid]?.country || '';
    // Country bounding boxes for common cases
    const countryBoxes = {
      'United Kingdom':    { low: { latitude: 49.9, longitude: -8.2  }, high: { latitude: 60.9, longitude: 1.8  } },
      'France':            { low: { latitude: 41.3, longitude: -5.1  }, high: { latitude: 51.1, longitude: 9.6  } },
      'Germany':           { low: { latitude: 47.3, longitude:  5.9  }, high: { latitude: 55.1, longitude: 15.0 } },
      'Spain':             { low: { latitude: 36.0, longitude: -9.3  }, high: { latitude: 43.8, longitude: 4.3  } },
      'Italy':             { low: { latitude: 36.6, longitude:  6.6  }, high: { latitude: 47.1, longitude: 18.5 } },
      'Netherlands':       { low: { latitude: 50.8, longitude:  3.4  }, high: { latitude: 53.5, longitude: 7.2  } },
      'Australia':         { low: { latitude:-43.6, longitude: 113.3 }, high: { latitude:-10.7, longitude:153.6 } },
      'United States':     { low: { latitude: 24.5, longitude:-124.8 }, high: { latitude: 49.4, longitude:-66.9 } },
    };

    let locationBias;
    if (userLatLng) {
      locationBias = { circle: { center: { latitude: userLatLng.lat, longitude: userLatLng.lng }, radius: 25000 } };
    } else if (countryBoxes[profileCountry]) {
      locationBias = { rectangle: countryBoxes[profileCountry] };
    } else {
      // Default to UK
      locationBias = { rectangle: { low: { latitude: 49.9, longitude: -8.2 }, high: { latitude: 60.9, longitude: 1.8 } } };
    }

    const reqBody = { textQuery: query, locationBias };
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify(reqBody)
    });
    const data = await res.json();

    // Skip any Google result that's already shown as a known (already-rated) match
    const filtered = (data.places || []).filter(p => {
      const name = (p.displayName?.text || '').toLowerCase();
      return !knownMatchNamesLower.some(k => k === name || name.includes(k) || k.includes(name));
    });

    if (!filtered.length) {
      // Only show "no results" messaging if there were no known matches either
      if (!knownMatchNamesLower.length) {
        googleEl.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:8px;">No bakeries found — <span style="color:var(--caramel); cursor:pointer;" data-onclick="selectManualBakery" data-args='${dataArgs([query])}'>use this name anyway</span></div>`;
      } else {
        googleEl.innerHTML = '';
      }
      return;
    }

    const heading = knownMatchNamesLower.length
      ? `<div style="font-size:0.72rem; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin:8px 0 4px;">More options</div>`
      : '';

    googleEl.innerHTML = heading + filtered.slice(0, 5).map(p => {
      const lat = p.location?.latitude || '';
      const lng = p.location?.longitude || '';
      return `
      <div data-onclick="selectBakery" data-args='${dataArgs([p.id, p.displayName?.text || '', p.formattedAddress || '', lat, lng])}'
        style="padding:10px 12px; background:var(--parchment); border-radius:var(--radius-sm); cursor:pointer; border:1.5px solid var(--border); transition:border-color 0.2s; margin-bottom:6px;"
        onmouseover="this.style.borderColor='var(--honey)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:0.88rem; font-weight:600; color:var(--espresso);">${p.displayName?.text || ''}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${p.formattedAddress || ''}</div>
      </div>`;
    }).join('');
  } catch(e) {
    googleEl.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:8px;">Search unavailable — <span style="color:var(--caramel); cursor:pointer;" data-onclick="selectManualBakery" data-args='${dataArgs([query])}'>use this name anyway</span></div>`;
  }
}

export function selectBakery(placeId, name, address, lat, lng) {
  selectedBakery = { placeId, name, address, lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null };
  document.getElementById('bakerySearch').value = name;
  document.getElementById('bakeryResultsKnown').innerHTML = ''; document.getElementById('bakeryResultsGoogle').innerHTML = '';
  document.getElementById('selectedBakeryName').textContent = name;
  document.getElementById('selectedBakeryAddress').textContent = address;
  document.getElementById('locationSelected').classList.add('visible');
  // Re-run item search now we know the bakery
  const itemNameEl = document.getElementById('itemName');
  if (itemNameEl?.value && itemNameEl.value.length >= 2) searchExistingItems(itemNameEl);
  if (GOOGLE_MAPS_KEY) {
    document.getElementById('mapContainer').innerHTML = `
      <iframe width="100%" height="180" style="border:0;border-radius:var(--radius);"
        src="https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=place_id:${placeId}" allowfullscreen></iframe>`;
  }
}

export function selectManualBakery(name) {
  selectedBakery = { placeId: null, name, address: '' };
  document.getElementById('bakerySearch').value = name;
  document.getElementById('bakeryResultsKnown').innerHTML = ''; document.getElementById('bakeryResultsGoogle').innerHTML = '';
  document.getElementById('selectedBakeryName').textContent = name;
  document.getElementById('selectedBakeryAddress').textContent = 'Entered manually';
  document.getElementById('locationSelected').classList.add('visible');
}

export function clearBakery() {
  selectedBakery = null;
  document.getElementById('bakerySearch').value = '';
  document.getElementById('locationSelected').classList.remove('visible');
  document.getElementById('mapContainer').innerHTML = `<div class="map-placeholder"><div class="map-placeholder-icon">🗺️</div><div>Map will appear here once you select a bakery</div></div>`;
  // Clear item hints
  const matchResults = document.getElementById('itemMatchResults');
  if (matchResults) matchResults.innerHTML = '';
}

// searchBakery/selectBakery/clearBakery had no call sites outside this
// cluster, so all three come out of WINDOW EXPORTS entirely.
// renderKnownMatches/fetchBakeryPlaces never had any attribute call site of
// their own (only called internally by searchBakery) — also removed from
// WINDOW EXPORTS, they were never genuinely needed there. showKnownBakeries
// stays: index.html's #bakerySearch onfocus="if(!this.value)
// showKnownBakeries()" is delegate.js's one deliberately-unconverted
// onfocus site (see its own header comment — not worth wiring up for a
// single call site), so this is a real remaining raw call site, not
// staleness. selectManualBakery also stays, for a different reason: it has
// no raw call site left either, but tests/utils/reviews.js and several
// specs call window.selectManualBakery() directly to bypass the Google
// Places results UI (see that file's module comment) — removing it would
// break every spec that creates a review.
registerActions({ searchBakery, selectBakery, selectManualBakery, clearBakery });

// ─── RATING ───────────────────────────────────────────────────────────────────
export function updateOverallRating(val) {
  document.getElementById('overallRatingDisplay').textContent = parseFloat(val).toFixed(1);
}

// ─── MODAL STEPS ──────────────────────────────────────────────────────────────
export function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + step).classList.add('active');
  // Dots
  for (let i = 1; i <= totalSteps; i++) {
    const dot = document.getElementById('dot' + i);
    dot.classList.remove('active', 'done');
    if (i < step) dot.classList.add('done');
    else if (i === step) dot.classList.add('active');
  }
  document.getElementById('backBtn').style.display = step > 1 ? 'block' : 'none';
  const nextBtn = document.getElementById('nextBtn');
  nextBtn.disabled = false; // guard against it being stuck disabled from a prior save attempt
  if (step === totalSteps) {
    nextBtn.textContent = 'Save review ✓';
    nextBtn.className = 'btn-caramel';
    buildSummary();
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.className = 'btn-espresso';
  }
  document.getElementById('addModalTitle').textContent = ['Where did you find it?', 'What did you have?', 'Rate it', 'Final notes'][step - 1];
  // When entering step 2, re-run item search if name already filled (bakery now known)
  if (step === 2) {
    const nameEl = document.getElementById('itemName');
    if (nameEl?.value && nameEl.value.length >= 2) searchExistingItems(nameEl);
    // Also show items already at this bakery as hints
    else if (selectedBakery) showBakeryItemHints();
  }
}

export function showBakeryItemHints() {
  if (!selectedBakery) return;
  const bakeryName = selectedBakery.name.toLowerCase();
  const bakeryItems = allItemRecords.filter(r => r.bakeryName?.toLowerCase() === bakeryName).slice(0, 5);
  if (!bakeryItems.length) return;
  const el = document.getElementById('itemMatchResults');
  if (!el) return;
  el.innerHTML = `<div style="font-size:0.72rem; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px;">Already reviewed here</div>` +
    bakeryItems.map(r => {
      const catDisp = getCategoryDisplay(r);
      const score = r.communityAvg ? r.communityAvg.toFixed(1) : '–';
      const thumb = r.photoURL
        ? `<div class="item-match-thumb"><img src="${r.photoURL}" alt="${r.name}"></div>`
        : `<div class="item-match-thumb">${catDisp.emoji}</div>`;
      return `
        <div class="item-match-result" data-onclick="selectItemMatch" data-args='${dataArgs([r.id])}'>
          ${thumb}
          <div class="item-match-info">
            <div class="item-match-name">${r.name}</div>
            <div class="item-match-meta">${r.reviewCount || 0} review${(r.reviewCount||0) !== 1 ? 's' : ''}</div>
          </div>
          <div class="item-match-score">${score}</div>
        </div>`;
    }).join('');
}

export function modalNext() {
  // Per-step validation
  if (currentStep === 1) {
    if (!selectedBakery?.name && !document.getElementById('bakerySearch')?.value?.trim()) {
      showToast('Please select a bakery first');
      return;
    }
  }
  if (currentStep === 2) {
    const itemName = document.getElementById('itemName').value.trim();
    if (!itemName) {
      showToast('Please enter a name for your bake');
      document.getElementById('itemName').focus();
      return;
    }
    if (!selectedCategory) {
      showToast('Please select a category');
      return;
    }
  }
  if (currentStep === 3) {
    const rating = parseFloat(document.getElementById('overallRating').value);
    if (!rating || rating === 0) {
      showToast('Please give an overall rating');
      return;
    }
  }

  if (currentStep < totalSteps) {
    goToStep(currentStep + 1);
  } else {
    // saveReview() stays in legacy-app.js (Phase 7 dependency chain — see
    // this file's own header comment) — called through the shared action
    // registry instead of a direct import, to avoid this file importing
    // from legacy-app.js.
    getAction('saveReview')();
  }
}

export function modalBack() {
  if (currentStep > 1) goToStep(currentStep - 1);
}

// modalNext/modalBack's only call sites are index.html's Next/Back buttons
// (the modal's static footer) — both come out of WINDOW EXPORTS entirely.
// goToStep itself has no attribute call site anywhere (only called
// internally by these two plus resetAddModal), so it needs no registration.
registerActions({ modalNext, modalBack });

export function buildSummary() {
  const name = document.getElementById('itemName').value || 'Unknown bake';
  const bakery = selectedBakery?.name || 'Unknown bakery';
  const price = document.getElementById('itemPrice').value;
  const overall = parseFloat(document.getElementById('overallRating').value).toFixed(1);
  const catLabel = selectedSubCategory ? SUB_LABEL[selectedSubCategory] : (selectedCategory ? CATEGORY_TREE[selectedCategory]?.label : '');
  document.getElementById('reviewSummary').innerHTML = `
    <strong>${name}</strong> from <strong>${bakery}</strong>${price ? ` · <strong>£${parseFloat(price).toFixed(2)}</strong>` : ''}<br>
    Overall: <strong>${overall}/5</strong>${catLabel ? ` · ${catLabel}` : ''}`;
}

// ─── ITEM MATCHING ────────────────────────────────────────────────────────────
// allItemRecords/loadItemRecords moved to src/state/appState.js (2026-08-24,
// Phase 0 step 3b) — imported above.
export let matchedItemRecord = null; // existing itemRecord if user picks one

// Takes the input element itself (delegate.js's trailing-clicked-element
// convention for handlers that need the live value) rather than a string —
// same as filterShareCandidates. goToStep's own internal call (re-running
// the search on step re-entry) passes the #itemName element directly too.
export function searchExistingItems(el) {
  const query = el.value;
  matchedItemRecord = null;
  document.getElementById('itemMatchSelected').style.display = 'none';
  document.getElementById('categoryGroup').style.display = 'block';

  const resultsEl = document.getElementById('itemMatchResults');
  if (!query || query.length < 2) { resultsEl.innerHTML = ''; return; }

  // Filter by bakery if already selected, otherwise search all
  const bakeryName = selectedBakery?.name || null;
  const q = query.toLowerCase();

  let matches = allItemRecords.filter(r => {
    const nameMatch = r.name?.toLowerCase().includes(q);
    // If bakery selected, filter to that bakery first; otherwise show all matches
    const bakeryMatch = !bakeryName || r.bakeryName?.toLowerCase() === bakeryName.toLowerCase();
    return nameMatch && bakeryMatch;
  }).slice(0, 5);



  let html = matches.map(r => {
    const catDisp = getCategoryDisplay(r);
    const score = r.communityAvg ? r.communityAvg.toFixed(1) : '–';
    const count = r.reviewCount || 0;
    const thumb = r.photoURL
      ? `<div class="item-match-thumb"><img src="${r.photoURL}" alt="${r.name}"></div>`
      : `<div class="item-match-thumb">${catDisp.emoji}</div>`;
    return `
      <div class="item-match-result" data-onclick="selectItemMatch" data-args='${dataArgs([r.id])}'>
        ${thumb}
        <div class="item-match-info">
          <div class="item-match-name">${r.name}</div>
          <div class="item-match-meta">📍 ${r.bakeryName} · <strong>${count} community review${count !== 1 ? 's' : ''}</strong></div>
        </div>
        <div class="item-match-score">${score}</div>
      </div>`;
  }).join('');

  // Always show "create new" option
  html += `<button class="item-match-new" data-onclick="createNewItem">✦ Add "${query}" as a new item</button>`;
  resultsEl.innerHTML = html;
}

export function selectItemMatch(recordId) {
  const record = allItemRecords.find(r => r.id === recordId);
  if (!record) return;
  matchedItemRecord = record;

  // Pre-fill fields from existing record
  document.getElementById('itemName').value = record.name;
  document.getElementById('itemMatchResults').innerHTML = '';
  document.getElementById('itemMatchSelected').style.display = 'block';
  document.getElementById('matchedItemName').textContent = record.name;
  document.getElementById('matchedItemMeta').textContent =
    `📍 ${record.bakeryName} · ${record.reviewCount || 0} review${(record.reviewCount||0) !== 1 ? 's' : ''} · avg ${record.communityAvg ? record.communityAvg.toFixed(1) : '–'}`;

  // Auto-select bakery if not already selected
  if (!selectedBakery && record.bakeryName) {
    selectedBakery = { name: record.bakeryName, address: record.bakeryAddress || '', placeId: record.bakeryPlaceId || null };
    document.getElementById('bakerySearch').value = record.bakeryName;
    document.getElementById('selectedBakeryName').textContent = record.bakeryName;
    document.getElementById('selectedBakeryAddress').textContent = record.bakeryAddress || '';
    document.getElementById('locationSelected').classList.add('visible');
  }

  // Auto-select category
  if (record.category) {
    selectParentCategory(record.category);
    if (record.subCategory) {
      setTimeout(() => {
        const subChip = document.querySelector(`#categorySubChips .category-chip[data-subcat="${record.subCategory}"]`);
        if (subChip) selectSubCategory(record.subCategory, subChip);
      }, 50);
    }
  }

  // Hide category group — already set from record
  document.getElementById('categoryGroup').style.display = 'none';
}

export function createNewItem() {
  matchedItemRecord = null;
  document.getElementById('itemMatchResults').innerHTML = '';
  document.getElementById('itemMatchSelected').style.display = 'none';
  document.getElementById('categoryGroup').style.display = 'block';
}

export function clearItemMatch() {
  matchedItemRecord = null;
  document.getElementById('itemMatchSelected').style.display = 'none';
  document.getElementById('itemMatchResults').innerHTML = '';
  document.getElementById('categoryGroup').style.display = 'block';
  document.getElementById('itemName').value = '';
  document.getElementById('itemName').focus();
}

export function prefillItemForReview(recordId) {
  openAddModal();
  if (!recordId) return;
  setTimeout(() => {
    const record = allItemRecords.find(r => r.id === recordId);
    if (record) {
      document.getElementById('itemName').value = record.name;
      selectItemMatch(recordId);
    }
  }, 100);
}

// selectItemMatch/createNewItem/clearItemMatch/searchExistingItems had no
// call sites outside this cluster, so all four come out of WINDOW EXPORTS
// entirely.
registerActions({ selectItemMatch, createNewItem, clearItemMatch, searchExistingItems });

export function openAddModalForBakery(name, address, placeId, lat, lng) {
  openAddModal();
  setTimeout(() => {
    // Pre-fill bakery on step 1
    selectedBakery = { name, address, placeId: placeId || null, lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null };
    document.getElementById('bakerySearch').value = name;
    document.getElementById('selectedBakeryName').textContent = name;
    document.getElementById('selectedBakeryAddress').textContent = address;
    document.getElementById('locationSelected').classList.add('visible');
    showKnownBakeries();
  }, 100);
}

// closeAddModal/prefillItemForReview/openAddModalForBakery register from
// here now — pulled out of three bulk registerActions() calls in
// legacy-app.js that mix several other not-yet-extracted clusters' own
// functions (the shared modal-close block; the item detail modal's own
// block, alongside flagReview which stays; and the bakery-profile-modal
// bulk open-modal block, alongside switchBakeryTab/openManageShopModal/
// etc. which stay).
registerActions({ closeAddModal, prefillItemForReview, openAddModalForBakery });
