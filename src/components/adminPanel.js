// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
// Extracted from src/legacy-app.js (2026-08-26, Phase 6 step 23). Opens
// Phase 6. The Settings page's "⚙️ Admin Panel" card (`#settingsAdminCard`,
// only shown when `isAdmin()`) — its Users/Bakeries/Flags/Features tab
// dispatcher, all four tab renderers, the Users tab's promote/assign/remove
// actions, the Flags tab's dismiss/remove actions, the Features tab's own
// admin-only vote/status/delete actions, and the "Manage bakery" modal
// (`#manageBakeryModal`) reached from both the Bakeries tab and a bakery
// profile modal's own "Edit page" button.
//
// CLAUDE.md's own plan described this as "5 headers, one real feature":
// ADMIN PANEL, ADMIN PANEL RENDERERS, MANAGE BAKERY, REVIEW FLAGGING
// (empty — genuinely no code under it, confirmed), FLAG REVIEW. Verified by
// reading each function's own dependencies and actual DOM reachability
// before moving anything, per steps 19-22's own repeated lesson — and this
// time the plan's own framing turned out to be an overstatement, not
// confirmed as-is:
//
// - **`flagReview`** (the whole reason "FLAG REVIEW" has its own header)
//   did **not** move here, despite the plan's framing. It's the
//   general-purpose "report a review" action — reachable by any signed-in
//   user from the item detail modal's flag button
//   (`src/components/itemDetailModal.js`), gated only on `currentUser`, not
//   `isAdmin()`. Its only relationship to this cluster is writing to the
//   same `flaggedReviews` Firestore collection that `renderAdminFlags`
//   later reads — the same "shares a collection, not a feature" shape as
//   `toggleSaveItem`/`removeSavedItem` vs. `renderSavedTab` (step 22).
//   Stays in `legacy-app.js`, registered from there via its own existing
//   `registerActions({ toggleSaveItem, flagReview })` call, untouched.
// - **`refreshAdminUsersPanel`**, **`promoteUser`**, **`promptAssignBakery`**,
//   **`removeUserRole`**, and dead code **`renderAdminUsers`** (see below)
//   were **not** under any of the 5 named headers at all — they live under
//   the file's much earlier, otherwise-fully-migrated "ROLES" section
//   (`SUPER_ADMIN_UID`/`currentUserRole`/etc. all moved to
//   `src/state/appState.js` back in Phase 0 step 3a), a "position vs.
//   topic" split this plan has now hit repeatedly. Confirmed by reading —
//   all five are genuinely Users-tab admin actions, moved here regardless
//   of which header they sat under.
// - The whole **FEATURE REQUESTS** section split, same shape as
//   step 22's Activity Calendar/Dining Map (a real cluster never named as
//   its own plan step): `openFeatureRequestModal`/`closeFeatureRequestModal`/
//   `submitFeatureRequest` are the general "💡 Request a feature" submit
//   flow, reachable by any signed-in user from the avatar dropdown menu —
//   stayed in `legacy-app.js`, untouched. `renderAdminFeatures`/
//   `toggleFeatureVote`/`updateFeatureStatus`/`deleteFeatureRequest` moved
//   here: `renderAdminFeatures` only ever renders into `#adminTabContent`
//   (this cluster's own tab content area, confirmed via DOM id), and the
//   other three exist solely to mutate that data and then re-call
//   `renderAdminFeatures()` — `toggleFeatureVote` isn't itself
//   `isAdmin()`-gated in its own body, but its only reachable UI (the
//   upvote button inside `renderAdminFeatures`'s own markup) lives entirely
//   inside the admin-gated panel, so by actual current reachability — not
//   theoretical future reachability — it belongs here.
//
// **`renderAdminUsers`** (found under NOTIFICATIONS/UTILS, nowhere near any
// of this cluster's own headers) is genuinely dead code, moved here anyway
// since it's the exact same feature and carries the exact same bug as
// `refreshAdminUsersPanel` (see below) — surfaced, not fixed, matching this
// plan's own established treatment of pre-existing bugs found while
// extracting (e.g. `renderBusinessSection()`'s missing `buildBakeryIndex()`
// call, CLAUDE.md's own "Known pre-existing issues").
//
// **A real, previously-undocumented bug surfaced while reading, not
// introduced by this move**: both `refreshAdminUsersPanel()` and
// `renderAdminUsers()` target `document.getElementById('adminUsersPanel')`
// — an element id that does not exist anywhere in `index.html` (confirmed
// via grep). The real Users tab renders into `#adminTabContent`
// (`showAdminTab`'s own target), a different element entirely. Both
// functions' own `if (panel) ...` guard means this fails silently: after
// `promoteUser`/`promptAssignBakery`/`removeUserRole` succeed, the visible
// Users list does **not** refresh in place — an admin has to re-click the
// Users tab to see the change. Left as-is, per this extraction's own scope
// (surface, don't fix).
//
// Two genuinely blocked calls, resolved via the `getAction()` pattern from
// steps 18/21 rather than a forbidden direct import back into
// `legacy-app.js`: `renderAdminBakeriesHTML()` calls `buildBakeryIndex()`
// (stays in `legacy-app.js`, still blocked on Explore's `exploreCache` —
// Phase 0 step 3b / Phase 7 step 29's own already-documented note) —
// already registered as an action since step 21 (bakeryModal.js's
// `openBakeryProfile` uses the same lookup), so this reuses that existing
// registration rather than adding a new one. `removeReviewAndFlag()` calls
// `loadData()` (also stays in `legacy-app.js`, same Phase 7 step 29
// blocker) — `loadData` had no existing action registration, so
// `legacy-app.js` now registers it via a new `registerActions({ loadData })`
// call for this lookup to resolve, the same treatment `saveReview` got at
// step 18.
//
// Every other dependency has a real importable home already:
// `openBakeryProfile` is only ever referenced via this cluster's own
// markup (no import needed); `compressImage`/`compressToDataURL` import
// one-way from `addReviewModal.js` (already a 5-external-caller shared
// utility since step 18); `openAuthModal` one-way from `authModal.js`.
//
// Export policy follows steps 21/22's precedent (minimal — only functions
// with a real external caller elsewhere get `export`): `showAdminTab`
// (plain-JS call from `openSettingsPage()`, defaulting the panel to the
// Users tab), `closeManageBakeryModal` (the modal's own outside-click
// listener), `handleBakeryPhoto`/`saveBakeryProfile` (the two raw,
// undelegated handlers on `#manageBakeryModal` itself — `onchange=
// "handleBakeryPhoto(this)"` and `onclick="saveBakeryProfile()"`,
// `index.html:988`/`:1009`, the admin-only "Manage Bakery assignment
// modal" already named in the handler-delegation migration's own status
// table as permanently out of scope — kept in `legacy-app.js`'s
// `WINDOW EXPORTS`, imported back one-way). Everything else is markup-only
// or same-file-internal.
import { registerActions, getAction } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import {
  SUPER_ADMIN_UID, currentUser, fb, allUserRoles, bakeryProfiles, isAdmin,
  ownsBakery, loadAllUserRoles, allItems, allBakeries, allProfiles,
} from '../state/appState.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { compressImage, compressToDataURL } from './addReviewModal.js';
import { openAuthModal } from './authModal.js';

async function refreshAdminUsersPanel() {
  await loadAllUserRoles();
  const panel = document.getElementById('adminUsersPanel');
  if (panel) panel.innerHTML = renderAdminUsersHTML();
}

async function promoteUser(uid, role, bakeryName) {
  if (!isAdmin() || !fb) return;
  if (!confirm(`Make this user an admin? They will get full admin access.`)) return;
  const { db, doc, setDoc } = fb;
  try {
    await setDoc(doc(db, 'userRoles', uid), { role, bakeryName: bakeryName || '' }, { merge: true });
    showToast('✅ User promoted to admin');
    await refreshAdminUsersPanel();
  } catch(e) { showToast('Could not update role'); console.error(e); }
}

async function promptAssignBakery(uid, name) {
  if (!isAdmin() || !fb) return;
  const bakeryName = prompt(`Assign which bakery to ${name}? (Enter the exact bakery name as it appears on Crumbz)`);
  if (bakeryName === null) return; // cancelled
  if (!bakeryName.trim()) { showToast('Bakery name cannot be empty'); return; }
  const { db, doc, setDoc } = fb;
  try {
    await setDoc(doc(db, 'userRoles', uid), { role: 'business', bakeryName: bakeryName.trim() }, { merge: true });
    showToast(`✅ ${name} assigned to ${bakeryName.trim()}`);
    await refreshAdminUsersPanel();
  } catch(e) { showToast('Could not assign bakery'); console.error(e); }
}

async function removeUserRole(uid) {
  if (!isAdmin() || !fb) return;
  if (!confirm('Remove this user\'s admin/business role? They will go back to being a regular member.')) return;
  const { db, doc, deleteDoc } = fb;
  try {
    await deleteDoc(doc(db, 'userRoles', uid));
    showToast('Role removed');
    await refreshAdminUsersPanel();
  } catch(e) { showToast('Could not remove role'); console.error(e); }
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
export async function showAdminTab(tab) {
  ['users','bakeries','flags','features'].forEach(t => {
    const btn = document.getElementById('adminTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) {
      btn.className = t === tab ? 'btn-espresso' : 'btn-ghost';
      btn.style.cssText = t === tab ? 'font-size:0.85rem;padding:9px 18px;' : 'font-size:0.85rem;padding:9px 18px;border:1.5px solid var(--border);';
    }
  });
  const tabContent = document.getElementById('adminTabContent');
  tabContent.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner" style="margin:0 auto;"></div></div>';

  await loadAllUserRoles();

  if (tab === 'users') {
    tabContent.innerHTML = renderAdminUsersHTML();
  } else if (tab === 'bakeries') {
    tabContent.innerHTML = renderAdminBakeriesHTML();
  } else if (tab === 'flags') {
    tabContent.innerHTML = '<div id="adminFlagsPanel"></div>';
    await renderAdminFlags();
  } else if (tab === 'features') {
    await renderAdminFeatures();
  }
}


async function renderAdminFlags() {
  const panel = document.getElementById('adminFlagsPanel');
  if (!fb) return;
  const { db, collection, getDocs, query, orderBy } = fb;
  try {
    const snap = await getDocs(query(collection(db, 'flaggedReviews'), orderBy('createdAt', 'desc')));
    const flags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!flags.length) {
      panel.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-state-icon">✓</div><div class="empty-state-title">No flagged reviews</div></div>';
      return;
    }
    panel.innerHTML = flags.map(f => {
      const item = allItems.find(i => i.id === f.itemId);
      return `
        <div class="flag-item">
          <div class="flag-item-name">${item?.name || 'Unknown item'} — ${f.bakeryName || ''}</div>
          <div class="flag-item-meta">Flagged by ${f.flaggedByName || 'someone'} · ${f.reason || 'No reason given'}</div>
          <div class="flag-item-actions">
            <button class="admin-btn" data-onclick="dismissFlag" data-args='${dataArgs([f.id])}'>Dismiss flag</button>
            <button class="admin-btn danger" data-onclick="removeReviewAndFlag" data-args='${dataArgs([f.itemId, f.id])}'>Remove review</button>
          </div>
        </div>`;
    }).join('');
  } catch(e) { panel.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load flagged reviews.</div>'; }
}

async function dismissFlag(flagId) {
  const { db, doc, deleteDoc } = fb;
  await deleteDoc(doc(db, 'flaggedReviews', flagId));
  showToast('Flag dismissed');
  renderAdminFlags();
}

async function removeReviewAndFlag(itemId, flagId) {
  if (!confirm('Permanently remove this review?')) return;
  const { db, doc, deleteDoc } = fb;
  await Promise.all([
    deleteDoc(doc(db, 'items', itemId)),
    deleteDoc(doc(db, 'flaggedReviews', flagId))
  ]);
  showToast('Review removed');
  await getAction('loadData')();
  renderAdminFlags();
}



// ─── MANAGE BAKERY ────────────────────────────────────────────────────────────
let managingBakeryName = null;
let bakeryPhotoFile = null;

async function openManageBakeryModal(bakeryName) {
  if (!ownsBakery(bakeryName)) return;
  managingBakeryName = bakeryName;
  bakeryPhotoFile = null;
  document.getElementById('manageBakeryTitle').textContent = bakeryName;

  // Load existing profile
  let profile = bakeryProfiles[encodeURIComponent(bakeryName)] || bakeryProfiles[bakeryName] || {};
  try {
    const { db, doc, getDoc } = fb;
    const snap = await getDoc(doc(db, 'bakeryProfiles', encodeURIComponent(bakeryName)));
    if (snap.exists()) profile = snap.data();
  } catch(e) {}

  document.getElementById('manageBakeryBlurb').value = profile.blurb || '';
  document.getElementById('manageBakeryWebsite').value = profile.website || '';
  document.getElementById('manageBakeryInstagram').value = profile.instagram || '';

  const photoWrap = document.getElementById('bakeryPhotoWrap');
  if (profile.photoURL) {
    photoWrap.innerHTML = `<img src="${profile.photoURL}" class="bakery-hero-photo" alt="${bakeryName}">`;
  } else {
    photoWrap.innerHTML = '🏪';
  }

  document.getElementById('manageBakeryModal').classList.add('open');
  lockScroll();
}

export function closeManageBakeryModal() {
  document.getElementById('manageBakeryModal').classList.remove('open');
  unlockScroll();
}

export async function handleBakeryPhoto(input) {
  if (!input.files[0]) return;
  const compressed = await compressImage(input.files[0], 1400, 0.85);
  bakeryPhotoFile = compressed;
  const dataURL = await compressToDataURL(input.files[0], 1400, 0.85);
  document.getElementById('bakeryPhotoWrap').innerHTML = `<img src="${dataURL}" class="bakery-hero-photo" alt="">`;
}

export async function saveBakeryProfile() {
  if (!managingBakeryName || !fb) return;
  const btn = document.querySelector('#manageBakeryModal .btn-espresso');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { db, storage, doc, setDoc, ref, uploadBytes, getDownloadURL } = fb;
    const key = encodeURIComponent(managingBakeryName);
    let photoURL = bakeryProfiles[key]?.photoURL || null;
    if (bakeryPhotoFile) {
      const storageRef = ref(storage, `bakeries/${key}/hero.jpg`);
      const snap = await uploadBytes(storageRef, bakeryPhotoFile, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(snap.ref);
    }
    const profileData = {
      name: managingBakeryName,
      blurb: document.getElementById('manageBakeryBlurb').value.trim(),
      website: document.getElementById('manageBakeryWebsite').value.trim(),
      instagram: document.getElementById('manageBakeryInstagram').value.trim().replace(/^@/, ''),
      photoURL,
      ownerId: currentUser.uid,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'bakeryProfiles', key), profileData, { merge: true });
    bakeryProfiles[key] = profileData;
    closeManageBakeryModal();
    showToast('Bakery page saved ✓');
  } catch(e) { showToast('Error saving — try again'); console.error(e); }
  finally { btn.disabled = false; btn.textContent = 'Save'; }
}

// ─── ADMIN PANEL RENDERERS ────────────────────────────────────────────────────
function renderAdminUsersHTML() {
  const members = {};
  allItems.forEach(item => {
    if (!item.userId) return;
    if (!members[item.userId]) members[item.userId] = {
      uid: item.userId, name: item.userName || 'Anonymous',
      photo: item.userPhoto || null, reviews: 0
    };
    members[item.userId].reviews++;
  });
  Object.entries(allProfiles).forEach(([uid, p]) => {
    if (!members[uid]) members[uid] = { uid, name: p.displayName || 'Anonymous', photo: p.photoURL || null, reviews: 0 };
    else { members[uid].name = p.displayName || members[uid].name; members[uid].photo = p.photoURL || members[uid].photo; }
  });

  const users = Object.values(members).filter(u => u.uid !== SUPER_ADMIN_UID);
  if (!users.length) return '<div class="empty-state" style="padding:24px 0;"><div class="empty-state-title">No other users yet</div></div>';

  return users.map(u => {
    const role = allUserRoles[u.uid];
    const roleBadge = role?.role === 'admin' ? '<span class="role-badge admin">Admin</span>'
      : role?.role === 'business' ? `<span class="role-badge business">Business · ${role.bakeryName || ''}</span>`
      : '<span style="font-size:0.75rem;color:var(--text-muted);">Member</span>';
    const avatarInner = u.photo ? `<img src="${u.photo}" alt="" style="width:100%;height:100%;object-fit:cover;">` : (u.name || '?').charAt(0).toUpperCase();
    return `
      <div class="admin-user-row">
        <div class="admin-user-avatar">${avatarInner}</div>
        <div class="admin-user-info">
          <div class="admin-user-name">${u.name} ${roleBadge}</div>
          <div class="admin-user-email">${u.reviews} review${u.reviews !== 1 ? 's' : ''}</div>
        </div>
        <div class="admin-user-actions">
          ${role?.role !== 'admin' ? `<button class="admin-btn" data-onclick="promoteUser" data-args='${dataArgs([u.uid, 'admin', ''])}'>Make admin</button>` : ''}
          <button class="admin-btn" data-onclick="promptAssignBakery" data-args='${dataArgs([u.uid, u.name])}'>${role?.role === 'business' ? 'Change bakery' : 'Assign bakery'}</button>
          ${role ? `<button class="admin-btn danger" data-onclick="removeUserRole" data-args='${dataArgs([u.uid])}'>Remove role</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderAdminBakeriesHTML() {
  getAction('buildBakeryIndex')();
  const names = Object.keys(allBakeries);
  if (!names.length) return '<div class="empty-state" style="padding:24px 0;"><div class="empty-state-title">No bakeries yet</div></div>';

  return `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;">
    Assign a bakery to a business user via the Users tab. The table below shows current ownership.</div>` +
  names.map(name => {
    const b = allBakeries[name];
    const owner = Object.entries(allUserRoles).find(([, r]) => r.bakeryName === name);
    const ownerName = owner ? (allProfiles[owner[0]]?.displayName || 'User ' + owner[0].slice(0,6)) : '—';
    const bp = bakeryProfiles[encodeURIComponent(name)] || {};
    const claimed = bp.ownerId ? '<span class="claimed-badge">✓ Claimed</span>' : '';
    return `
      <div class="admin-user-row">
        <div class="admin-user-info">
          <div class="admin-user-name">${name} ${claimed}</div>
          <div class="admin-user-email">${b.items.length} review${b.items.length !== 1 ? 's' : ''} · Owner: ${ownerName}</div>
        </div>
        <div class="admin-user-actions">
          <button class="admin-btn" data-onclick="openBakeryProfile" data-args='${dataArgs([name, ''])}'>View page</button>
          ${isAdmin() ? `<button class="admin-btn primary" data-onclick="openManageBakeryModal" data-args='${dataArgs([name])}'>Edit page</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderAdminUsers() {
  const panel = document.getElementById('adminUsersPanel');
  if (panel) panel.innerHTML = renderAdminUsersHTML();
}

async function toggleFeatureVote(requestId) {
  if (!currentUser) { openAuthModal(); return; }
  const { db, doc, getDoc, updateDoc } = fb;
  try {
    const ref = doc(db, 'featureRequests', requestId);
    const snap = await getDoc(ref);
    const data = snap.data();
    const voterIds = data.voterIds || [];
    const alreadyVoted = voterIds.includes(currentUser.uid);
    const newVoterIds = alreadyVoted
      ? voterIds.filter(id => id !== currentUser.uid)
      : [...voterIds, currentUser.uid];
    await updateDoc(ref, { votes: newVoterIds.length, voterIds: newVoterIds });
    showToast(alreadyVoted ? 'Vote removed' : '👍 Upvoted!');
    await renderAdminFeatures();
  } catch(e) { showToast('Could not save vote'); console.error(e); }
}

async function updateFeatureStatus(requestId, selectEl) {
  if (!isAdmin() || !fb) return;
  const status = selectEl.value;
  const { db, doc, updateDoc } = fb;
  try {
    await updateDoc(doc(db, 'featureRequests', requestId), { status });
    showToast('Status updated');
    await renderAdminFeatures();
  } catch(e) { showToast('Could not update status'); }
}

async function deleteFeatureRequest(requestId) {
  if (!isAdmin() || !confirm('Delete this feature request?')) return;
  const { db, doc, deleteDoc } = fb;
  try {
    await deleteDoc(doc(db, 'featureRequests', requestId));
    showToast('Request deleted');
    await renderAdminFeatures();
  } catch(e) { showToast('Could not delete'); }
}

async function renderAdminFeatures() {
  const panel = document.getElementById('adminTabContent');
  if (!fb || !panel) return;
  const { db, collection, getDocs, query, orderBy } = fb;
  panel.innerHTML = '<div style="text-align:center;padding:24px;"><div class="spinner" style="margin:0 auto;"></div></div>';
  try {
    const snap = await getDocs(query(collection(db, 'featureRequests')));
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.votes || 0) - (a.votes || 0));
    if (!requests.length) {
      panel.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="empty-state-icon">💡</div><div class="empty-state-title">No feature requests yet</div></div>';
      return;
    }
    const statusLabels = { new: 'New', 'under-review': 'Under review', planned: 'Planned', 'in-progress': 'In progress', done: 'Done', declined: 'Declined' };
    panel.innerHTML = requests.map(r => {
      const voted = currentUser && (r.voterIds || []).includes(currentUser.uid);
      const statusClass = (r.status || 'new').replace(' ', '-');
      return `
        <div class="fr-item">
          <div class="fr-vote">
            <button class="fr-vote-btn ${voted ? 'voted' : ''}" data-onclick="toggleFeatureVote" data-args='${dataArgs([r.id])}' title="${voted ? 'Remove vote' : 'Upvote'}">▲</button>
            <div class="fr-vote-count">${r.votes || 0}</div>
          </div>
          <div class="fr-body">
            <div class="fr-title">${r.title || 'Untitled'}</div>
            ${r.detail ? `<div class="fr-detail">${r.detail}</div>` : ''}
            <div class="fr-meta">
              <span class="fr-by">by ${r.userName || 'Anonymous'}</span>
              <span class="fr-status ${statusClass}">${statusLabels[r.status] || 'New'}</span>
            </div>
            <div class="fr-admin-actions">
              <select class="fr-status-select" data-onchange="updateFeatureStatus" data-args='${dataArgs([r.id])}'>
                ${Object.entries(statusLabels).map(([val, label]) => `<option value="${val}" ${r.status === val ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
              <button class="admin-btn danger" data-onclick="deleteFeatureRequest" data-args='${dataArgs([r.id])}'>Delete</button>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    panel.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Could not load feature requests.</div>';
    console.error(e);
  }
}

// showAdminTab/closeManageBakeryModal are exported above for legacy-app.js's
// own remaining callers; everything else below is only ever reached via
// delegated data-onclick/data-onchange markup, so this is the only
// registration each of them needs. handleBakeryPhoto/saveBakeryProfile need
// no registration at all — their only call sites are the two raw,
// undelegated handlers on #manageBakeryModal itself (see header comment).
registerActions({
  showAdminTab, dismissFlag, removeReviewAndFlag,
  promoteUser, promptAssignBakery, removeUserRole,
  openManageBakeryModal, closeManageBakeryModal,
  toggleFeatureVote, updateFeatureStatus, deleteFeatureRequest,
});
