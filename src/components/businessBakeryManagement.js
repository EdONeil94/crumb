// ─── BUSINESS — BAKERY PAGE MANAGEMENT ───────────────────────────────────────
// Extracted from src/legacy-app.js (2026-08-26, Phase 6 step 24). The
// Settings page's Business section (`#settingsBusinessCard`, shown when
// `isBusiness()`) and its "Edit page" flow (`#bakeryEditModal`) — a
// business owner's or admin's own bakery page (name/blurb/website/
// instagram/cover photo, the `bakeries` Firestore collection). Genuinely
// one clean, self-contained feature, no splits needed — confirmed by
// reading every function's own dependencies before moving anything, per
// steps 19-23's own repeated lesson, rather than assuming from the
// section's single header this time actually matched its own code (unlike
// steps 19/20/22/23's own findings, it did).
//
// Distinct from — and not to be confused with — src/components/
// adminPanel.js's "MANAGE BAKERY" cluster (Phase 6 step 23): that one owns
// `#manageBakeryModal` and the `bakeryProfiles` collection, reached from
// the Admin Panel's Bakeries tab and (confusingly) also from the bakery
// profile modal's own second "✏️ Edit page" button. This file's
// `openBakeryEditModal` is bakeryModal.js's *other* "✏️ Edit page" button
// (line ~316, `isOwner`-gated) plus Settings' own Business section —
// genuinely two separate features with near-identical names, writing to
// two separate Firestore collections (`bakeries` here, `bakeryProfiles`
// there) — a pre-existing naming quirk in the app, not something this
// extraction introduces or is in scope to fix. Worth noting while already
// here: `isOwner` and `canManage`, the two gates behind bakeryModal.js's
// two different "Edit page" buttons, are literally the same boolean
// (`canManage = isOwner`) — both buttons show simultaneously to the same
// owner/admin, a pre-existing UI redundancy, also out of scope.
//
// Carries forward, unfixed, the pre-existing bug CLAUDE.md's own "Known
// pre-existing issues" already documents: renderBusinessSection() reads
// the module-level allBakeries directly with no buildBakeryIndex() call of
// its own, so going straight to Settings on a fresh session can show "No
// bakeries assigned yet" for an admin who actually manages all of them —
// that cache is only ever populated as a side effect of visiting a page
// that does call buildBakeryIndex() (Bakeries, a bakery profile). Left
// as-is, matching this plan's own established treatment of pre-existing
// bugs surfaced while extracting (e.g. the Admin Panel's own
// #adminUsersPanel bug, step 23).
//
// Every real (non-markup) call site checked before moving, per step 22's
// own lesson: renderBusinessSection() is called as plain JS from
// openSettingsPage() (stays in legacy-app.js — Settings page, Phase 7 step
// 32) and closeBakeryEditModal() from the modal's own outside-click
// listener and the keydown Escape handler (also stay) — both exported and
// imported back one-way. openBakeryEditModal/handleBakeryEditPhoto/
// saveBakeryPage are reached only via delegated markup (this file's own
// Edit-page button, bakeryModal.js's Edit-page button, and
// #bakeryEditModal's own static Cancel/Save/close buttons in index.html,
// all already fully data-onclick-delegated, confirmed via grep — no raw
// handlers left in this cluster, unlike adminPanel.js's #manageBakeryModal)
// — none need export, matching steps 21-23's minimal-export precedent.
//
// compressImage imports one-way from addReviewModal.js, the same
// already-established shared utility adminPanel.js also uses (step 23) —
// no cycle, confirmed addReviewModal.js imports nothing from here.
import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import {
  currentUser, fb, allBakeries, currentUserBakery, isAdmin,
} from '../state/appState.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { compressImage } from './addReviewModal.js';

export function renderBusinessSection() {
  const body = document.getElementById('settingsBusinessBody');
  const myBakeries = isAdmin()
    ? Object.keys(allBakeries || {})
    : (currentUserBakery ? [currentUserBakery] : []);

  if (!myBakeries.length) {
    body.innerHTML = `<div class="empty-state" style="padding:20px 0;"><div class="empty-state-icon">🏪</div><div class="empty-state-title">No bakeries assigned yet</div><div class="empty-state-text">Ask an admin to assign your bakery to your account.</div></div>`;
    return;
  }
  body.innerHTML = myBakeries.map(name => {
    const b = allBakeries[name];
    const avg = b ? (b.totalScore / b.items.length).toFixed(1) : '–';
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600; color:var(--espresso);">${name}</div>
          <div style="font-size:0.78rem; color:var(--text-muted);">${b ? b.items.length : 0} reviews · avg ${avg}</div>
        </div>
        <button class="btn-caramel" style="font-size:0.82rem; padding:8px 14px;" data-onclick="openBakeryEditModal" data-args='${dataArgs([name])}'>✏️ Edit page</button>
      </div>`;
  }).join('');
}

let editingBakeryName = null;
let bakeryEditPhotoFile = null;

async function openBakeryEditModal(bakeryName) {
  editingBakeryName = bakeryName;
  bakeryEditPhotoFile = null;
  document.getElementById('bakeryEditModalTitle').textContent = bakeryName;
  document.getElementById('bakeryEditModal').classList.add('open');
  lockScroll();

  // Load current bakery data
  let bData = {};
  try {
    const { db, doc, getDoc } = fb;
    const snap = await getDoc(doc(db, 'bakeries', encodeURIComponent(bakeryName)));
    if (snap.exists()) bData = snap.data();
  } catch(e) {}

  const photoPreview = bData.coverPhotoURL
    ? `<div class="photo-preview"><img src="${bData.coverPhotoURL}" style="max-height:180px;width:100%;object-fit:cover;border-radius:var(--radius);"></div>`
    : `<div class="photo-upload" style="height:120px;">
        <input type="file" accept="image/*" id="bakeryEditPhotoInput" data-onchange="handleBakeryEditPhoto">
        <div class="photo-upload-icon">🏪</div>
        <div class="photo-upload-text">Add a cover photo</div>
       </div>`;

  document.getElementById('bakeryEditModalBody').innerHTML = `
    <div style="padding:0 0 20px; display:flex; flex-direction:column; gap:16px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Cover photo</label>
        <div id="bakeryEditPhotoWrap">${photoPreview}</div>
        ${bData.coverPhotoURL ? `<label style="cursor:pointer;font-size:0.78rem;color:var(--caramel);margin-top:6px;display:inline-block;">🔄 Change photo<input type="file" accept="image/*" style="display:none;" data-onchange="handleBakeryEditPhoto"></label>` : ''}
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">About this bakery</label>
        <textarea class="form-textarea" id="bakeryEditBlurb" style="min-height:100px;" placeholder="Tell your story — what makes your bakery special, what to order, when to visit…">${bData.blurb || ''}</textarea>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Website</label>
        <input type="url" class="form-input" id="bakeryEditWebsite" placeholder="https://yourbakery.com" value="${bData.website || ''}">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Instagram</label>
        <div style="position:relative;">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);">@</span>
          <input type="text" class="form-input" id="bakeryEditInstagram" placeholder="yourbakery" value="${bData.instagram || ''}" style="padding-left:30px;">
        </div>
      </div>
    </div>`;
}

function handleBakeryEditPhoto(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  compressImage(file, 1200, 0.85).then(blob => { bakeryEditPhotoFile = blob; });
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('bakeryEditPhotoWrap').innerHTML =
      `<img src="${e.target.result}" style="max-height:180px;width:100%;object-fit:cover;border-radius:var(--radius);">`;
  };
  reader.readAsDataURL(file);
}

async function saveBakeryPage() {
  if (!editingBakeryName) return;
  const btn = document.querySelector('#bakeryEditModal .btn-espresso');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const { db, storage, doc, setDoc, ref, uploadBytes, getDownloadURL } = fb;
    let coverPhotoURL = null;
    // Get existing first
    const snap = await fb.getDoc(doc(db, 'bakeries', encodeURIComponent(editingBakeryName)));
    if (snap.exists()) coverPhotoURL = snap.data().coverPhotoURL || null;

    if (bakeryEditPhotoFile) {
      const storageRef = ref(storage, `bakeries/${encodeURIComponent(editingBakeryName)}/cover.jpg`);
      const s = await uploadBytes(storageRef, bakeryEditPhotoFile, { contentType: 'image/jpeg' });
      coverPhotoURL = await getDownloadURL(s.ref);
    }
    const data = {
      name: editingBakeryName,
      blurb: document.getElementById('bakeryEditBlurb').value.trim(),
      website: document.getElementById('bakeryEditWebsite').value.trim(),
      instagram: document.getElementById('bakeryEditInstagram').value.trim().replace('@',''),
      coverPhotoURL,
      ownedBy: currentUser.uid,
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'bakeries', encodeURIComponent(editingBakeryName)), data, { merge: true });
    closeBakeryEditModal();
    showToast('Bakery page updated ✓');
  } catch(e) { showToast('Could not save'); console.error(e); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; } }
}

export function closeBakeryEditModal() {
  document.getElementById('bakeryEditModal').classList.remove('open');
  unlockScroll();
  editingBakeryName = null;
}

// renderBusinessSection is exported above purely for legacy-app.js's own
// plain-JS caller (openSettingsPage) — it has no delegated markup of its
// own, so no registration needed. closeBakeryEditModal is exported for
// legacy-app.js's own outside-click/keydown-Escape listeners AND needs
// registering here too — index.html's own static #bakeryEditModal markup
// reaches it via data-onclick, a real bug caught by check:dead-refs
// (missed on the first pass: exporting a function for plain-JS use and
// registering it as a delegated action are two separate mechanisms, easy
// to conflate). openBakeryEditModal/handleBakeryEditPhoto/saveBakeryPage
// are only ever reached via delegated markup, so this is the only
// registration each of them needs.
registerActions({
  openBakeryEditModal, closeBakeryEditModal, handleBakeryEditPhoto, saveBakeryPage,
});
