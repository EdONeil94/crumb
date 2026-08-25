// ─── SHARE REVIEW WITH A FOLLOWED USER ────────────────────────────────────────
// Extracted from src/legacy-app.js (2026-08-25, Phase 5 step 20).
// Split, not clean — flagged before writing any code, per step 19's lesson
// (don't trust the plan's assumed section header for where a function
// belongs — verify by reading). The original "SHARE REVIEW WITH A FOLLOWED
// USER" file section also contained renderSavedTab (the Profile modal's
// own Saved tab) and removeBookmarkAndRefreshSaved — both stayed in
// legacy-app.js, by topic rather than position: renderSavedTab calls
// switchProfileTab, still local to legacy-app.js (future
// src/components/profileModal.js, Phase 5 step 22), and
// removeBookmarkAndRefreshSaved calls that same switchProfileTab too. Both
// are genuinely Profile-modal internals that happened to share this file
// section by position, not by topic — legacy-app.js's own header comment
// above them already said so before this extraction.
// No cross-cluster dependency on profileModal.js exists for the 5 functions
// that DID move here — confirmed via a full dependency read before moving,
// same check step 19 flagged doing for closeDetailAndOpenProfile.
import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { currentUser, fb, allItems, allProfiles } from '../state/appState.js';
import { openAuthModal } from './authModal.js';

let shareModalCandidates = []; // cached list for current share session
let shareModalItemId = null;

export async function openShareReviewModal(itemId) {
  if (!currentUser) { openAuthModal(); return; }
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  shareModalItemId = itemId;

  const modal = document.getElementById('shareReviewModal');
  const content = document.getElementById('shareReviewContent');
  modal.classList.add('open');
  lockScroll();
  content.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner" style="margin:0 auto;"></div></div>';

  if (!fb) return;
  const { db, collection, query, where, getDocs } = fb;
  try {
    const snap = await getDocs(query(collection(db, 'follows'), where('followerId', '==', currentUser.uid)));
    const follows = snap.docs.map(d => d.data());

    if (!follows.length) {
      content.innerHTML = `<div class="empty-state" style="padding:24px 0;">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">You're not following anyone yet</div>
        <div class="empty-state-text">Follow other bakers to share reviews with them.</div>
      </div>`;
      return;
    }

    // Resolve name/photo the same way the Following tab does — profile first, fall back to their reviews
    const baseCandidates = follows.map(f => {
      const uid = f.followingId;
      let name = 'Anonymous', photo = null;
      if (allProfiles[uid]) {
        name = allProfiles[uid].displayName || name;
        photo = allProfiles[uid].photoURL || null;
      } else {
        const item2 = allItems.find(i => i.userId === uid);
        if (item2) { name = item2.userName || name; photo = item2.userPhoto || null; }
      }
      const followedAt = f.createdAt?.toDate ? f.createdAt.toDate() : (f.createdAt ? new Date(f.createdAt) : new Date(0));
      return { uid, name, photo, followedAt, score: 0, lastInteraction: null };
    });

    // Pull interaction signals from the last 30 days: shares sent + reactions given
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const byUid = {};
    baseCandidates.forEach(c => byUid[c.uid] = c);

    try {
      const shareSnap = await getDocs(query(collection(db, 'sharedReviews'), where('fromUserId', '==', currentUser.uid)));
      shareSnap.docs.forEach(d => {
        const data = d.data();
        const c = byUid[data.toUserId];
        if (!c) return;
        const ts = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
        if (!ts || ts < cutoff) return;
        c.score += 3; // sharing is a strong, deliberate interaction
        if (!c.lastInteraction || ts > c.lastInteraction) c.lastInteraction = ts;
      });
    } catch(e) { console.warn('Share interaction lookup error:', e); }

    try {
      const reactSnap = await getDocs(query(collection(db, 'reactions'), where('userId', '==', currentUser.uid)));
      reactSnap.docs.forEach(d => {
        const data = d.data();
        const c = byUid[data.targetUserId];
        if (!c) return;
        const ts = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
        if (!ts || ts < cutoff) return;
        c.score += 1;
        if (!c.lastInteraction || ts > c.lastInteraction) c.lastInteraction = ts;
      });
    } catch(e) { console.warn('Reaction interaction lookup error:', e); }

    // Rank: highest interaction score first, then most recent interaction, then most recently followed
    shareModalCandidates = baseCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.lastInteraction && b.lastInteraction) return b.lastInteraction - a.lastInteraction;
      if (a.lastInteraction) return -1;
      if (b.lastInteraction) return 1;
      return b.followedAt - a.followedAt;
    });

    content.innerHTML = `
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">Sharing <strong style="color:var(--espresso);">${item.name || 'this review'}</strong> from ${item.bakeryName || 'this bakery'}</div>
      <input type="text" class="form-input" id="shareUserSearch" placeholder="Search people you follow…" data-oninput="filterShareCandidates" style="margin-bottom:14px;">
      <div id="shareUserRows">${renderShareCandidateRows(shareModalCandidates)}</div>`;

    // Focus search for quick typing on desktop
    setTimeout(() => document.getElementById('shareUserSearch')?.focus(), 200);
  } catch(e) {
    content.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load your following list.</div>';
    console.error(e);
  }
}

function renderShareCandidateRows(list) {
  if (!list.length) {
    return `<div style="text-align:center;padding:20px 0;color:var(--text-muted);font-size:0.85rem;">No matches</div>`;
  }
  return list.map(c => {
    const initials = (c.name || '?').charAt(0).toUpperCase();
    const avatarInner = c.photo ? `<img src="${c.photo}" alt="${c.name}">` : initials;
    const subtitle = c.score > 0
      ? `<div style="font-size:0.68rem;color:var(--caramel);margin-top:1px;">Recently active together</div>`
      : '';
    return `<div class="share-user-row">
      <div class="share-user-avatar">${avatarInner}</div>
      <div style="flex:1;min-width:0;">
        <div class="share-user-name">${c.name}</div>
        ${subtitle}
      </div>
      <button class="btn-espresso" style="font-size:0.78rem;padding:6px 14px;flex-shrink:0;" data-onclick="sendSharedReview" data-args='${dataArgs([shareModalItemId, c.uid, c.name])}'>Send</button>
    </div>`;
  }).join('');
}

// Takes the input element itself (delegate.js's trailing-clicked-element
// convention for handlers that need the live value) rather than a string —
// its one call site used to pass this.value explicitly.
export function filterShareCandidates(el) {
  const q = el.value.trim().toLowerCase();
  const filtered = q ? shareModalCandidates.filter(c => c.name.toLowerCase().includes(q)) : shareModalCandidates;
  const rowsEl = document.getElementById('shareUserRows');
  if (rowsEl) rowsEl.innerHTML = renderShareCandidateRows(filtered);
}

export function closeShareReviewModal() {
  document.getElementById('shareReviewModal').classList.remove('open');
  unlockScroll();
}

export async function sendSharedReview(itemId, toUserId, toUserName, btnEl) {
  if (!currentUser || !fb) return;
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  const { db, collection, addDoc, serverTimestamp } = fb;

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Sending…'; }
  try {
    await addDoc(collection(db, 'sharedReviews'), {
      fromUserId: currentUser.uid,
      fromUserName: currentUser.displayName || 'Someone',
      fromUserPhoto: currentUser.photoURL || null,
      toUserId,
      itemId,
      itemName: item.name || 'Unknown bake',
      bakeryName: item.bakeryName || '',
      photoURL: item.photoURL || null,
      createdAt: serverTimestamp()
    });
    if (btnEl) { btnEl.textContent = '✓ Sent'; btnEl.style.opacity = '0.6'; }
    showToast(`Shared with ${toUserName}!`);
  } catch(e) {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Send'; }
    showToast('Could not share');
    console.error(e);
  }
}

registerActions({ openShareReviewModal, filterShareCandidates, closeShareReviewModal, sendSharedReview });
