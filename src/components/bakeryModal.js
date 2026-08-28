// ─── BAKERY PROFILE MODAL ───────────────────────────────────────────────────
// Extracted from src/legacy-app.js (2026-08-25, Phase 5 step 21).
// The bakery-profile-modal cluster lived inside legacy-app.js's "FILTER
// HELPERS" grab-bag section, mixed with the Profile modal (openProfileModal/
// closeProfileModal/switchProfileTab — now src/components/profileModal.js,
// Phase 5 step 22) and the People page (already extracted, Phase 3 step 15)
// — exactly the "splits three ways" shape CLAUDE.md's plan already flagged
// before this extraction started. Verified by reading each function's own
// dependencies, not by trusting the section heading, per steps 19/20's own
// lesson that this plan has twice found functions living under the "wrong"
// apparent heading.
//
// buildCategoryFilterBar moved here too, even though openProfileModal (not
// moving) also calls it — it's a completely pure, stateless UI-string
// builder (only CATEGORY_TREE + dataArgs, both already available), the
// same "shared, zero-risk value gets a real home" treatment GOOGLE_MAPS_KEY
// got in Phase 4 step 18. Originally imported back into legacy-app.js for
// openProfileModal's own use; now that openProfileModal has moved to
// src/components/profileModal.js (Phase 5 step 22), that file imports
// buildCategoryFilterBar directly from here instead — an ordinary
// leaf-to-leaf import, no cycle, since nothing in this file calls back into
// profileModal.js — the same shape as qrCode.js importing markCollected
// from manageOfferingsModal.js.
//
// isBookmarked moved to src/state/appState.js instead of here (alongside
// userBookmarks, matching the isAdmin/isBusiness/ownsBakery pattern already
// there) rather than living in whichever cluster happened to need it first
// — it has two external callers post-move (this file's own
// openBakeryProfile, and src/pages/bakeries.js's renderBakeries — the latter
// in legacy-app.js until Phase 7 step 26),
// so "moves with its sole caller" (step 19's isSavedItem precedent) didn't
// apply cleanly; co-locating it with the state it reads sidesteps the
// two-caller question entirely, with zero cycle risk.
//
// openBakeryProfile calls getAction('buildBakeryIndex')() instead of a
// direct import — buildBakeryIndex() itself stays in legacy-app.js because
// it reads exploreCache, owned by the not-yet-extracted Explore page
// (already flagged as a Phase 7 step 29 follow-up in CLAUDE.md, Phase 0
// step 3b's own note). openBakeryProfile is the unavoidable core of this
// whole cluster — deferring it would mean not extracting bakeryModal.js at
// all — so this reuses the getAction() action-registry lookup pattern from
// Phase 4 step 18 (modalNext → saveReview) instead of a forbidden direct
// import back into legacy-app.js. legacy-app.js registers buildBakeryIndex
// via a new registerActions() call for this lookup to resolve.
//
// reserveOffering — brought in this step per explicit instruction, after
// confirming (re-reading, not trusting step 16's note alone) that it does
// belong here: it's the "Reserve" flow reached from a bakery profile's own
// Pre-order tab, the exact cluster step 16 deliberately left out of
// reservations.js for this reason. It calls getAction('loadMyPreorders')()
// and getAction('renderPreorderPage')() for the same reason as
// buildBakeryIndex above — both stay in legacy-app.js (Phase 7 steps 31 and
// 30 respectively, both distant), and reserveOffering itself can't be
// deferred without abandoning the very flow this step was asked to bring
// in. loadMyPreorders gets a new registerActions() call in legacy-app.js
// for this lookup; renderPreorderPage already had one (pre-existing, no
// markup call site of its own — reused as-is, not added by this step).
import { registerActions, getAction } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { GOOGLE_MAPS_KEY } from '../config.js';
import { CATEGORY_TREE, getCategoryDisplay } from '../data/categories.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { allBakeries, allItems, allItemRecords, currentUser, fb, ownsBakery, isBookmarked } from '../state/appState.js';
import { openAuthModal } from './authModal.js';
import { allProducts, loadProducts, productCardHTML } from '../pages/shop.js';

async function fetchPlaceDetails(placeId) {
  if (!placeId || !GOOGLE_MAPS_KEY) return null;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,regularOpeningHours,location,rating,userRatingCount'
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}

function buildOpeningHoursHTML(openingHours) {
  if (!openingHours?.weekdayDescriptions?.length) return '';
  const days = openingHours.weekdayDescriptions;
  const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
  const isOpenNow = openingHours.openNow;
  const statusBadge = isOpenNow !== undefined
    ? `<span class="bakery-hours-status ${isOpenNow ? 'open' : 'closed'}">${isOpenNow ? 'Open now' : 'Closed'}</span>`
    : '';
  const daysHTML = days.map((d, i) => {
    const [day, ...rest] = d.split(': ');
    return `<div class="bakery-hours-day${i === todayIdx ? ' today' : ''}">
      <span>${day}</span><span>${rest.join(': ') || 'Closed'}</span>
    </div>`;
  }).join('');
  return `
    <div>
      <button class="bakery-hours-toggle" data-onclick="toggleBakeryHours">
        <span class="bakery-info-icon">🕐</span>
        <span>Opening hours</span>
        ${statusBadge}
        <span class="bakery-hours-chevron">▼</span>
      </button>
      <div class="bakery-hours-list">${daysHTML}</div>
    </div>`;
}

function toggleBakeryHours(btn) {
  const list = btn.nextElementSibling;
  const chevron = btn.querySelector('.bakery-hours-chevron');
  const isOpen = list.classList.toggle('open');
  chevron.classList.toggle('open', isOpen);
}

function buildBakeryMapHTML(placeId, lat, lng, name) {
  if (placeId && GOOGLE_MAPS_KEY) {
    return `<iframe class="bakery-map" loading="lazy"
      src="https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=place_id:${placeId}&zoom=15"
      allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  }
  if (lat && lng && GOOGLE_MAPS_KEY) {
    return `<iframe class="bakery-map" loading="lazy"
      src="https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_KEY}&center=${lat},${lng}&zoom=15"
      allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  }
  return '';
}

// argsFor(cat) builds the full, explicit argument list for one chip's click,
// including any trailing parameters the target function declares beyond the
// category — e.g. cat => [uid, cat, ''] for openProfileModal(uid, catFilter,
// locFilter). This has to be explicit: the clicked chip itself is always
// appended as one more argument after data-args (our usual convention), so
// any parameter the caller doesn't fill in here would otherwise silently
// receive the button element instead of its intended default.
export function buildCategoryFilterBar(items, activeCategory, fnName, argsFor) {
  const cats = [...new Set(items.map(i => i.category).filter(Boolean))];
  if (cats.length <= 1) return '';
  const allBtn = `<button class="filter-chip${!activeCategory ? ' active' : ''}" data-onclick="${fnName}" data-args='${dataArgs(argsFor(''))}'>All</button>`;
  const catBtns = cats.map(cat => {
    const label = CATEGORY_TREE[cat]?.label || cat;
    const emoji = CATEGORY_TREE[cat]?.emoji || '✦';
    return `<button class="filter-chip${activeCategory === cat ? ' active' : ''}" data-onclick="${fnName}" data-args='${dataArgs(argsFor(cat))}'>${emoji} ${label}</button>`;
  }).join('');
  return `<div class="filter-bar">${allBtn}${catBtns}</div>`;
}

let bakeryActiveCatFilter = '';

export async function openBakeryProfile(bakeryName, catFilter, googleData) {
  getAction('buildBakeryIndex')();
  let b = allBakeries[bakeryName];

  if (!b && googleData) {
    // Not yet reviewed on Crumbz — build a synthetic bakery record from Google data
    b = {
      name: bakeryName,
      address: googleData.address || '',
      placeId: googleData.placeId || null,
      lat: googleData.lat || null,
      lng: googleData.lng || null,
      items: [],
      totalScore: 0
    };
  }

  if (!b) {
    // Bakery exists in name but has no items and no Google data — show basic empty state
    document.getElementById('bakeryModalTitle').textContent = bakeryName;
    document.getElementById('bakeryModal').classList.add('open');
    lockScroll();
    document.getElementById('bakeryModalContent').innerHTML = `
      <div class="bakery-profile-header">
        <div class="bakery-profile-name">${bakeryName}</div>
      </div>
      <div class="bakery-profile-body">
        <div class="empty-state"><div class="empty-state-icon">🥐</div><div class="empty-state-title">No reviews yet</div></div>
      </div>`;
    return;
  }
  bakeryActiveCatFilter = catFilter || '';
  document.getElementById('bakeryModalTitle').textContent = bakeryName;
  document.getElementById('bakeryModal').classList.add('open');
  lockScroll();

  // Fetch blurb from Firestore
  let blurb = b.blurb || '';
  try {
    const { db, doc, getDoc } = fb;
    const snap = await getDoc(doc(db, 'bakeries', encodeURIComponent(bakeryName)));
    if (snap.exists()) blurb = snap.data().blurb || '';
  } catch(e) {}

  const avg = b.items.length ? (b.totalScore / b.items.length).toFixed(1) : '–';
  const sortedItems = [...b.items].sort((x,y) => (y.communityAvg||y.overallRating||0) - (x.communityAvg||x.overallRating||0));
  const canEdit = !!currentUser;
  const isOwner = ownsBakery(bakeryName);
  const canManage = isOwner;

  const filtered = bakeryActiveCatFilter
    ? sortedItems.filter(i => i.category === bakeryActiveCatFilter)
    : sortedItems;

  const catFilterBar = buildCategoryFilterBar(
    sortedItems,
    bakeryActiveCatFilter,
    'openBakeryProfile',
    cat => [bakeryName, cat, null]
  );

  const itemsHTML = filtered.map(item => {
    const catDisp = getCategoryDisplay(item);
    const score = item.communityAvg ? item.communityAvg.toFixed(1) : (item.overallRating ? item.overallRating.toFixed(1) : '–');
    const thumb = item.photoURL
      ? `<div class="bakery-item-thumb"><img src="${item.photoURL}" alt="${item.name}"></div>`
      : `<div class="bakery-item-thumb">${catDisp.emoji}</div>`;
    const rec2 = item.itemRecordId ? allItemRecords.find(r => r.id === item.itemRecordId) : null;
    const avgP2 = rec2?.avgPrice ?? item.price ?? null;
    const avgPStr = avgP2 !== null ? ('£' + parseFloat(avgP2).toFixed(2) + (rec2 && rec2.priceCount > 1 ? ' avg' : '')) : '';
    return `
      <div class="bakery-item-row" data-onclick="closeBakeryModal,openDetail" data-args='${dataArgs([item.id])}'>
        ${thumb}
        <div class="bakery-item-info">
          <div class="bakery-item-name">${item.name || 'Unknown bake'}</div>
          <div class="bakery-item-meta">${catDisp.sub || catDisp.main} · ${item.userName || 'Anonymous'}${avgPStr ? ` · <span style="color:var(--sage);font-weight:600;">${avgPStr}</span>` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div class="bakery-item-score">${score}</div>
        </div>
      </div>`;
  }).join('');

  // Load full bakery data including cover photo, social links
  let fullBakeryData = {};
  try {
    const { db, doc, getDoc } = fb;
    const bSnap = await getDoc(doc(db, 'bakeries', encodeURIComponent(bakeryName)));
    if (bSnap.exists()) fullBakeryData = bSnap.data();
  } catch(e) {}

  // Find placeId from items
  const placeId = b.placeId || fullBakeryData.placeId || null;
  const lat = b.lat || null;
  const lng = b.lng || null;

  // Fetch Google Place Details (phone, hours, website)
  let placeDetails = null;
  if (placeId) placeDetails = await fetchPlaceDetails(placeId);

  const coverPhoto = fullBakeryData.coverPhotoURL
    ? `<img src="${fullBakeryData.coverPhotoURL}" class="bakery-cover" alt="${bakeryName}">`
    : '';

  // Map
  const mapHTML = buildBakeryMapHTML(placeId, lat, lng, bakeryName);

  // Info panel — website, phone, hours
  const websiteUrl = placeDetails?.websiteUri || fullBakeryData.website || null;
  const phone = placeDetails?.internationalPhoneNumber || placeDetails?.nationalPhoneNumber || null;
  const hoursHTML = buildOpeningHoursHTML(placeDetails?.regularOpeningHours);
  const googleRating = placeDetails?.rating;
  const googleReviewCount = placeDetails?.userRatingCount;

  const infoPanelRows = [];
  if (websiteUrl) {
    const display = websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    infoPanelRows.push(`<div class="bakery-info-row">
      <span class="bakery-info-icon">🌐</span>
      <a href="${websiteUrl}" target="_blank" rel="noopener" class="bakery-info-link">${display}</a>
    </div>`);
  }
  if (fullBakeryData.instagram) {
    infoPanelRows.push(`<div class="bakery-info-row">
      <span class="bakery-info-icon">📸</span>
      <a href="https://instagram.com/${fullBakeryData.instagram}" target="_blank" rel="noopener" class="bakery-info-link">@${fullBakeryData.instagram}</a>
    </div>`);
  }
  if (phone) {
    infoPanelRows.push(`<div class="bakery-info-row">
      <span class="bakery-info-icon">📞</span>
      <a href="tel:${phone.replace(/\s/g,'')}" class="bakery-info-link">${phone}</a>
    </div>`);
  }
  if (b.address) {
    const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bakeryName + ' ' + b.address)}${placeId ? `&query_place_id=${placeId}` : ''}`;
    infoPanelRows.push(`<div class="bakery-info-row">
      <span class="bakery-info-icon">📍</span>
      <span style="color:var(--text-muted);">${b.address}</span>
      <a href="${directionsUrl}" target="_blank" rel="noopener" style="margin-left:8px;font-size:0.78rem;color:var(--caramel);font-weight:600;text-decoration:none;">Directions ↗</a>
    </div>`);
  }
  if (hoursHTML) infoPanelRows.push(hoursHTML);
  if (googleRating) {
    infoPanelRows.push(`<div class="bakery-info-row">
      <span class="bakery-info-icon">⭐</span>
      <span style="color:var(--text-muted);">${googleRating} on Google${googleReviewCount ? ` (${googleReviewCount.toLocaleString()} reviews)` : ''}</span>
    </div>`);
  }

  const infoPanelHTML = infoPanelRows.length
    ? `<div class="bakery-info-panel">${infoPanelRows.join('')}</div>`
    : '';

  const socialHTML = ''; // now handled in info panel

  const isClaimed = !!fullBakeryData.ownedBy;
  const claimedBadge = isClaimed ? `<span class="claimed-badge">✓ Claimed</span>` : '';

  try { document.getElementById('bakeryModalContent').innerHTML = `
    ${mapHTML}
    ${infoPanelHTML}
    ${coverPhoto}
    <div class="bakery-profile-header">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
        <div>
          <div class="bakery-profile-name">${bakeryName}${claimedBadge}</div>
        </div>
        ${isOwner ? `<button class="btn-caramel" style="font-size:0.78rem;padding:7px 12px;white-space:nowrap;flex-shrink:0;" data-onclick="closeBakeryModal,openBakeryEditModal" data-args='${dataArgs([bakeryName])}'>✏️ Edit page</button>` : ''}
        ${currentUser ? `<button class="bookmark-btn${isBookmarked(bakeryName) ? ' saved' : ''}" id="bakeryModalBookmarkBtn" data-onclick="toggleBookmark" data-args='${dataArgs([bakeryName, b.address || ''])}' title="${isBookmarked(bakeryName) ? 'Remove bookmark' : 'Save bakery'}">🔖</button>` : ''}
      </div>
      ${socialHTML}
      <div class="bakery-profile-scores" style="margin-top:16px;">
        <div class="bakery-profile-score">
          <div class="bakery-profile-score-num">${avg}</div>
          <div class="bakery-profile-score-label">Avg rating</div>
        </div>
        <div class="bakery-profile-score">
          <div class="bakery-profile-score-num">${b.items.length}</div>
          <div class="bakery-profile-score-label">Reviews</div>
        </div>
        <div class="bakery-profile-score">
          <div class="bakery-profile-score-num">${new Set(b.items.map(i=>i.category)).size}</div>
          <div class="bakery-profile-score-label">Item types</div>
        </div>
      </div>
    </div>
    <div class="bakery-profile-body">
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        ${canManage ? `<button class="btn-caramel" style="font-size:0.82rem;padding:8px 16px;" data-onclick="closeBakeryModal,openManageBakeryModal" data-args='${dataArgs([bakeryName])}'>✏️ Edit page</button>` : ''}
        ${canManage ? `<button class="btn-espresso" style="font-size:0.82rem;padding:8px 16px;" data-onclick="closeBakeryModal,openManageShopModal" data-args='${dataArgs([bakeryName])}'>🛍️ Manage shop</button>` : ''}
        ${canManage ? `<button class="btn-espresso" style="font-size:0.82rem;padding:8px 16px;" data-onclick="openManagePreordersModal" data-args='${dataArgs([bakeryName])}'>🗓️ Manage pre-orders</button>` : ''}
      </div>
      ${blurb ? `<div class="bakery-blurb-section"><div class="bakery-blurb-text">"${blurb}"</div></div>` : (!isOwner ? '' : `<div class="bakery-blurb-section"><div class="bakery-blurb-text" style="color:var(--text-muted);font-style:normal;">No description yet.</div></div>`)}
      <div class="bakery-profile-tabs">
        <div class="profile-tab active" data-onclick="switchBakeryTab" data-args='${dataArgs(['reviews', bakeryName])}'>Reviews</div>
        <div class="profile-tab" data-onclick="switchBakeryTab" data-args='${dataArgs(['shop', bakeryName])}'>🛍️ Shop</div>
        <div class="profile-tab" data-onclick="switchBakeryTab" data-args='${dataArgs(['preorder', bakeryName])}'>🗓️ Pre-order</div>
      </div>
      <div id="bakeryTabContent">
      ${catFilterBar}
      <div class="bakery-items-title">${bakeryActiveCatFilter ? CATEGORY_TREE[bakeryActiveCatFilter]?.label + ' reviews' : 'All reviews'} (${filtered.length})</div>
      ${b.items.length === 0
        ? `<div class="empty-state" style="padding:32px 0;">
            <div class="empty-state-icon">🥐</div>
            <div class="empty-state-title">Not yet reviewed on Crumbz</div>
            <div class="empty-state-text">Be the first to try something here and share your rating.</div>
            <button class="btn-espresso" style="margin-top:14px;" data-onclick="closeBakeryModal,openAddModalForBakery" data-args='${dataArgs([bakeryName, b.address || '', b.placeId || '', b.lat || '', b.lng || ''])}'>+ Be first to review</button>
          </div>`
        : `<div>${itemsHTML || '<div class="empty-state" style="padding:24px 0;"><div class="empty-state-icon">🥐</div><div class="empty-state-title">No reviews in this category</div></div>'}</div>`}
      </div>
    </div>`; } catch(err) { console.error('Bakery render error:', err); document.getElementById('bakeryModalContent').innerHTML = '<div style="padding:24px;">Error loading bakery. Check console.</div>'; }
}

export function closeBakeryModal() {
  document.getElementById('bakeryModal').classList.remove('open');
  unlockScroll();
}

export async function switchBakeryTab(tab, bakeryName, tabEl) {
  document.querySelectorAll('.bakery-profile-tabs .profile-tab').forEach(t => t.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');
  const content = document.getElementById('bakeryTabContent');
  if (!content) return;
  if (tab === 'reviews') {
    openBakeryProfile(bakeryName, bakeryActiveCatFilter);
    return;
  }
  if (tab === 'preorder') {
    content.innerHTML = '<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div></div>';
    await renderPreorderTab(content, bakeryName);
    return;
  }
  // Shop tab
  content.innerHTML = '<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div></div>';
  await loadProducts();
  const bakeryProducts = allProducts.filter(p => p.bakeryName === bakeryName && p.available !== false);
  if (!bakeryProducts.length) {
    content.innerHTML = '<div class="empty-state" style="padding:32px 0;"><div class="empty-state-icon">🛍️</div><div class="empty-state-title">No products yet</div><div class="empty-state-text">This bakery hasn\'t added any merchandise yet.</div></div>';
    return;
  }
  content.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;padding-top:8px;">${bakeryProducts.map(p => productCardHTML(p, false)).join('')}</div>`;
}

// ── Customer: browse & reserve (the "Reserve" flow from a bakery profile's
// own Pre-order tab — deliberately left out of reservations.js at Phase 3
// step 16, brought in here per this step's own explicit instruction) ──────
async function renderPreorderTab(container, bakeryName) {
  if (!fb) { container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Not available</div></div>'; return; }
  const { db, collection, query, where, getDocs } = fb;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  try {
    const snap = await getDocs(query(collection(db, 'preorderOfferings'),
      where('bakeryName','==',bakeryName), where('active','==',true)));

    // Filter to upcoming dates only, check goLiveAt
    const offerings = snap.docs.map(d => ({id: d.id, ...d.data()}))
      .filter(o => {
        if (o.collectDate < todayStr) return false; // past
        // Check go-live time
        const goLive = o.goLiveAt ? new Date(o.goLiveAt) : (() => {
          const d = new Date(o.collectDate + 'T00:00:00');
          d.setDate(d.getDate() - 1); d.setHours(8,0,0,0); return d;
        })();
        return now >= goLive;
      })
      .sort((a,b) => a.collectDate.localeCompare(b.collectDate) || a.slot.localeCompare(b.slot));

    // Check if there are upcoming not-yet-live offerings
    const upcomingSnap = await getDocs(query(collection(db, 'preorderOfferings'),
      where('bakeryName','==',bakeryName), where('active','==',true)));
    const notYetLive = upcomingSnap.docs.map(d => ({id:d.id,...d.data()})).filter(o => {
      if (o.collectDate < todayStr) return false;
      const goLive = o.goLiveAt ? new Date(o.goLiveAt) : (() => {
        const d = new Date(o.collectDate + 'T00:00:00');
        d.setDate(d.getDate() - 1); d.setHours(8,0,0,0); return d;
      })();
      return now < goLive;
    });

    if (!offerings.length) {
      const teaser = notYetLive.length ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;">🕐 Pre-orders open ${new Date(notYetLive[0].collectDate + 'T00:00:00').toLocaleDateString('en-GB',{weekday:'long'})} at 8am</div>` : '';
      container.innerHTML = `<div class="empty-state" style="padding:32px 0;">
        <div class="empty-state-icon">🗓️</div>
        <div class="empty-state-title">No pre-orders available yet</div>
        <div class="empty-state-text">Check back later — this bakery hasn't listed any items yet.</div>
        ${teaser}
      </div>`;
      return;
    }

    // Group by collectDate
    const byDate = {};
    offerings.forEach(o => {
      if (!byDate[o.collectDate]) byDate[o.collectDate] = [];
      byDate[o.collectDate].push(o);
    });

    container.innerHTML = Object.entries(byDate).map(([date, dateOfferings]) => {
      const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
      return `
        <div style="padding:8px 0 4px;font-size:0.82rem;font-weight:700;color:var(--espresso);">Collection: ${dateLabel}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-bottom:20px;">
          ${dateOfferings.map(o => {
            const remaining = o.remaining ?? o.quantity ?? 0;
            const soldOut = remaining <= 0;
            return `<div class="preorder-card">
              ${o.photoURL ? `<img src="${o.photoURL}" class="preorder-img" alt="${o.name}">` : `<div class="preorder-img">🥐</div>`}
              <div class="preorder-body">
                <div class="preorder-name">${o.name}</div>
                ${o.description ? `<div class="preorder-desc">${o.description}</div>` : ''}
                <div class="preorder-meta">
                  <span class="preorder-slot">🕐 ${o.slot}</span>
                  <span class="preorder-qty${remaining <= 2 && !soldOut ? ' low' : ''}">${soldOut ? 'Sold out' : `${remaining} left`}</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <span class="preorder-price">£${parseFloat(o.price||0).toFixed(2)}</span>
                  ${soldOut
                    ? `<button class="btn-ghost" disabled style="opacity:0.4;font-size:0.78rem;">Sold out</button>`
                    : currentUser
                      ? `<button class="btn-espresso" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openReserveModal" data-args='${dataArgs([o.id, bakeryName, o.name, o.slot, date, o.remaining??o.quantity??0, o.maxPerPerson||2])}'>Reserve</button>`
                      : `<button class="btn-espresso" style="font-size:0.78rem;padding:7px 14px;" data-onclick="openAuthModal">Sign in</button>`}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load pre-orders.</div>';
    console.error(e);
  }
}

function openReserveModal(offeringId, bakeryName, offeringName, slot, collectDate, remaining, maxPerPerson) {
  const max = Math.min(remaining, maxPerPerson || 2);
  if (max <= 1) {
    reserveOffering(offeringId, bakeryName, offeringName, slot, collectDate, 1);
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'reserveModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:flex-end;justify-content:center;';
  const options = Array.from({length: max}, (_,i) => i+1).map(n =>
    `<button data-onclick="closeReserveModal,reserveOffering" data-args='${dataArgs([offeringId, bakeryName, offeringName, slot, collectDate, n])}'
      style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 20px;border:none;border-bottom:1px solid var(--border);background:none;cursor:pointer;font-size:0.92rem;color:var(--espresso);"
      onmouseover="this.style.background='var(--parchment)'" onmouseout="this.style.background='none'">
      <span>${n}× ${offeringName}</span>
      <span class="qty-price-${offeringId}-${n}" style="font-weight:700;color:var(--caramel);">…</span>
    </button>`).join('');
  overlay.innerHTML = `
    <div style="background:var(--cream-white);border-radius:var(--radius) var(--radius) 0 0;width:100%;max-width:480px;">
      <div style="padding:16px 20px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--espresso);">How many would you like?</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${offeringName} · max ${maxPerPerson} per person · ${remaining} left</div>
        </div>
        <button data-onclick="closeReserveModal" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <div>${options}</div>
      <div style="padding:12px 20px 32px;">
        <button class="btn-ghost" style="width:100%;" data-onclick="closeReserveModal">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeReserveModal(); });
  // Load price
  if (fb) {
    const { db, doc, getDoc } = fb;
    getDoc(doc(db, 'preorderOfferings', offeringId)).then(snap => {
      if (!snap.exists()) return;
      const price = snap.data().price || 0;
      Array.from({length: max}, (_,i) => i+1).forEach(n => {
        document.querySelectorAll(`.qty-price-${offeringId}-${n}`).forEach(el => {
          el.textContent = `£${(price * n).toFixed(2)}`;
        });
      });
    });
  }
}

function closeReserveModal() {
  document.getElementById('reserveModalOverlay')?.remove();
}

async function reserveOffering(offeringId, bakeryName, offeringName, slot, collectDate, quantity) {
  quantity = quantity || 1;
  if (!currentUser || !fb) { openAuthModal(); return; }
  const { db, doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs } = fb;
  try {
    const offeringRef = doc(db, 'preorderOfferings', offeringId);
    const offeringSnap = await getDoc(offeringRef);
    if (!offeringSnap.exists()) throw new Error('Offering no longer exists');
    const data = offeringSnap.data();
    const remaining = data.remaining ?? data.quantity ?? 0;
    const maxPerPerson = data.maxPerPerson || 2;
    if (remaining <= 0 || quantity > remaining) throw new Error('SOLD_OUT');
    if (quantity > maxPerPerson) { showToast(`Maximum ${maxPerPerson} per person`); return; }
    const existingSnap = await getDocs(query(
      collection(db, 'reservations'),
      where('userId', '==', currentUser.uid),
      where('offeringId', '==', offeringId),
      where('status', '==', 'pending')
    ));
    if (!existingSnap.empty) { showToast('You already have a reservation for this item'); return; }
    await updateDoc(offeringRef, { remaining: remaining - quantity });
    // Note: this updateDoc requires the Firestore rule to allow authenticated users to update 'remaining'
    // Make sure your rules allow: allow update: if request.auth != null && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['remaining']);
    await addDoc(collection(db, 'reservations'), {
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Customer',
      userEmail: currentUser.email || '',
      bakeryName, offeringId, offeringName, slot, collectDate,
      quantity, status: 'pending',
      price: data.price,
      totalPrice: (data.price || 0) * quantity,
      createdAt: serverTimestamp()
    });
    showToast(`🎉 Reserved ${quantity > 1 ? quantity + '× ' : ''}${offeringName}! Collect ${slot}. Pay in store.`);
    getAction('loadMyPreorders')(); // Update burger menu badge
    const bakeryContent = document.getElementById('bakeryTabContent');
    if (bakeryContent) await renderPreorderTab(bakeryContent, bakeryName);
    const poResults = document.getElementById('preorderPageResults');
    if (poResults) await getAction('renderPreorderPage')();
  } catch(e) {
    if (e.message === 'SOLD_OUT') showToast('😔 Sorry — not enough stock. Someone got there first.');
    else if (e.message !== 'Offering no longer exists') { showToast('Could not complete reservation'); console.error(e); }
  }
}

registerActions({ openBakeryProfile, closeBakeryModal, switchBakeryTab, toggleBakeryHours, openReserveModal, closeReserveModal, reserveOffering });
