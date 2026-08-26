// ─── PEOPLE PAGE ────────────────────────────────────────────────────────────
// Rankings/Members view toggle + both renderers (pages/components carving,
// Phase 3 step 15 — see CLAUDE.md). Moved wholesale — every dependency
// (currentUser/fb/allItems/allProfiles, extractCity/extractCountry,
// followBtnHTML, dataArgs) was already extracted in Phase 0/3.
//
// Not moved here, despite reading/writing this page's own state or being
// reached from its markup: openProfileModal/closeProfileModal/
// profileModalUid/profileActiveCatFilter/profileActiveLocFilter — the
// Profile modal opened from a ranking/member card click, not part of the
// People page itself. Those moved to src/components/profileModal.js
// (2026-08-26, Phase 5 step 22) instead; computeCountryRank, called from
// inside openProfileModal(), is now imported one-way from here by that file
// (no cycle, since nothing in this file calls back into profileModal.js) —
// legacy-app.js no longer needs computeCountryRank imported at all, now that
// openProfileModal itself has moved out.
//
// showPage() (legacy-app.js, Phase 7 step 32) reads peopleViewMode and
// calls setPeopleView/renderRankings/renderPeople/
// populateRankingLocationFilter — also a normal one-way import back.
//
// Deferred-follow-up decision from step 14 (follows.js), made now that this
// file is a real module: toggleFollow/refreshFollowButtons/
// followAndRefreshPeople stay in legacy-app.js, NOT moved into follows.js.
// refreshFollowButtons/followAndRefreshPeople call renderPeople() directly
// — moving those three into follows.js would mean follows.js importing
// renderPeople from this file, while this file already imports
// followBtnHTML from follows.js (used in both renderPeople's member cards
// and buildFollowUserRowHTML) — a genuine two-file cycle between follows.js
// and people.js, the same shape every prior deferral in this plan has
// avoided. Leaving them in legacy-app.js keeps it as the single hub
// importing one-way from both leaf modules. Not an automatic consequence of
// this step landing — evaluated and rejected deliberately, per CLAUDE.md's
// framing for every deferral in this plan.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb, allItems, allProfiles } from '../state/appState.js';
import { extractCity, extractCountry } from '../utils/geo.js';
import { followBtnHTML } from '../components/follows.js';

export let peopleViewMode = 'rankings';

export function setPeopleView(mode) {
  peopleViewMode = mode;
  document.getElementById('peopleViewRankings').classList.toggle('active', mode === 'rankings');
  document.getElementById('peopleViewMembers').classList.toggle('active', mode === 'members');
  document.getElementById('rankingFilters').style.display = mode === 'rankings' ? 'flex' : 'none';
  const grid = document.getElementById('peopleGrid');
  grid.style.gridTemplateColumns = mode === 'members' ? 'repeat(auto-fill,minmax(260px,1fr))' : '';
  grid.style.display = mode === 'members' ? 'grid' : 'flex';
  grid.style.flexDirection = mode === 'rankings' ? 'column' : '';
  if (mode === 'rankings') renderRankings();
  else renderPeople();
}

function computeUserScore(uid, allUserItems, followersMap) {
  const items = allUserItems[uid] || [];
  const now = Date.now();
  const ms30 = 30 * 24 * 60 * 60 * 1000;

  // Metrics
  const reviewCount = items.length;
  const followers = followersMap[uid] || 0;
  const categories = new Set(items.map(i => i.category).filter(Boolean)).size;
  const bakeries = new Set(items.map(i => i.bakeryName).filter(Boolean)).size;
  const cities = new Set(items.map(i => extractCity(i.bakeryAddress || '')).filter(Boolean)).size;
  // Review quality: avg length of notes (rewards effort, not generosity)
  const avgNoteLength = items.length
    ? items.reduce((s, i) => s + (i.notes?.trim().length || 0), 0) / items.length
    : 0;
  // Scale: 0 chars = 0pts, 100+ chars = 4pts, 200+ chars = 8pts (cap at 8)
  const qualityScore = Math.min(8, (avgNoteLength / 25));

  // Weighted score (tunable)
  const score = (
    reviewCount * 3 +
    followers * 5 +
    categories * 4 +
    bakeries * 2 +
    cities * 6 +
    qualityScore * 4
  );

  // Trend: score based on last 30d vs previous 30d
  const recent = items.filter(i => {
    const ts = i.createdAt?.toDate ? i.createdAt.toDate() : (i.createdAt ? new Date(i.createdAt) : null);
    return ts && (now - ts.getTime()) < ms30;
  });
  const prev = items.filter(i => {
    const ts = i.createdAt?.toDate ? i.createdAt.toDate() : (i.createdAt ? new Date(i.createdAt) : null);
    return ts && (now - ts.getTime()) >= ms30 && (now - ts.getTime()) < ms30 * 2;
  });
  const recentScore = recent.length * 3 + new Set(recent.map(i => i.bakeryName)).size * 2;
  const prevScore = prev.length * 3 + new Set(prev.map(i => i.bakeryName)).size * 2;

  return { score, reviewCount, followers, categories, bakeries, cities, avgNoteLength, recentScore, prevScore };
}

export function computeCountryRank(uid, country) {
  // Build per-user item maps filtered to bakeries in this country
  const allUserItems = {};
  allItems.forEach(item => {
    if (!item.userId) return;
    const itemCountry = extractCountry(item.bakeryAddress || '');
    if (itemCountry !== country) return;
    if (!allUserItems[item.userId]) allUserItems[item.userId] = [];
    allUserItems[item.userId].push(item);
  });

  // Also include users whose profile home country matches, even with no country-specific reviews
  Object.keys(allProfiles).forEach(puid => {
    const p = allProfiles[puid];
    const pc = p.country || extractCountry(p.location || '');
    if (pc === country && !allUserItems[puid]) allUserItems[puid] = [];
  });

  if (!allUserItems[uid]) return { rank: null };

  // Followers map — not easily available here without a Firestore fetch, so omit from country rank
  const followersMap = {};

  const ranked = Object.keys(allUserItems)
    .map(u => ({ uid: u, score: computeUserScore(u, allUserItems, followersMap).score }))
    .sort((a, b) => b.score - a.score);

  const rank = ranked.findIndex(r => r.uid === uid) + 1;
  return { rank: rank || null, total: ranked.length };
}

export function populateRankingLocationFilter() {
  const sel = document.getElementById('rankingLocationFilter');
  if (!sel) return;
  const level = document.getElementById('rankingLevelFilter')?.value || 'city';
  const locations = new Set();
  allItems.forEach(i => {
    const loc = level === 'city' ? extractCity(i.bakeryAddress || '') : extractCountry(i.bakeryAddress || '');
    if (loc) locations.add(loc);
  });
  const current = sel.value;
  sel.innerHTML = `<option value="">📍 All ${level === 'city' ? 'cities' : 'countries'}</option>` +
    [...locations].sort().map(l => `<option value="${l}" ${l === current ? 'selected' : ''}>${l}</option>`).join('');
}

export async function renderRankings() {
  const grid = document.getElementById('peopleGrid');
  grid.innerHTML = '<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div></div>';

  const locationFilter = document.getElementById('rankingLocationFilter')?.value || '';
  const level = document.getElementById('rankingLevelFilter')?.value || 'city';

  // Build per-user item map (filter by location if set)
  const allUserItems = {};
  allItems.forEach(item => {
    if (!item.userId) return;
    if (locationFilter) {
      const loc = level === 'city' ? extractCity(item.bakeryAddress || '') : extractCountry(item.bakeryAddress || '');
      if (loc !== locationFilter) return;
    }
    if (!allUserItems[item.userId]) allUserItems[item.userId] = [];
    allUserItems[item.userId].push(item);
  });

  // Build followers map from follows data
  const followersMap = {};
  try {
    const { db, collection, getDocs } = fb;
    const snap = await getDocs(collection(db, 'follows'));
    snap.docs.forEach(d => {
      const fid = d.data().followingId;
      if (fid) followersMap[fid] = (followersMap[fid] || 0) + 1;
    });
  } catch(e) {}

  // Score all users who have items
  const users = Object.keys(allUserItems).map(uid => {
    const profile = allProfiles[uid] || {};
    const metrics = computeUserScore(uid, allUserItems, followersMap);
    return { uid, metrics, profile,
      name: profile.displayName || allUserItems[uid][0]?.userName || 'Anonymous',
      photo: profile.photoURL || allUserItems[uid][0]?.userPhoto || null,
      location: profile.location || ''
    };
  }).sort((a, b) => b.metrics.score - a.metrics.score);

  if (!users.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏆</div><div class="empty-state-title">No rankings yet</div><div class="empty-state-text">Start reviewing to appear on the leaderboard.</div></div>`;
    return;
  }

  const posEmoji = ['🥇','🥈','🥉'];
  grid.innerHTML = users.map((u, i) => {
    const m = u.metrics;
    const pos = i + 1;
    const posClass = pos <= 3 ? `top-${pos}` : 'other';
    const posLabel = pos <= 3 ? posEmoji[i] : `#${pos}`;
    const isMe = currentUser && u.uid === currentUser.uid;

    // Trend
    let trendHTML = '';
    if (m.prevScore > 0 || m.recentScore > 0) {
      const diff = m.recentScore - m.prevScore;
      if (diff > 2) trendHTML = `<span class="ranking-trend up">▲ Rising</span>`;
      else if (diff < -2) trendHTML = `<span class="ranking-trend down">▼ Falling</span>`;
      else if (m.recentScore > 0) trendHTML = `<span class="ranking-trend flat">→ Steady</span>`;
    } else if (m.recentScore > 0) {
      trendHTML = `<span class="ranking-trend up">✦ New</span>`;
    }

    const avatarInner = u.photo ? `<img src="${u.photo}" alt="${u.name}">` : u.name.charAt(0).toUpperCase();
    const metaParts = [
      `${m.reviewCount} review${m.reviewCount !== 1 ? 's' : ''}`,
      `${m.bakeries} baker${m.bakeries !== 1 ? 'ies' : 'y'}`,
      m.cities > 1 ? `${m.cities} cities` : '',
      m.avgNoteLength > 20 ? '✍️ detailed' : '',
    ].filter(Boolean);

    return `<div class="ranking-card${pos <= 3 ? ` top-${pos}` : ''}${isMe ? ' is-me' : ''}" data-onclick="openProfileModal" data-args='${dataArgs([u.uid])}'>
      <div class="ranking-pos ${posClass}">${posLabel}</div>
      <div class="ranking-avatar">${avatarInner}</div>
      <div class="ranking-info">
        <div class="ranking-name">${u.name}</div>
        ${u.location ? `<div class="ranking-location">📍 ${u.location}</div>` : ''}
        <div class="ranking-meta">${metaParts.join(' · ')}</div>
      </div>
      <div class="ranking-right">
        ${isMe ? '<span class="ranking-me-badge">You</span>' : ''}
        ${trendHTML}
      </div>
    </div>`;
  }).join('');

}

export function renderPeople() {
  const grid = document.getElementById('peopleGrid');
  if (!grid) return;
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(260px,1fr))';
  grid.style.flexDirection = '';
  const members = {};
  allItems.forEach(item => {
    if (!item.userId) return;
    if (!members[item.userId]) members[item.userId] = { uid: item.userId, name: item.userName || 'Anonymous', photo: item.userPhoto || null, reviews: 0, totalRating: 0 };
    members[item.userId].reviews++;
    members[item.userId].totalRating += (item.overallRating || 0);
  });
  Object.keys(members).forEach(uid => {
    if (allProfiles[uid]) {
      const p = allProfiles[uid];
      members[uid].name = p.displayName || members[uid].name;
      members[uid].photo = p.photoURL || members[uid].photo;
      members[uid].location = p.location || '';
    }
  });
  Object.entries(allProfiles).forEach(([uid, p]) => {
    if (!members[uid]) members[uid] = { uid, name: p.displayName || 'Anonymous', photo: p.photoURL || null, location: p.location || '', reviews: 0, totalRating: 0 };
  });
  const list = Object.values(members).sort((a, b) => b.reviews - a.reviews);
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👤</div><div class="empty-state-title">No members yet</div><div class="empty-state-text">Sign in and start reviewing to join the community.</div></div>`;
    return;
  }
  grid.innerHTML = list.map(m => {
    const initials = (m.name || '?').charAt(0).toUpperCase();
    const avatarInner = m.photo ? `<img src="${m.photo}" alt="${m.name}">` : initials;
    const avg = m.reviews ? (m.totalRating / m.reviews).toFixed(1) : '–';
    const followBtn = currentUser && m.uid !== currentUser.uid ? followBtnHTML(m.uid, false) : '';
    const cardAction = currentUser
      ? `data-onclick="openProfileModal" data-args='${dataArgs([m.uid])}'`
      : `data-onclick="openAuthModal"`;
    return `<div class="member-card" ${cardAction}>
      <div class="member-avatar-lg">${avatarInner}</div>
      <div class="member-info">
        <div class="member-name">${m.name || 'Anonymous'}</div>
        ${m.location ? `<div class="member-location">📍 ${m.location}</div>` : ''}
        <div class="member-stats">${m.reviews} review${m.reviews !== 1 ? 's' : ''} · avg ${avg}</div>
      </div>
      ${followBtn}
    </div>`;
  }).join('');
}

registerActions({ setPeopleView, renderRankings, populateRankingLocationFilter });
