// ─── LEADERBOARD PAGE ───────────────────────────────────────────────────────
// The #page-leaderboard routed view (pages/components carving, Phase 7
// step 27 — see CLAUDE.md). Moved: lbCurrentMode/lbCurrentTab (module
// state), switchLbMode, populateLbLocationFilter, onLbFilterChange,
// getLbFilters, switchLbTab, renderBakeryLeaderboard, closeLbAndOpenBakery,
// renderLeaderboard.
//
// buildBakeryIndex() did NOT move — it reads exploreCache, owned by the
// not-yet-extracted Explore page (Phase 7 step 29). renderBakeryLeaderboard
// reaches it via getAction('buildBakeryIndex')() rather than a forbidden
// direct import back, the same pattern bakeryModal.js (step 21),
// adminPanel.js (step 23) and bakeries.js (step 26) already use.
//
// openBakeryProfile is imported one-way from components/bakeryModal.js
// (used by closeLbAndOpenBakery; the leaderboard rows' data-onclick
// "openBakeryProfile"/"openDetail" markup resolves via the global action
// registry regardless). No cycle — bakeryModal.js imports nothing from here.
//
// showPage() (legacy-app.js, Phase 7 step 32) reads lbCurrentMode/
// lbCurrentTab and calls populateLbLocationFilter/renderBakeryLeaderboard/
// renderLeaderboard on nav to this page — normal one-way imports back.
// saveReview() and deleteReview() (both still in legacy-app.js, deferred to
// step 29) also call renderLeaderboard(lbCurrentTab) after a write. Neither
// lbCurrentMode nor lbCurrentTab is ever reassigned outside this file
// (confirmed via grep) — exported as plain live bindings, no setter needed,
// same convention as people.js's peopleViewMode (step 15).

import { registerActions, getAction } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { allItems, allBakeries, allItemRecords } from '../state/appState.js';
import { extractCity } from '../utils/geo.js';
import { CATEGORY_TREE, getCategoryDisplay } from '../data/categories.js';
import { openBakeryProfile } from '../components/bakeryModal.js';

export let lbCurrentTab = 'all';
export let lbCurrentMode = 'items';

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

export function populateLbLocationFilter() {
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

export function renderBakeryLeaderboard() {
  getAction('buildBakeryIndex')();
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

export function renderLeaderboard(tab) {
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

registerActions({ switchLbMode, switchLbTab, closeLbAndOpenBakery, onLbFilterChange });
