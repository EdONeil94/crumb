// ─── FEED PAGE ──────────────────────────────────────────────────────────────
// pages/components carving, Phase 3 step 13 — see CLAUDE.md. Depends on
// feedCardHTML (src/components/reviewCard.js, step 12) and
// buildReactionBarInner/loadReactionsForItems (src/components/reactions.js,
// step 8) — both already extracted, no surprises there.
//
// switchFeedTab is exported and re-registered on window from
// src/legacy-app.js's own WINDOW EXPORTS block, unlike every function moved
// so far in this carving: index.html's FEED TABS buttons still use a raw,
// non-delegated onclick="switchFeedTab('all')" (that cluster was explicitly
// out of scope for the handler-delegation migration — see CLAUDE.md's
// migration status table). Raw markup can only ever resolve window[name],
// never a delegated data-onclick, so dropping its WINDOW EXPORTS entry here
// would silently break both feed tab buttons. Flagged before writing this
// file, not discovered afterward.

import { currentUser, allItems, myFollowing } from '../state/appState.js';
import { buildReactionBarInner, loadReactionsForItems } from '../components/reactions.js';
import { feedCardHTML } from '../components/reviewCard.js';

let feedCurrentTab = 'all';

export function switchFeedTab(tab) {
  feedCurrentTab = tab;
  document.getElementById('feedTabAll').classList.toggle('active', tab === 'all');
  document.getElementById('feedTabFollowing').classList.toggle('active', tab === 'following');
  document.getElementById('feedEyebrow').textContent = tab === 'following' ? 'People you follow' : 'Community';
  document.getElementById('feedTitle').textContent = tab === 'following' ? 'Following' : 'Latest reviews';
  renderFeed();
}

export async function renderFeed() {
  const grid = document.getElementById('feedGrid');

  // Show/hide following tab based on login state
  const followingTab = document.getElementById('feedTabFollowing');
  if (followingTab) followingTab.style.display = currentUser ? 'block' : 'none';

  let items = [...allItems];

  if (feedCurrentTab === 'following') {
    if (!currentUser || myFollowing.size === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">${!currentUser ? 'Sign in to see your following feed' : "You're not following anyone yet"}</div>
        <div class="empty-state-text">${currentUser ? 'Head to the People page to find and follow other reviewers.' : ''}</div>
      </div>`;
      return;
    }
    items = items.filter(i => myFollowing.has(i.userId));
    if (!items.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🥐</div><div class="empty-state-title">No reviews from people you follow yet</div></div>`;
      return;
    }
  } else {
    // All feed — sort followed users' reviews first
    if (currentUser && myFollowing.size > 0) {
      items.sort((a, b) => {
        const aFollowed = myFollowing.has(a.userId) ? 1 : 0;
        const bFollowed = myFollowing.has(b.userId) ? 1 : 0;
        if (bFollowed !== aFollowed) return bFollowed - aFollowed;
        // Then by date
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return bTime - aTime;
      });
    }
    if (!items.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🍞</div><div class="empty-state-title">The bakery is quiet</div><div class="empty-state-text">No reviews yet — be the first!</div></div>`;
      return;
    }
  }

  // Build feed cards with reaction bars
  const itemIds = items.map(i => i.id);
  const reactionsMap = await loadReactionsForItems(itemIds);

  grid.innerHTML = items.map(item => {
    const reactions = reactionsMap[item.id] || [];
    const isFollowed = currentUser && myFollowing.has(item.userId);
    const followedBadge = isFollowed ? `<span style="font-size:0.68rem;color:var(--sage);font-weight:600;letter-spacing:0.5px;">● Following</span>` : '';
    const reactionBarHTML = `<div class="reaction-bar" data-item-id="${item.id}">${buildReactionBarInner(item.id, reactions)}</div>`;
    return feedCardHTML(item, reactionBarHTML, followedBadge);
  }).join('');
}
