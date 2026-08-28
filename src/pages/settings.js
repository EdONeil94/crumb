// ─── SETTINGS PAGE ──────────────────────────────────────────────────────────
// The #page-settings routed view (pages/components carving, Phase 7
// step 32 — the LAST step of the 32-step plan; see CLAUDE.md):
// openSettingsPage (fills the profile form + shows/hides the business and
// admin sub-cards), handleSettingsPhoto, saveSettingsProfile,
// signOutFromSettings, and the settingsPhotoFile compression buffer.
//
// This cluster was NEVER in scope for the handler-delegation migration —
// index.html's #page-settings still has three RAW inline handlers
// (onchange="handleSettingsPhoto(this)", onclick="saveSettingsProfile()",
// onclick="signOutFromSettings()"). Raw handlers can only resolve
// window[name], so those three functions stay exported into WINDOW EXPORTS
// from legacy-app.js (re-imported from here) — same treatment as
// switchFeedTab (step 13). openSettingsPage has no raw site of its own
// (reached only via showPage('settings')'s plain-JS call), so it's an
// ordinary export imported back for showPage.
//
// signOutFromSettings calls showPage('home'); showPage() stays in
// legacy-app.js (its own Phase 1 deferral, a post-plan decision), so this
// reaches it via getAction('showPage')() — the same registry-lookup
// pattern used for loadData / buildBakeryIndex / renderPreorderPage /
// loadMyPreorders. showAdminTab (adminPanel.js) and renderBusinessSection
// (businessBakeryManagement.js) import one-way — neither imports back here.

import { getAction } from '../events/actions.js';
import {
  currentUser, currentUserRole, SUPER_ADMIN_UID, loadUserRole,
  allProfiles, isBusiness, isAdmin, fb,
} from '../state/appState.js';
import { openAuthModal } from '../components/authModal.js';
import { EXPLORE_COUNTRIES } from '../data/exploreCities.js';
import { CATEGORY_TREE } from '../data/categories.js';
import { renderBusinessSection } from '../components/businessBakeryManagement.js';
import { showAdminTab } from '../components/adminPanel.js';
import { compressImage } from '../components/addReviewModal.js';
import { updateNav } from '../components/nav.js';
import { showToast } from '../utils/dom.js';

let settingsPhotoFile = null;

export async function openSettingsPage() {
  if (!currentUser) { openAuthModal(); return; }
  // Re-check role in case it hasn't loaded yet
  if (!currentUserRole && currentUser.uid !== SUPER_ADMIN_UID) {
    await loadUserRole();
  }

  // Profile fields
  const profile = allProfiles[currentUser.uid] || {};
  document.getElementById('settingsName').value = profile.displayName || currentUser.displayName || '';
  document.getElementById('settingsLocation').value = profile.location || '';
  const countryEl = document.getElementById('settingsCountry');
  if (countryEl) {
    if (countryEl.options.length <= 1) {
      Object.keys(EXPLORE_COUNTRIES).sort().forEach(c => {
        countryEl.add(new Option(c, c));
      });
    }
    countryEl.value = profile.country || '';
  }
  document.getElementById('settingsBio').value = profile.bio || '';
  settingsPhotoFile = null;

  // Avatar preview
  const prev = document.getElementById('settingsAvatarPreview');
  const photo = profile.photoURL || currentUser.photoURL;
  if (photo) prev.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  else prev.textContent = (profile.displayName || currentUser.displayName || '?').charAt(0).toUpperCase();

  // Fave category dropdown
  const favSelect = document.getElementById('settingsFavCategory');
  favSelect.innerHTML = '<option value="">Auto — based on my reviews</option>';
  Object.entries(CATEGORY_TREE).forEach(([key, cat]) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = cat.emoji + ' ' + cat.label;
    if (profile.favCategory === key) opt.selected = true;
    favSelect.appendChild(opt);
  });

  // Show/hide business section
  const bizCard = document.getElementById('settingsBusinessCard');
  if (isBusiness()) {
    bizCard.style.display = 'block';
    renderBusinessSection();
  } else {
    bizCard.style.display = 'none';
  }

  // Show/hide admin section
  const adminCard = document.getElementById('settingsAdminCard');
  if (isAdmin()) {
    adminCard.style.display = 'block';
    showAdminTab('users');
  } else {
    adminCard.style.display = 'none';
  }
}

export function handleSettingsPhoto(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('settingsAvatarPreview').innerHTML =
      `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  };
  reader.readAsDataURL(file);
  compressImage(file, 400, 0.85).then(blob => { settingsPhotoFile = blob; });
}

export async function saveSettingsProfile() {
  if (!currentUser) return;
  const btn = document.querySelector('#settingsProfileBody .btn-espresso');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const { db, storage, doc, setDoc, updateProfile, ref, uploadBytes, getDownloadURL } = fb;
    let photoURL = allProfiles[currentUser.uid]?.photoURL || currentUser.photoURL || null;
    if (settingsPhotoFile) {
      const storageRef = ref(storage, `avatars/${currentUser.uid}.jpg`);
      const snap = await uploadBytes(storageRef, settingsPhotoFile, { contentType: 'image/jpeg' });
      photoURL = await getDownloadURL(snap.ref);
    }
    const displayName = document.getElementById('settingsName').value.trim() || currentUser.displayName || 'Anonymous';
    await updateProfile(currentUser, { displayName, ...(photoURL ? { photoURL } : {}) });
    const profileData = {
      displayName,
      location: document.getElementById('settingsLocation').value.trim(),
      country: document.getElementById('settingsCountry')?.value || '',
      bio: document.getElementById('settingsBio').value.trim(),
      favCategory: document.getElementById('settingsFavCategory').value || '',
      photoURL, uid: currentUser.uid, updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'profiles', currentUser.uid), profileData, { merge: true });
    allProfiles[currentUser.uid] = profileData;
    updateNav();
    showToast('Profile saved ✓');
  } catch(e) { showToast('Could not save — try again'); console.error(e); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Save profile'; } }
}

export function signOutFromSettings() {
  if (confirm('Sign out of Crumbz?')) {
    fb.signOut(fb.auth);
    getAction('showPage')('home');
    showToast('Signed out');
  }
}
