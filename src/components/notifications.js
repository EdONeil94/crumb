// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
// Extracted from src/legacy-app.js (2026-08-26, Phase 6 step 25). The nav
// bell/panel: loading notifications from three Firestore collections
// (follows/reactions/sharedReviews), the unread-count bell badge, opening/
// closing the panel, rendering it, per-row click dispatch, and marking all
// read. Confirmed by reading, not assumed from the single header, that this
// cluster is genuinely self-contained (matching step 24's finding, not
// steps 19/20/22/23's "splits" pattern) — every function here belongs to
// one feature.
//
// Every real (non-markup) call site of loadNotifications checked before
// moving, per step 22's own lesson: it has 4 plain-JS callers, all inside
// initFirebaseApp()'s onAuthStateChanged handler (stays in legacy-app.js —
// one direct call plus three onSnapshot real-time-listener callbacks, for
// follows/sharedReviews/reactions respectively) — exported and imported
// back one-way, no cycle (nothing here calls back into legacy-app.js).
// updateBellBadge/renderNotifPanel have no callers outside this file
// (confirmed via grep) despite both having stale WINDOW EXPORTS entries —
// removed, along with loadNotifications' own (also stale: its real callers
// are now an ordinary ES import, not window-global access).
//
// Every function reached via delegated markup double-checked against its
// own registerActions() call, not just its export status — the exact
// standing checklist item step 24's closeBakeryEditModal bug established:
// toggleNotifPanel (index.html's #navBell) and closeNotifPanel
// (index.html's #notifBackdrop) both have real data-onclick markup in
// index.html's own static HTML, confirmed via grep, and both are included
// in this file's own registerActions() call below alongside
// markAllNotifsRead/openNotifItem (delegated only from this file's own
// dynamically-built notif-item markup, no static index.html reference).
//
// openProfileModal/openDetail import one-way from profileModal.js/
// itemDetailModal.js respectively (loadNotifications' own follow/
// shared-review notification click handlers) — confirmed neither file
// imports anything from here, so no cycle.
import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb } from '../state/appState.js';
import { timeAgo } from '../utils/dom.js';
import { escJS } from '../utils/strings.js';
import { openProfileModal } from './profileModal.js';
import { openDetail } from './itemDetailModal.js';

let notifLastSeen = null; // timestamp of last time user opened panel
let notifItems = [];      // cached notification objects

export async function loadNotifications() {
  if (!currentUser || !fb) return;
  const { db, collection, query, where, orderBy, getDocs, getDoc, doc } = fb;

  // Load last-seen timestamp from profile
  try {
    const profileSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
    notifLastSeen = profileSnap.data()?.notifLastSeen?.toDate() || null;
  } catch(e) { notifLastSeen = null; }

  const notifications = [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

  // 1. New followers
  try {
    const followsSnap = await getDocs(
      query(collection(db, 'follows'), where('followingId', '==', currentUser.uid))
    );
    followsSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.createdAt?.toDate();
      if (!ts || ts < cutoff) return;
      notifications.push({
        id: d.id,
        type: 'follow',
        actorId: data.followerId,
        actorName: data.followerName || 'Someone',
        actorPhoto: data.followerPhoto || null,
        text: `started following you`,
        ts,
        unread: !notifLastSeen || ts > notifLastSeen,
        onClick: () => openProfileModal(data.followerId)
      });
    });
  } catch(e) { console.warn('Notif follows error:', e); }

  // 2. Reactions on my items
  try {
    const reactSnap = await getDocs(
      query(collection(db, 'reactions'), where('targetUserId', '==', currentUser.uid))
    );
    reactSnap.docs.forEach(d => {
      const data = d.data();
      if (data.userId === currentUser.uid) return; // skip own reactions
      const ts = data.createdAt?.toDate();
      if (!ts || ts < cutoff) return;
      notifications.push({
        id: d.id,
        type: 'reaction',
        actorId: data.userId,
        actorName: data.userName || 'Someone',
        actorPhoto: data.userPhoto || null,
        emoji: data.emoji,
        itemName: data.itemName || 'your review',
        text: `reacted ${data.emoji} to <em>${data.itemName || 'your review'}</em>`,
        ts,
        unread: !notifLastSeen || ts > notifLastSeen,
        onClick: () => { /* could open item detail */ }
      });
    });
  } catch(e) { console.warn('Notif reactions error:', e); }

  // 3. Shared reviews
  try {
    const shareSnap = await getDocs(
      query(collection(db, 'sharedReviews'), where('toUserId', '==', currentUser.uid))
    );
    shareSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.createdAt?.toDate();
      if (!ts || ts < cutoff) return;
      notifications.push({
        id: d.id,
        type: 'shared',
        actorId: data.fromUserId,
        actorName: data.fromUserName || 'Someone',
        actorPhoto: data.fromUserPhoto || null,
        itemName: data.itemName || 'a review',
        text: `shared <em>${data.itemName || 'a review'}</em> from ${data.bakeryName || 'a bakery'} with you`,
        ts,
        unread: !notifLastSeen || ts > notifLastSeen,
        onClick: () => openDetail(data.itemId)
      });
    });
  } catch(e) { console.warn('Notif shared reviews error:', e); }

  // Sort newest first
  notifications.sort((a, b) => b.ts - a.ts);
  notifItems = notifications;

  const unreadCount = notifications.filter(n => n.unread).length;
  updateBellBadge(unreadCount);
}

function updateBellBadge(count) {
  const badge = document.getElementById('navBellBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  const backdrop = document.getElementById('notifBackdrop');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    closeNotifPanel();
  } else {
    // Always fetch the latest notifications when opening — don't rely on
    // whatever was cached at login, since shares/reactions have no live push.
    loadNotifications().then(renderNotifPanel);
    renderNotifPanel(); // show cached data immediately while the refresh runs
    panel.classList.add('open');
    backdrop.style.display = 'block';
    // Mark as seen after a short delay
    setTimeout(() => markAllNotifsRead(), 1500);
  }
}

function closeNotifPanel() {
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('notifBackdrop').style.display = 'none';
}

function renderNotifPanel() {
  const list = document.getElementById('notifList');
  if (!notifItems.length) {
    list.innerHTML = `<div class="notif-empty"><div class="notif-empty-icon">🔔</div>No notifications yet</div>`;
    return;
  }
  list.innerHTML = notifItems.map((n, i) => {
    const avatarHTML = n.type === 'reaction'
      ? `<div class="notif-emoji">${n.emoji}</div>`
      : n.actorPhoto
        ? `<div class="notif-avatar"><img src="${n.actorPhoto}" alt=""></div>`
        : `<div class="notif-avatar">${(n.actorName || '?').charAt(0).toUpperCase()}</div>`;
    return `
      <div class="notif-item ${n.unread ? 'unread' : ''}" data-onclick="closeNotifPanel,openNotifItem" data-args='${dataArgs([i])}'>
        ${avatarHTML}
        <div class="notif-body">
          <div class="notif-text"><strong>${escJS(n.actorName)}</strong> ${n.text}</div>
          <div class="notif-time">${timeAgo(n.ts)}</div>
        </div>
      </div>`;
  }).join('');
}

// Each notification carries its own ad-hoc onClick closure (see
// loadNotifications) rather than a single named action, so this thin,
// index-based wrapper is what's registered — it looks the closure up from
// module-scope notifItems and invokes it, instead of the old raw
// onclick="notifItems[i].onClick()", which broke post-modularization for the
// same reason as the avatar dropdown: notifItems is a plain module-level
// `let`, invisible to inline onclick="..." attributes (global scope) — it
// was never in WINDOW EXPORTS, only functions are.
function openNotifItem(i) {
  notifItems[i]?.onClick?.();
}

async function markAllNotifsRead() {
  if (!currentUser || !fb) return;
  const { db, doc, updateDoc, serverTimestamp } = fb;
  notifItems.forEach(n => n.unread = false);
  updateBellBadge(0);
  // Persist last-seen timestamp to profile
  try {
    await updateDoc(doc(db, 'profiles', currentUser.uid), { notifLastSeen: serverTimestamp() });
    notifLastSeen = new Date();
  } catch(e) { console.warn('Could not save notif seen time:', e); }
}

// loadNotifications is exported above for legacy-app.js's own remaining
// callers. toggleNotifPanel/closeNotifPanel both have real data-onclick
// markup in index.html's own static HTML (see header comment) —
// double-checked against this registerActions() call, not just assumed
// from their export status, per step 24's own lesson.
registerActions({
  toggleNotifPanel, closeNotifPanel, markAllNotifsRead, openNotifItem,
});
