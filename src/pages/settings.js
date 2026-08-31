// ─── SETTINGS PAGE ──────────────────────────────────────────────────────────
// The #page-settings routed view (pages/components carving, Phase 7
// step 32 — the LAST step of the 32-step plan; see CLAUDE.md):
// openSettingsPage (fills the profile form + shows/hides the business
// and password sub-cards), handleSettingsPhoto, saveSettingsProfile,
// changePassword, and the settingsPhotoFile compression buffer.
// (signOutFromSettings + the Settings "Danger zone" card that called it
// were removed 2026-08-30 — sign-out stays available via the nav avatar
// dropdown and the mobile menu, both in nav.js. The Admin Panel card
// moved to its own #page-admin route 2026-08-31 — see src/pages/admin.js.)
//
// The photo/profile handlers were NEVER in scope for the handler-delegation
// migration — index.html's #page-settings still has two RAW inline handlers
// for them (onchange="handleSettingsPhoto(this)", onclick="saveSettingsProfile()").
// Raw handlers can only resolve window[name], so those two functions stay
// exported into WINDOW EXPORTS from legacy-app.js (re-imported from here)
// — same treatment as switchFeedTab (step 13). openSettingsPage has no raw
// site of its own (reached only via showPage('settings')'s plain-JS call),
// so it's an ordinary export imported back for showPage. changePassword is
// new code (the 🔒 Password card) — it uses data-onclick + registerActions
// directly, no window export.
//
// saveSettingsProfile calls updateNav() — now in nav.js (Phase 1 residual
// #1, resolved 2026-08-30). This module reaches it via
// getAction('updateNav')() rather than importing nav.js directly: nav.js
// itself imports openSettingsPage from here (for showPage()'s settings
// branch), so a direct import back would form a cycle. Same registry-lookup
// pattern used for loadData / buildBakeryIndex / renderPreorderPage /
// loadMyPreorders. renderBusinessSection (businessBakeryManagement.js)
// imports one-way — it doesn't import back here.

import { registerActions, getAction } from '../events/actions.js';
import {
  currentUser, currentUserRole, SUPER_ADMIN_UID, loadUserRole,
  allProfiles, isBusiness, fb,
} from '../state/appState.js';
import { openAuthModal, friendlyAuthError } from '../components/authModal.js';
import { EXPLORE_COUNTRIES } from '../data/exploreCities.js';
import { CATEGORY_TREE } from '../data/categories.js';
import { renderBusinessSection } from '../components/businessBakeryManagement.js';
import { compressImage } from '../components/addReviewModal.js';
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

  // (The admin panel moved to its own #page-admin route on 2026-08-31 —
  // see src/pages/admin.js. Settings no longer shows/hides it.)

  // Password card — only for accounts that actually have an email/password
  // credential. Google-only users manage their password with Google; they
  // just don't see this card (no note, per the design decision).
  const isPasswordUser = (currentUser.providerData || []).some(p => p.providerId === 'password');
  const secCard = document.getElementById('settingsSecurityCard');
  secCard.style.display = isPasswordUser ? 'block' : 'none';
  if (isPasswordUser) {
    ['pwCurrent', 'pwNew', 'pwConfirm'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('pwMsg').style.display = 'none';
  }
}

export async function changePassword() {
  if (!currentUser) return;
  const current = document.getElementById('pwCurrent').value;
  const next = document.getElementById('pwNew').value;
  const confirm = document.getElementById('pwConfirm').value;
  const msg = document.getElementById('pwMsg');
  const btn = document.getElementById('changePwBtn');
  const fail = (text) => { msg.textContent = text; msg.style.color = '#c0392b'; msg.style.display = 'block'; };
  msg.style.display = 'none';

  if (!current) return fail('Enter your current password.');
  if (next.length < 6) return fail('New password must be at least 6 characters.');
  if (next !== confirm) return fail('New passwords don’t match.');
  if (next === current) return fail('New password must be different from your current one.');

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Updating…';
  try {
    const cred = fb.EmailAuthProvider.credential(currentUser.email, current);
    await fb.reauthenticateWithCredential(currentUser, cred);
    await fb.updatePassword(currentUser, next);
    ['pwCurrent', 'pwNew', 'pwConfirm'].forEach(id => { document.getElementById(id).value = ''; });
    msg.textContent = 'Password updated. Other devices will need to sign in again.';
    msg.style.color = 'var(--text-muted)';
    msg.style.display = 'block';
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      fail('Current password is incorrect.');
    } else {
      fail(friendlyAuthError(err.code));
    }
  } finally {
    btn.disabled = false;
    btn.textContent = original;
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
    getAction('updateNav')();
    showToast('Profile saved ✓');
  } catch(e) { showToast('Could not save — try again'); console.error(e); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Save profile'; } }
}

// changePassword is new code (the Password card), so it uses the delegated
// system directly — unlike handleSettingsPhoto/saveSettingsProfile, which
// pre-date the migration and stay on raw onclick + WINDOW EXPORTS.
registerActions({ changePassword });

