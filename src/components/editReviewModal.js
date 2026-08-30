// ─── EDIT REVIEW ────────────────────────────────────────────────────────────
// The Edit Review modal (pages/components carving, Phase 2 step 9 — see
// CLAUDE.md). Now whole: it was split at step 9 because
// handleEditPhoto()/saveEdit()/deleteReview() each depended on code not yet
// extracted (compressImage()/compressToDataURL() — step 18, addReviewModal.js;
// loadData() — Phase 1 residual #2, appState.js; renderLeaderboard()/
// lbCurrentTab — step 27, leaderboard.js). handleEditPhoto() moved in
// 2026-08-25 (once step 18 landed); saveEdit()/deleteReview() followed
// 2026-08-30 as a post-plan follow-up to residual #2 — its own ⚠️ callout,
// once loadData() became importable from appState.js was the last blocker.
//
// No cycle: this file is imported ONLY by legacy-app.js (the entry point,
// which nothing imports), so importing leaderboard.js / appState.js /
// addReviewModal.js here can't close a loop — verified with
// `npx madge --circular src/`.
//
// editingItemId/editPhotoFile/editPhotoDataURL are module-private now — with
// saveEdit/deleteReview/handleEditPhoto all local, nothing outside this file
// reads or writes them, so they lost their `export` (they were already only
// ever WRITTEN in here; the setters this file used to export died with the
// step-18 handleEditPhoto move).

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { allItems, currentUser, fb, loadData, loadItemRecords } from '../state/appState.js';
import { CATEGORY_TREE, getTastingDims } from '../data/categories.js';
import { lockScroll, unlockScroll, showToast } from '../utils/dom.js';
import { compressImage, compressToDataURL } from './addReviewModal.js';
import { renderLeaderboard, lbCurrentTab } from '../pages/leaderboard.js';

let editingItemId = null;
let editPhotoFile = null;
let editPhotoDataURL = null;

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
// buildTastingDims, now src/components/addReviewModal.js) the add form's —
// plus each form's own overall-rating slider. Each one's own live-value
// display span id is passed via data-args, and the slider itself arrives
// as the trailing element (delegate.js's convention for handlers that need
// the live value). Originally named updateEditDimDisplay, before the add
// form's identical inline oninput= was converted to reuse it instead of
// adding a near-duplicate. No import needed either direction —
// buildTastingDims references it only via a data-oninput="updateDimDisplay"
// string, resolved at runtime through the shared actions.js registry
// regardless of which file registers it.
export function updateDimDisplay(displayId, el) {
  document.getElementById(displayId).textContent = parseFloat(el.value).toFixed(1);
}

async function handleEditPhoto(input) {
  if (!input.files[0]) return;
  const original = input.files[0];
  editPhotoFile = await compressImage(original, 1200, 0.82);
  editPhotoDataURL = await compressToDataURL(original, 1200, 0.82);
  const wrap = document.getElementById('editPhotoWrap');
  if (wrap) wrap.innerHTML = `<img src="${editPhotoDataURL}" style="max-height:180px;width:100%;object-fit:cover;border-radius:var(--radius);">`;
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

async function saveEdit() {
  if (!editingItemId || !currentUser) return;
  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const { db, storage, doc, updateDoc, ref, uploadBytes, getDownloadURL } = fb;
    let photoURL = editPhotoDataURL && !editPhotoFile ? editPhotoDataURL : null;
    if (editPhotoFile) {
      const storageRef = ref(storage, `items/${currentUser.uid}/${Date.now()}_edit.jpg`);
      const snap = await uploadBytes(storageRef, editPhotoFile, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(snap.ref);
    }
    const item = allItems.find(i => i.id === editingItemId);
    const newCategory = document.getElementById('editCategory')?.value || item?.category || 'other';
    const newSubCategory = document.getElementById('editSubCategory')?.value || item?.subCategory || '';
    const overallRating = parseFloat(document.getElementById('editOverallRating').value);
    const editSaveDims = getTastingDims(newCategory);
    const dimData = {};
    editSaveDims.forEach(d => {
      const el = document.getElementById('edit_' + d.key);
      dimData[d.key] = el ? parseFloat(el.value) : 0;
    });
    const updates = {
      name: document.getElementById('editName').value,
      category: newCategory,
      subCategory: newSubCategory,
      price: document.getElementById('editPrice').value ? parseFloat(document.getElementById('editPrice').value) : null,
      overallRating,
      communityAvg: overallRating,
      notes: document.getElementById('editNotes').value,
      ...dimData,
      ...(photoURL !== null ? { photoURL } : {})
    };
    await updateDoc(doc(db, 'items', editingItemId), updates);
    closeEditModal();
    showToast('Review updated ✓');
    await loadData();
  } catch(e) {
    showToast('Could not save — check your connection');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = 'Save changes';
  }
}

async function deleteReview() {
  if (!editingItemId || !currentUser) return;
  const item = allItems.find(i => i.id === editingItemId);
  if (!item || item.userId !== currentUser.uid) return;
  if (!confirm(`Delete your review of "${item.name || 'this item'}"? This cannot be undone.`)) return;
  try {
    const { db, storage, doc, deleteDoc, updateDoc, ref, deleteObject } = fb;
    if (item.photoURL && item.photoURL.includes('firebasestorage')) {
      try { await deleteObject(ref(storage, item.photoURL)); } catch(e) {}
    }

    const itemRecordId = item.itemRecordId;
    await deleteDoc(doc(db, 'items', editingItemId));

    // Clean up the shared itemRecord so a deleted review doesn't leave stale
    // orphaned data lingering on the leaderboard / bakery pages.
    if (itemRecordId) {
      const remaining = allItems.filter(i => i.itemRecordId === itemRecordId && i.id !== editingItemId);
      try {
        if (!remaining.length) {
          // That was the only review for this item — remove the record entirely
          await deleteDoc(doc(db, 'itemRecords', itemRecordId));
        } else {
          // Recalculate every aggregate fresh from whatever reviews remain,
          // rather than trying to subtract the deleted one incrementally
          const reviewCount = remaining.length;
          const communityAvg = remaining.reduce((s, r) => s + (r.overallRating || 0), 0) / reviewCount;
          const withPrice = remaining.filter(r => r.price !== null && r.price !== undefined);
          const avgPrice = withPrice.length ? withPrice.reduce((s, r) => s + r.price, 0) / withPrice.length : null;
          const dims = getTastingDims(item.category || 'other');
          const dimData = {};
          dims.forEach(d => {
            const vals = remaining.map(r => r[d.key] || 0);
            dimData[d.key] = vals.reduce((s, v) => s + v, 0) / vals.length;
          });
          await updateDoc(doc(db, 'itemRecords', itemRecordId), {
            communityAvg: Math.round(communityAvg * 10) / 10,
            reviewCount,
            avgPrice: avgPrice !== null ? Math.round(avgPrice * 100) / 100 : null,
            priceCount: withPrice.length,
            ...dimData
          });
        }
      } catch(e) { console.warn('Could not clean up itemRecord after delete:', e); }
    }

    closeEditModal();
    showToast('Review deleted');
    await loadData();
    await loadItemRecords();
    renderLeaderboard(lbCurrentTab);
  } catch(e) {
    showToast('Could not delete — try again');
    console.error(e);
  }
}

// saveEdit/deleteReview's data-onclick sites are the Edit Review modal's
// static footer buttons in index.html (:966/:969) — registered here now,
// not from legacy-app.js (moved 2026-08-30, post-plan follow-up to residual #2).
registerActions({
  openEditModal, updateDimDisplay, updateEditSubCategory, closeEditModal,
  clearEditPhoto, handleEditPhoto, saveEdit, deleteReview,
});
