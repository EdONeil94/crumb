// ─── EDIT REVIEW (partial) ──────────────────────────────────────────────────
// The Edit Review modal (pages/components carving, Phase 2 step 9 — see
// CLAUDE.md). Split, not moved wholesale, per explicit confirmation:
// handleEditPhoto()/saveEdit()/deleteReview() each depend on code not yet
// extracted (compressImage()/compressToDataURL() — step 18,
// addReviewModal.js; loadData() — deferred since 3b, step 29;
// renderLeaderboard()/lbCurrentTab — step 27, leaderboard.js) and stay in
// legacy-app.js, deferred — see CLAUDE.md's own callout for the exact
// trigger condition.
//
// editingItemId/editPhotoFile/editPhotoDataURL are read/written from BOTH
// sides of this split (handleEditPhoto, staying behind, writes
// editPhotoFile/editPhotoDataURL; saveEdit/deleteReview, also staying,
// read editingItemId) — exported as live bindings + setters for the two
// that get written from outside this module, same pattern as
// src/state/appState.js.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { allItems, currentUser } from '../state/appState.js';
import { CATEGORY_TREE, getTastingDims } from '../data/categories.js';
import { lockScroll, unlockScroll } from '../utils/dom.js';

export let editingItemId = null;
export let editPhotoFile = null;
export let editPhotoDataURL = null;

export function setEditPhotoFile(file) { editPhotoFile = file; }
export function setEditPhotoDataURL(url) { editPhotoDataURL = url; }

export function openEditModal(id) {
  const item = allItems.find(i => i.id === id);
  if (!item || !currentUser || currentUser.uid !== item.userId) return;
  editingItemId = id;
  editPhotoFile = null;
  editPhotoDataURL = item.photoURL || null;

  const editDims = getTastingDims(item.category || 'other');
  const dimsHTML = editDims.map(d => {
    const val = item[d.key] || 0;
    return `
      <div>
        <div class="tasting-dim-label">
          <span class="tasting-dim-name">${d.label}${d.tip ? `<span style="font-size:0.68rem;font-weight:400;color:var(--text-muted);margin-left:6px;">${d.tip}</span>` : ''}</span>
          <span class="tasting-dim-val" id="edit_display_${d.key}">${parseFloat(val).toFixed(1)}</span>
        </div>
        <input type="range" class="rating-slider" id="edit_${d.key}"
          min="0" max="5" step="0.1" value="${val}"
          data-oninput="updateDimDisplay" data-args='${dataArgs([`edit_display_${d.key}`])}'>
      </div>`;
  }).join('');

  const photoSection = item.photoURL
    ? `<div class="photo-preview" id="editPhotoWrap">
        <img src="${item.photoURL}" alt="Current photo" style="max-height:180px;width:100%;object-fit:cover;border-radius:var(--radius);">
        <button class="photo-preview-remove" data-onclick="clearEditPhoto">✕</button>
       </div>`
    : `<div class="photo-upload" id="editPhotoWrap">
        <input type="file" accept="image/*" id="editPhotoInput" data-onchange="handleEditPhoto">
        <div class="photo-upload-icon">📷</div>
        <div class="photo-upload-text">Tap to add a photo</div>
       </div>`;

  // Build category selects
  const parentOptions = Object.entries(CATEGORY_TREE).map(([key, cat]) =>
    `<option value="${key}" ${(item.category || '') === key ? 'selected' : ''}>${cat.emoji} ${cat.label}</option>`
  ).join('');

  const currentParent = item.category || 'other';
  const currentSubs = CATEGORY_TREE[currentParent]?.subs || {};
  const subOptions = Object.entries(currentSubs).map(([key, label]) =>
    `<option value="${key}" ${(item.subCategory || '') === key ? 'selected' : ''}>${label}</option>`
  ).join('');

  document.getElementById('editModalBody').innerHTML = `
    <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:20px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Photo</label>
        ${photoSection}
        <label class="form-label" style="font-size:0.72rem;cursor:pointer;color:var(--caramel);margin-top:8px;display:inline-block;">
          <input type="file" accept="image/*" style="display:none;" data-onchange="handleEditPhoto"> 🔄 Replace photo
        </label>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="editName" value="${item.name || ''}">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Category</label>
        <select class="form-select" id="editCategory" data-onchange="updateEditSubCategory">
          ${parentOptions}
        </select>
      </div>
      <div class="form-group" style="margin:0;" id="editSubCategoryGroup">
        <label class="form-label">Type</label>
        <select class="form-select" id="editSubCategory">
          <option value="">— Select type —</option>
          ${subOptions}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Price paid</label>
        <div style="position:relative;">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-weight:600;">£</span>
          <input type="number" class="form-input" id="editPrice" value="${item.price || ''}" step="0.01" min="0" style="padding-left:30px;">
        </div>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Overall rating</label>
        <div class="rating-value-display" id="editOverallDisplay">${parseFloat(item.overallRating || 0).toFixed(1)}</div>
        <input type="range" class="rating-slider" id="editOverallRating" min="0" max="5" step="0.1" value="${item.overallRating || 0}"
          data-oninput="updateDimDisplay" data-args='${dataArgs(['editOverallDisplay'])}'>
        <div class="rating-scale-labels"><span>0 — Stale</span><span>2.5 — Decent</span><span>5 — Legendary</span></div>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label" style="margin-bottom:16px;">Tasting dimensions</label>
        <div class="tasting-dims">${dimsHTML}</div>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="editNotes" style="min-height:100px;">${item.notes || ''}</textarea>
      </div>
    </div>`;

  document.getElementById('editModal').classList.add('open');
  lockScroll();
}

// Shared by every per-dimension rating slider — the edit form's, and (via
// buildTastingDims, ADD ITEM MODAL — still in legacy-app.js) the add
// form's — plus each form's own overall-rating slider. Each one's own
// live-value display span id is passed via data-args, and the slider
// itself arrives as the trailing element (delegate.js's convention for
// handlers that need the live value). Originally named
// updateEditDimDisplay, before the add form's identical inline oninput=
// was converted to reuse it instead of adding a near-duplicate. No JS
// import needed back into legacy-app.js — buildTastingDims references it
// only via a data-oninput="updateDimDisplay" string, resolved at runtime
// through the shared actions.js registry regardless of which file
// registers it.
export function updateDimDisplay(displayId, el) {
  document.getElementById(displayId).textContent = parseFloat(el.value).toFixed(1);
}

export function updateEditSubCategory() {
  const parentKey = document.getElementById('editCategory')?.value;
  const subSel = document.getElementById('editSubCategory');
  if (!subSel || !parentKey) return;
  const subs = CATEGORY_TREE[parentKey]?.subs || {};
  subSel.innerHTML = '<option value="">— Select type —</option>' +
    Object.entries(subs).map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
}

export function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  unlockScroll();
  editingItemId = null;
}

export function clearEditPhoto() {
  editPhotoFile = null;
  editPhotoDataURL = null;
  const wrap = document.getElementById('editPhotoWrap');
  if (wrap) wrap.innerHTML = `<div style="background:var(--parchment-dark);border-radius:var(--radius);height:80px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.85rem;">No photo</div>`;
}

registerActions({ openEditModal, updateDimDisplay, updateEditSubCategory, closeEditModal, clearEditPhoto });
