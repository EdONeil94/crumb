// ─── FOLLOWS ────────────────────────────────────────────────────────────────
// pages/components carving, Phase 3 step 14 — see CLAUDE.md. Split, not
// clean: half this cluster stayed behind in src/legacy-app.js.
//
// Moved here (self-contained — every dependency was already extracted in
// Phase 0): getFollowState, followBtnHTML, getFollowersForUser,
// getFollowingForUser, buildFollowUserRowHTML.
//
// Stayed in legacy-app.js: toggleFollow, refreshFollowButtons,
// followAndRefreshProfile, followAndRefreshPeople, refreshOpenProfile.
// toggleFollow calls refreshFollowButtons, which calls renderPeople() —
// still in legacy-app.js (future src/pages/people.js, Phase 3 step 15, the
// very next step). followAndRefreshPeople calls renderPeople() directly for
// the same reason. followAndRefreshProfile calls refreshOpenProfile, which
// calls openProfileModal() and reads profileModalUid/profileActiveCatFilter/
// profileActiveLocFilter — all still in legacy-app.js (future
// src/components/profileModal.js, Phase 5 step 22). Moving any of these 5
// would have meant this file importing back from legacy-app.js for
// renderPeople/openProfileModal, while legacy-app.js already needs
// getFollowState/followBtnHTML/etc. imported the normal direction — a
// genuine two-file cycle, flagged before writing any of this file rather
// than discovered mid-move. Revisit toggleFollow/refreshFollowButtons/
// followAndRefreshPeople once step 15 lands (imminent — the very next
// extraction); followAndRefreshProfile/refreshOpenProfile wait for step 22.

import { dataArgs } from '../events/delegate.js';
import { currentUser, fb, allItems, myFollowing, myFollowers } from '../state/appState.js';

export function getFollowState(targetUid) {
  if (!currentUser || targetUid === currentUser.uid) return 'self';
  const iFollow = myFollowing.has(targetUid);
  const theyFollow = myFollowers.has(targetUid);
  if (iFollow) return 'following';
  if (theyFollow) return 'follow-back';
  return 'follow';
}

export function followBtnHTML(targetUid, dark) {
  const state = getFollowState(targetUid);
  if (state === 'self') return '';
  const labels = { follow: 'Follow', 'follow-back': 'Follow back', following: 'Following' };
  if (dark) {
    return `<button class="follow-btn ${state}" data-onclick="followAndRefreshProfile" data-args='${dataArgs([targetUid])}'>${labels[state]}</button>`;
  }
  return `<button class="people-follow-btn ${state}" data-onclick="followAndRefreshPeople" data-args='${dataArgs([targetUid])}'>${labels[state]}</button>`;
}

export async function getFollowersForUser(uid) {
  const { db, collection, query, where, getDocs } = fb;
  const snap = await getDocs(query(collection(db, 'follows'), where('followingId', '==', uid)));
  return snap.docs.map(d => d.data());
}

export async function getFollowingForUser(uid) {
  const { db, collection, query, where, getDocs } = fb;
  const snap = await getDocs(query(collection(db, 'follows'), where('followerId', '==', uid)));
  return snap.docs.map(d => d.data());
}

export function buildFollowUserRowHTML(followUid, followName, followPhoto, isFollowingPage) {
  const initials = (followName || '?').charAt(0).toUpperCase();
  const avatarInner = followPhoto ? `<img src="${followPhoto}" alt="${followName}">` : initials;
  const state = getFollowState(followUid);
  const btnLabel = state === 'following' ? 'Following' : state === 'follow-back' ? 'Follow back' : 'Follow';
  const btnClass = state === 'following' ? 'following' : state === 'follow-back' ? 'follow-back' : '';
  const userReviews = allItems.filter(i => i.userId === followUid).length;
  return `
    <div class="follow-user-row">
      <div class="follow-user-avatar" data-onclick="closeProfileModal,openProfileModal" data-args='${dataArgs([followUid])}'>${avatarInner}</div>
      <div class="follow-user-info" data-onclick="closeProfileModal,openProfileModal" data-args='${dataArgs([followUid])}'>
        <div class="follow-user-name">${followName || 'Anonymous'}</div>
        <div class="follow-user-meta">${userReviews} review${userReviews !== 1 ? 's' : ''}</div>
      </div>
      ${state !== 'self' ? `<button class="people-follow-btn ${btnClass}" data-onclick="followAndRefreshProfile" data-args='${dataArgs([followUid])}'>${btnLabel}</button>` : ''}
    </div>`;
}
