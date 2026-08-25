// ─── ITEM DETAIL MODAL ──────────────────────────────────────────────────────
// Extracted from src/legacy-app.js (2026-08-25, Phase 5 step 19).
// openDetail/closeDetailModal/isSavedItem moved wholesale + isSavedItem
// (originally under legacy-app.js's own "SAVED ITEMS (want to try)" header,
// not this section) — its only external caller was openDetail, so it moved
// alongside its sole caller rather than staying with toggleSaveItem/
// removeSavedItem, neither of which call it. userSavedItems (its own
// dependency) was already in src/state/appState.js since Phase 0 step 3c.
//
// closeDetailAndOpenProfile stays in legacy-app.js, deferred — it calls
// openProfileModal(), still local to legacy-app.js (future
// src/components/profileModal.js, Phase 5 step 22). Moving it here would
// have created a genuine two-file cycle: legacy-app.js already needs
// openDetail/closeDetailModal imported back (a direct plain-JS call from
// notifications' onClick, and from the outside-click/Escape-key modal
// listeners + its own registerActions call), while this file would need
// openProfileModal imported the other way — same shape as reviewCard.js's
// openProfileIfSignedIn deferral (Phase 3 step 12). closeDetailAndOpenProfile
// keeps working via the delegated data-onclick="closeDetailAndOpenProfile"
// registered from legacy-app.js — the global registerActions() registry
// resolves it regardless of which module registers it.
import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { getCategoryDisplay, getTastingDims } from '../data/categories.js';
import { lockScroll, unlockScroll } from '../utils/dom.js';
import { allItems, allItemRecords, currentUser, ownsBakery, userSavedItems } from '../state/appState.js';

export function isSavedItem(itemId) {
  return !!userSavedItems[itemId];
}

export async function openDetail(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('detailModal').classList.add('open');
  lockScroll();

  const catDisp = getCategoryDisplay(item);
  const emoji = catDisp.emoji;
  const catLabel = catDisp.sub ? `${catDisp.main} · ${catDisp.sub}` : catDisp.main;
  const record = item.itemRecordId ? allItemRecords.find(r => r.id === item.itemRecordId) : null;
  const communityScore = record ? record.communityAvg.toFixed(1) : (item.communityAvg ? item.communityAvg.toFixed(1) : (item.overallRating ? item.overallRating.toFixed(1) : '–'));
  const communityCount = record ? (record.reviewCount || 1) : (item.ratingCount || 1);
  const userScore = item.overallRating ? item.overallRating.toFixed(1) : '–';
  const detailDims = getTastingDims(item.category || 'other');
  const dimsHTML = detailDims.map(d => {
    const val = item[d.key] || 0;
    const pct = (val / 5) * 100;
    return `<div class="detail-dim">
      <div class="detail-dim-name">${d.label}</div>
      <div class="detail-dim-bar-wrap"><div class="detail-dim-bar" style="width:${pct}%"></div></div>
      <div class="detail-dim-val">${val ? val.toFixed(1) : '–'}</div>
    </div>`;
  }).join('');

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-hero">
      ${item.photoURL ? `<img src="${item.photoURL}" alt="${item.name}">` : `<div class="detail-hero-placeholder">${emoji}</div>`}
      <div class="detail-hero-badge">${catLabel}</div>
    </div>
    <div class="detail-body">
      <div class="detail-name">${item.name || 'Unknown bake'}</div>
      <div class="detail-bakery" style="cursor:pointer;" data-onclick="closeDetailModal,openBakeryProfile" data-args='${dataArgs([item.bakeryName || 'Unknown bakery'])}'>${item.bakeryName || 'Unknown bakery'} →</div>
      ${item.bakeryAddress ? `<div class="detail-address">📍 ${item.bakeryAddress}</div>` : ''}
      ${currentUser ? `
      <div class="detail-action-row">
        <button class="detail-action-btn${isSavedItem(item.id) ? ' saved' : ''}" id="saveItemBtn_${item.id}" data-onclick="toggleSaveItem" data-args='${dataArgs([item.id])}'>
          ${isSavedItem(item.id) ? '🔖 Saved to try' : '🔖 Save to try'}
        </button>
        <button class="detail-action-btn" data-onclick="openShareReviewModal" data-args='${dataArgs([item.id])}'>📤 Share</button>
      </div>` : ''}
      ${(() => {
        const detailRecord = item.itemRecordId ? allItemRecords.find(r => r.id === item.itemRecordId) : null;
        const avgP = detailRecord?.avgPrice ?? item.price ?? null;
        if (avgP === null) return '';
        const label = detailRecord && detailRecord.priceCount > 1
          ? ('avg £' + parseFloat(avgP).toFixed(2) + ' <span style="font-weight:400; font-size:0.75rem; color:var(--text-muted);">(' + detailRecord.priceCount + ' prices)</span>')
          : ('£' + parseFloat(avgP).toFixed(2));
        return `<div style="font-size:0.88rem; color:var(--sage); font-weight:600; margin-bottom:16px;">${label}</div>`;
      })()}
      <div class="detail-scores">
        <div class="detail-score-box">
          <div class="detail-score-label">Community</div>
          <div class="detail-score-num">${communityScore}<span>/5</span></div>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${communityCount} review${communityCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="detail-score-box">
          <div class="detail-score-label">First review</div>
          <div class="detail-score-num">${userScore}<span>/5</span></div>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${item.userName || 'Anonymous'}</div>
        </div>
      </div>
      <div class="detail-dims">${dimsHTML}</div>
      ${item.notes ? `<div class="detail-notes-section"><div class="detail-notes-title">Tasting notes</div><div class="detail-notes-text">${item.notes}</div></div>` : ''}
      <div class="detail-reviews">
        <div class="detail-reviews-title">Reviews (${communityCount})</div>
        ${(() => {
          // Show all reviews for this item record
          const relatedReviews = record
            ? allItems.filter(i => i.itemRecordId === record.id).sort((a,b) => (b.overallRating||0)-(a.overallRating||0))
            : [item];
          return relatedReviews.map(rev => {
            const revScore = rev.overallRating ? rev.overallRating.toFixed(1) : '–';
            const revDate = rev.createdAt ? new Date(rev.createdAt.toDate ? rev.createdAt.toDate() : rev.createdAt).toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'}) : '';
            const isOwn = currentUser && currentUser.uid === rev.userId;
            const canFlagRev = !isOwn && currentUser && ownsBakery(rev.bakeryName);
            return `<div class="review-item">
              <div class="review-avatar">${(rev.userName || 'A').charAt(0).toUpperCase()}</div>
              <div class="review-content">
                <div class="review-header">
                  <div class="review-name" style="cursor:pointer;" data-onclick="closeDetailAndOpenProfile" data-args='${dataArgs([rev.userId])}'>${rev.userName || 'Anonymous'}</div>
                  <div class="review-score">${revScore}</div>
                </div>
                ${rev.price ? `<div style="font-size:0.72rem; color:var(--sage); font-weight:600; margin-bottom:4px;">£${parseFloat(rev.price).toFixed(2)}</div>` : ''}
                ${rev.notes ? `<div class="review-text">${rev.notes}</div>` : '<div class="review-text" style="color:var(--text-muted);font-style:italic;">No notes added.</div>'}
                <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px;">
                  <div class="review-date">${revDate}</div>
                  <div style="display:flex; align-items:center; gap:10px;">
                    ${canFlagRev ? `<button class="btn-ghost" style="font-size:0.72rem; padding:4px 8px; color:#c0392b;" data-onclick="flagReview" data-args='${dataArgs([rev.id, rev.bakeryName || ''])}'>🚩 Report</button>` : ''}
                    ${isOwn ? `<button class="btn-ghost" style="font-size:0.75rem; padding:4px 8px; color:var(--caramel);" data-onclick="closeDetailModal,openEditModal" data-args='${dataArgs([rev.id])}'>✏️ Edit</button>` : ''}
                  </div>
                </div>
              </div>
            </div>`;
          }).join('');
        })()}
        ${currentUser && !allItems.find(i => i.itemRecordId === (record?.id) && i.userId === currentUser.uid) ? `<div style="margin-top:16px;"><button class="btn-espresso" style="font-size:0.85rem; padding:10px 18px;" data-onclick="closeDetailModal,prefillItemForReview" data-args='${dataArgs([record?.id || ''])}'>+ Add your rating</button></div>` : ''}
      </div>
    </div>`;
}

export function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  unlockScroll();
}

registerActions({ openDetail, closeDetailModal });
