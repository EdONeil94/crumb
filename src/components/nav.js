// ─── NAV ─────────────────────────────────────────────────────────────────────
// The desktop avatar dropdown, mobile hamburger menu, and top-nav sign-in
// state (pages/components carving, Phase 1 step 5 — see CLAUDE.md).
//
// showPage()/navigateFromMobileMenu()/openMyProfileFromMobileMenu() stay in
// legacy-app.js for now, deliberately deferred — see CLAUDE.md's own note
// on this step. showPage() alone directly calls 12 functions spread across
// 8 pages that haven't been extracted yet (populateLbLocationFilter,
// renderBakeryLeaderboard, renderLeaderboard, renderFeed, renderBakeries,
// initExplorePage, initPreorderPage, renderShopPage,
// populateRankingLocationFilter, renderRankings, renderPeople,
// openSettingsPage), and openMyProfileFromMobileMenu() calls
// openProfileModal() (future profileModal.js, not until Phase 5). Moving
// them now would mean this module importing back from the file that
// imports it — the same shape of problem as 3b's loadData()/
// buildBakeryIndex(), just at a larger scale here.

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb, allProfiles, isAdmin, isBusiness } from '../state/appState.js';
import { showToast } from '../utils/dom.js';

export function updateNav() {
  const avatar = document.getElementById('navAvatar');
  const signIn = document.getElementById('signInBtn');
  const feedBtn = document.getElementById('feedNavBtn');
  const peopleBtn = document.getElementById('peopleNavBtn');
  const mobileProfileBtn = document.getElementById('mobileProfileBtn');
  const mobileEditProfileBtn = document.getElementById('mobileEditProfileBtn');
  const mobileSignOutBtn = document.getElementById('mobileSignOutBtn');
  const mobileSignInBtn = document.getElementById('mobileSignInBtn');
  const mobileMenuDivider = document.getElementById('mobileMenuDivider');

  const bell = document.getElementById('navBell');
  if (currentUser) {
    avatar.style.display = 'flex';
    if (bell) bell.style.display = 'flex';
    if (signIn) signIn.style.display = 'none';
    if (feedBtn) feedBtn.style.display = 'block';
    if (peopleBtn) peopleBtn.style.display = 'block';
    const dPeople = document.getElementById('desktopPeopleBtn');
    const dFeed = document.getElementById('desktopFeedBtn');
    if (dPeople) dPeople.style.display = 'block';
    if (dFeed) dFeed.style.display = 'block';
    const profile = allProfiles[currentUser.uid];
    const photo = profile?.photoURL || currentUser.photoURL;
    const initials = (currentUser.displayName || currentUser.email || '?').charAt(0).toUpperCase();
    if (photo) {
      avatar.innerHTML = `<img src="${photo}" alt="avatar">`;
    } else {
      avatar.textContent = initials;
    }
    if (mobileProfileBtn) mobileProfileBtn.style.display = 'block';
    if (mobileEditProfileBtn) mobileEditProfileBtn.style.display = 'block';
    if (mobileSignOutBtn) mobileSignOutBtn.style.display = 'block';
    if (mobileSignInBtn) mobileSignInBtn.style.display = 'none';
    if (mobileMenuDivider) mobileMenuDivider.style.display = 'block';
    const accLabel = document.getElementById('mobileAccountLabel');
    const signInDivider = document.getElementById('mobileSignInDivider');
    if (accLabel) accLabel.style.display = 'block';
    if (signInDivider) signInDivider.style.display = 'none';
  } else {
    avatar.style.display = 'none';
    if (bell) bell.style.display = 'none';
    if (signIn) signIn.style.display = 'block';
    if (feedBtn) feedBtn.style.display = 'none';
    if (peopleBtn) peopleBtn.style.display = 'none';
    const dPeople2 = document.getElementById('desktopPeopleBtn');
    const dFeed2 = document.getElementById('desktopFeedBtn');
    if (dPeople2) dPeople2.style.display = 'none';
    if (dFeed2) dFeed2.style.display = 'none';
    if (mobileProfileBtn) mobileProfileBtn.style.display = 'none';
    if (mobileEditProfileBtn) mobileEditProfileBtn.style.display = 'none';
    if (mobileSignOutBtn) mobileSignOutBtn.style.display = 'none';
    if (mobileSignInBtn) mobileSignInBtn.style.display = 'block';
    if (mobileMenuDivider) mobileMenuDivider.style.display = 'none';
    const accLabel = document.getElementById('mobileAccountLabel');
    if (accLabel) accLabel.style.display = 'none';
  }
}

export function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn = document.getElementById('hamburgerBtn');
  const backdrop = document.getElementById('mobileBackdrop');
  const isOpen = menu.classList.contains('open');
  if (isOpen) {
    closeMobileMenu();
  } else {
    menu.classList.add('open');
    btn.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
  }
}

export function closeMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn = document.getElementById('hamburgerBtn');
  const backdrop = document.getElementById('mobileBackdrop');
  menu.classList.remove('open');
  btn.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

export function toggleUserMenu() {
  const existing = document.getElementById('avatarDropdown');
  if (existing) { existing.remove(); return; }
  const dropdown = document.createElement('div');
  dropdown.id = 'avatarDropdown';
  const navH = document.querySelector('nav')?.offsetHeight || 56;
  dropdown.style.cssText = `
    position:fixed; top:${navH}px; right:16px; z-index:300;
    background:var(--cream-white); border:1.5px solid var(--border);
    border-radius:var(--radius); box-shadow:var(--shadow-lg);
    min-width:180px; overflow:hidden;`;
  const profile = allProfiles[currentUser.uid];
  const name = profile?.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'My profile';
  const roleBadgeHtml = isAdmin() ? '<span class="role-badge admin">Admin</span>' : isBusiness() ? '<span class="role-badge business">Business</span>' : '';
  dropdown.innerHTML = `
    <div style="padding:12px 16px; border-bottom:1px solid var(--border);">
      <div style="font-size:0.82rem; font-weight:600; color:var(--espresso); display:flex; align-items:center; gap:8px;">${name} ${roleBadgeHtml}</div>
      <div style="font-size:0.72rem; color:var(--text-muted);">${currentUser.email || ''}</div>
    </div>
    <div data-onclick="closeAvatarDropdown,openProfileModal" data-args='${dataArgs([currentUser.uid])}'
      style="padding:11px 16px; font-size:0.85rem; color:var(--text-body); cursor:pointer; display:flex; align-items:center; gap:8px;"
      onmouseover="this.style.background='var(--parchment)'" onmouseout="this.style.background=''">
      👤 View my profile
    </div>
    <div data-onclick="closeAvatarDropdown,showPage" data-args='${dataArgs(['settings'])}'
      style="padding:11px 16px; font-size:0.85rem; color:var(--text-body); cursor:pointer; display:flex; align-items:center; gap:8px;"
      onmouseover="this.style.background='var(--parchment)'" onmouseout="this.style.background=''">
      ⚙️ Settings
    </div>
    <div data-onclick="closeAvatarDropdown,openFeatureRequestModal"
      style="padding:11px 16px; font-size:0.85rem; color:var(--text-body); cursor:pointer; display:flex; align-items:center; gap:8px;"
      onmouseover="this.style.background='var(--parchment)'" onmouseout="this.style.background=''">
      💡 Request a feature
    </div>
    <div style="border-top:1px solid var(--border);">
      <div data-onclick="signOutFromAvatarMenu"
        style="padding:11px 16px; font-size:0.85rem; color:#c0392b; cursor:pointer; display:flex; align-items:center; gap:8px;"
        onmouseover="this.style.background='var(--parchment)'" onmouseout="this.style.background=''">
        → Sign out
      </div>
    </div>`;
  document.body.appendChild(dropdown);
  setTimeout(() => document.addEventListener('click', closeOnClickOutside), 0);
}

export function closeAvatarDropdown() {
  const d = document.getElementById('avatarDropdown');
  if (d) d.remove();
  document.removeEventListener('click', closeOnClickOutside);
}

// fb.signOut(fb.auth) doesn't fit the plain "cleanup, then one named action"
// data-onclick shape (delegate.js) — it's a direct method call, not a
// registrable named function — so it gets this small wrapper instead,
// mirroring signOutFromMobileMenu.
export function signOutFromAvatarMenu() {
  closeAvatarDropdown();
  fb.signOut(fb.auth);
  showToast('Signed out');
}

export function closeOnClickOutside(e) {
  const d = document.getElementById('avatarDropdown');
  const avatar = document.getElementById('navAvatar');
  if (d && !d.contains(e.target) && !avatar.contains(e.target)) closeAvatarDropdown();
}

export function signOutFromMobileMenu() {
  fb.signOut(fb.auth);
  showToast('Signed out');
  closeMobileMenu();
}

registerActions({
  toggleUserMenu, toggleMobileMenu, closeAvatarDropdown, signOutFromAvatarMenu,
  signOutFromMobileMenu, closeMobileMenu,
});
