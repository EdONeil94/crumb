// ─── REACTIONS ───────────────────────────────────────────────────────────────
// Emoji reaction bar nested inside feed/card HTML (pages/components
// carving, Phase 2 step 8 — see CLAUDE.md). Fully self-contained: only
// touches currentUser/fb/allItems (appState.js), openAuthModal
// (authModal.js), showToast (utils/dom.js), and dataArgs (delegate.js —
// all already extracted) plus internal cross-calls within this cluster.
// buildReactionBarInner()/loadReactionsForItems() are called from
// feedCardHTML (still in legacy-app.js, not extracted until step 12) —
// legacy-app.js imports them back from here, the ordinary one-way
// dependency direction, not circular (this module has zero dependency on
// feedCardHTML or anything else in DATA).

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb, allItems } from '../state/appState.js';
import { openAuthModal } from './authModal.js';
import { showToast } from '../utils/dom.js';

const REACTION_EMOJIS = ['🥐', '😍', '🔥', '👏'];

export async function toggleReaction(itemId, emoji) {
  if (!currentUser) { openAuthModal(); return; }
  const { db, doc, getDoc, setDoc, deleteDoc, serverTimestamp } = fb;
  const reactionId = `${itemId}_${currentUser.uid}_${encodeURIComponent(emoji)}`;
  const reactionRef = doc(db, 'reactions', reactionId);
  try {
    const snap = await getDoc(reactionRef);
    if (snap.exists()) {
      await deleteDoc(reactionRef);
    } else {
      // Find item owner so we can notify them
      const itemOwner = allItems.find(i => i.id === itemId);
      await setDoc(reactionRef, {
        itemId,
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        targetUserId: itemOwner?.userId || null,
        itemName: itemOwner?.name || null,
        emoji,
        createdAt: serverTimestamp()
      });
    }
    // Re-render the reaction bar for this item
    await refreshReactionBar(itemId);
  } catch(e) {
    showToast('Could not save reaction');
    console.error(e);
  }
}

export async function refreshReactionBar(itemId) {
  const { db, collection, query, where, getDocs } = fb;
  const q = query(collection(db, 'reactions'), where('itemId', '==', itemId));
  const snap = await getDocs(q);
  const reactions = snap.docs.map(d => d.data());
  const bar = document.querySelector(`.reaction-bar[data-item-id="${itemId}"]`);
  if (bar) bar.innerHTML = buildReactionBarInner(itemId, reactions);
}

export function buildReactionBarInner(itemId, reactions) {
  // Group by emoji
  const counts = {};
  const userReacted = {};
  reactions.forEach(r => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (currentUser && r.userId === currentUser.uid) userReacted[r.emoji] = true;
  });

  // Show existing reactions + add button
  const existingEmojis = Object.keys(counts);
  const reactionBtns = existingEmojis.map(emoji => {
    const reacted = !!userReacted[emoji];
    return `<button class="reaction-btn${reacted ? ' reacted' : ''}"
      data-onclick="toggleReaction" data-args='${dataArgs([itemId, emoji])}'
      title="${reacted ? 'Remove reaction' : 'React'}">
      <span class="emoji">${emoji}</span>
      <span class="count">${counts[emoji]}</span>
    </button>`;
  }).join('');

  // Add button — only show if user hasn't used all 4 emojis
  const allReacted = REACTION_EMOJIS.every(e => userReacted[e]);
  // The wrapper div's own event.stopPropagation() (guarding clicks on its
  // padding around the button) is redundant now — this reaction bar only
  // ever renders inside feedCardHTML's noop-registered click guard
  // (src/legacy-app.js:708), which already guards the whole bar the same
  // way, so the div keeps its position:relative styling but drops the
  // handler.
  const addBtn = currentUser && !allReacted ? `
    <div style="position:relative;">
      <button class="reaction-add" data-onclick="toggleReactionPicker" data-args='${dataArgs([itemId])}' title="Add reaction">+</button>
    </div>` : '';

  return reactionBtns + addBtn;
}

// Parameter order follows delegate.js's trailing-clicked-element convention
// (itemId, then btn) — its one call site is its own data-onclick attribute.
export function toggleReactionPicker(itemId, btn) {
  // Remove any existing picker
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = REACTION_EMOJIS.map(emoji =>
    `<button class="reaction-picker-btn" data-onclick="toggleReactionFromPicker" data-args='${dataArgs([itemId, emoji])}'>${emoji}</button>`
  ).join('');

  // Append to body and position using fixed coords above the button
  document.body.appendChild(picker);
  const rect = btn.getBoundingClientRect();
  const pickerW = REACTION_EMOJIS.length * 48 + 24;
  let left = rect.left + rect.width / 2 - pickerW / 2;
  // Keep within viewport
  left = Math.max(8, Math.min(left, window.innerWidth - pickerW - 8));
  picker.style.left = left + 'px';
  picker.style.top = (rect.top - 60) + 'px';

  // Close picker on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePicker(e) {
      if (!picker.contains(e.target) && e.target !== btn) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 0);
}

// toggleReaction(...) then closing the picker doesn't fit the plain
// "cleanup(s), then one parameterized action" data-onclick shape — the
// order's reversed here (the parameterized action runs first, cleanup
// after) — so this gets a small wrapper instead, mirroring
// followAndRefreshProfile/followAndRefreshPeople (FOLLOWS cluster). The
// picker is appended straight to document.body (not nested under the
// card/reaction-bar hierarchy at all), so — unlike the buttons above —
// there's no ancestor data-onclick a stray click here could ever have
// reached anyway; the old event.stopPropagation() was copied from the
// reaction-bar buttons' pattern but was never actually load-bearing for
// this one.
export function toggleReactionFromPicker(itemId, emoji, el) {
  toggleReaction(itemId, emoji);
  el.closest('.reaction-picker')?.remove();
}

export async function loadReactionsForItems(itemIds) {
  if (!itemIds.length || !fb) return {};
  const { db, collection, query, where, getDocs } = fb;
  const results = {};
  // Query in batches of 10 (Firestore 'in' limit)
  for (let i = 0; i < itemIds.length; i += 10) {
    const batch = itemIds.slice(i, i + 10);
    try {
      const q = query(collection(db, 'reactions'), where('itemId', 'in', batch));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const r = d.data();
        if (!results[r.itemId]) results[r.itemId] = [];
        results[r.itemId].push(r);
      });
    } catch(e) { console.log('Reactions load error:', e); }
  }
  return results;
}

registerActions({ toggleReaction, toggleReactionPicker, toggleReactionFromPicker });
