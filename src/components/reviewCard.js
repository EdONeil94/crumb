// ─── REVIEW CARD ────────────────────────────────────────────────────────────
// Shared review-card renderers (pages/components carving, Phase 3 step 12 —
// see CLAUDE.md). cardHTML is the plain card used by the Home page's recent
// grid (renderRecentGrid, src/pages/home.js — Phase 7 step 28);
// feedCardHTML is the Feed page's variant (renderFeed, src/pages/feed.js —
// Phase 3 step 13), adding a reaction bar and a
// "Following" badge on top of the same rating/price/image logic. Both are
// self-contained: every dependency (getCategoryDisplay, allItems/
// allItemRecords, timeAgo, dataArgs) was already extracted in Phase 0.
// openDetail/openBakeryProfile (referenced by data-onclick in both card
// markups) are already registered elsewhere (Bakeries page, Leaderboard,
// ...) — no change needed for those here.
//
// openProfileIfSignedIn (also referenced by data-onclick in both markups,
// via the username link) did NOT move here, despite being registered
// alongside noop in the same original registerActions() call — it called
// openProfileModal, still in src/legacy-app.js at the time. Moving it
// would've meant this file importing back from legacy-app.js while
// legacy-app.js already needs cardHTML/feedCardHTML imported the normal
// one-way direction — a genuine two-file cycle, flagged before writing any
// of this file rather than discovered mid-move. It moved to
// src/components/profileModal.js instead (2026-08-26, Phase 5 step 22),
// once openProfileModal had a real importable home there; the GLOBAL
// registerActions() registry means the data-onclick references in this
// file's markup resolve fine regardless of which file does the registering.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { getCategoryDisplay } from '../data/categories.js';
import { allItems, allItemRecords } from '../state/appState.js';
import { timeAgo } from '../utils/dom.js';

// feedCardHTML wraps the reaction bar in this no-op action instead of the
// old raw onclick="event.stopPropagation()". The reaction bar's own buttons
// (REACTIONS cluster, delegated) resolve to their own action via
// delegate.js's closest()-based dispatch, same as this wrapper — but a
// click landing on the bar's own padding/gaps, not on any button, needs
// something to stop it too: giving this wrapper a registered no-op gives
// closest() an inner match to stop at there as well, so a stray click here
// never falls through to the card's own openDetail action.
function noop() {}

export function feedCardHTML(item, reactionBarHTML, followedBadge) {
  const catDisp = getCategoryDisplay(item);
  const record = item.itemRecordId ? allItemRecords.find(r => r.id === item.itemRecordId) : null;
  const score = record ? record.communityAvg.toFixed(1) : (item.communityAvg ? item.communityAvg.toFixed(1) : (item.overallRating ? item.overallRating.toFixed(1) : '–'));
  // reviewCount: prefer itemRecord, then count sibling reviews in allItems, then fall back to 1
  let ratingCount;
  if (record) {
    ratingCount = record.reviewCount || 1;
  } else if (item.itemRecordId) {
    // record not loaded yet — count items sharing the same itemRecordId
    ratingCount = allItems.filter(i => i.itemRecordId === item.itemRecordId).length || 1;
  } else {
    // legacy item with no itemRecordId — count by name+bakery
    ratingCount = allItems.filter(i =>
      (i.name || '').toLowerCase() === (item.name || '').toLowerCase() &&
      (i.bakeryName || '').toLowerCase() === (item.bakeryName || '').toLowerCase()
    ).length || 1;
  }
  const avgPrice = record?.avgPrice ?? item.price ?? null;
  const price = avgPrice !== null ? ('£' + parseFloat(avgPrice).toFixed(2)) : '';
  const priceLabel = record && record.priceCount > 1 ? ('avg ' + price) : price;
  const imageTag = item.photoURL
    ? `<img src="${item.photoURL}" alt="${item.name}" loading="lazy">`
    : `<div class="card-image-placeholder">${catDisp.emoji}</div>`;
  const catLabel = catDisp.sub ? `${catDisp.main} · ${catDisp.sub}` : catDisp.main;
  return `
    <div class="card" data-onclick="openDetail" data-args='${dataArgs([item.id])}'>
      <div class="card-image">
        ${imageTag}
        <div class="card-badge">${catLabel}</div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span style="cursor:pointer;color:var(--caramel);" data-onclick="openProfileIfSignedIn" data-args='${dataArgs([item.userId])}'>${item.userName || 'Anonymous'}</span>
          ${item.createdAt ? `<span>·</span><span>${timeAgo(item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt))}</span>` : ''}
          ${followedBadge || ''}
        </div>
        <div class="card-name">${item.name || 'Unknown bake'}</div>
        <div class="card-bakery" data-onclick="openBakeryProfile" data-args='${dataArgs([item.bakeryName || 'Unknown bakery', ''])}'>📍 ${item.bakeryName || 'Unknown bakery'}</div>
        <div class="card-footer">
          <div class="rating-display">
            <div class="rating-circle">${score}</div>
            <div class="rating-label">Community<br><span class="rating-count">${ratingCount} review${ratingCount !== 1 ? 's' : ''}</span></div>
          </div>
          ${priceLabel ? `<div class="card-price">${priceLabel}</div>` : ''}
        </div>
      </div>
      <div data-onclick="noop">${reactionBarHTML}</div>
    </div>`;
}

export function cardHTML(item) {
  const catDisp = getCategoryDisplay(item);
  const emoji = catDisp.emoji;
  const record = item.itemRecordId ? allItemRecords.find(r => r.id === item.itemRecordId) : null;
  const score = record ? record.communityAvg.toFixed(1) : (item.communityAvg ? item.communityAvg.toFixed(1) : (item.overallRating ? item.overallRating.toFixed(1) : '–'));
  let ratingCount;
  if (record) {
    ratingCount = record.reviewCount || 1;
  } else if (item.itemRecordId) {
    ratingCount = allItems.filter(i => i.itemRecordId === item.itemRecordId).length || 1;
  } else {
    ratingCount = allItems.filter(i =>
      (i.name || '').toLowerCase() === (item.name || '').toLowerCase() &&
      (i.bakeryName || '').toLowerCase() === (item.bakeryName || '').toLowerCase()
    ).length || 1;
  }
  const avgPrice = record?.avgPrice ?? (record?.priceCount > 0 ? record.avgPrice : null) ?? item.price ?? null;
  const price = avgPrice !== null && avgPrice !== undefined ? ('£' + parseFloat(avgPrice).toFixed(2)) : '';
  const priceLabel = record && record.priceCount > 1 ? ('avg ' + price) : price;
  const imageTag = item.photoURL
    ? `<img src="${item.photoURL}" alt="${item.name}" loading="lazy">`
    : `<div class="card-image-placeholder">${emoji}</div>`;
  const catLabel = catDisp.sub ? `${catDisp.main} · ${catDisp.sub}` : catDisp.main;
  return `
    <div class="card" data-onclick="openDetail" data-args='${dataArgs([item.id])}'>
      <div class="card-image">
        ${imageTag}
        <div class="card-badge">${catLabel}</div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span style="cursor:pointer;color:var(--caramel);" data-onclick="openProfileIfSignedIn" data-args='${dataArgs([item.userId])}'>${item.userName || 'Anonymous'}</span>
          ${item.createdAt ? `<span>·</span><span>${timeAgo(item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt))}</span>` : ''}
        </div>
        <div class="card-name">${item.name || 'Unknown bake'}</div>
        <div class="card-bakery" data-onclick="openBakeryProfile" data-args='${dataArgs([item.bakeryName || 'Unknown bakery', ''])}'>📍 ${item.bakeryName || 'Unknown bakery'}</div>
        <div class="card-footer">
          <div class="rating-display">
            <div class="rating-circle">${score}</div>
            <div class="rating-label">Community<br><span class="rating-count">${ratingCount} review${ratingCount !== 1 ? 's' : ''}</span></div>
          </div>
          ${priceLabel ? `<div class="card-price">${priceLabel}</div>` : ''}
        </div>
      </div>
    </div>`;
}

registerActions({ noop });
