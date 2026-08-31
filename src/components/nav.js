// ─── NAV ─────────────────────────────────────────────────────────────────────
// The desktop avatar dropdown, mobile hamburger menu, top-nav sign-in
// state, and the page router (pages/components carving, Phase 1 step 5 +
// residual #1 — see CLAUDE.md).
//
// showPage()/navigateFromMobileMenu()/openMyProfileFromMobileMenu() moved
// here 2026-08-30 (Phase 1 residual #1), once every one of showPage()'s
// ~12 cross-page targets finally had a real importable home (the 32-step
// carving plan completed at step 32). showPage() imports the page
// renderers/initters + openProfileModal the normal one-way way. The
// edges that would have formed a cycle — settings.js and pages/admin.js
// each needing showPage() (and settings.js also updateNav()) — are broken
// on their side: they reach those via getAction() (see each module's own
// header comment). legacy-app.js keeps
// importing showPage back purely for its WINDOW EXPORTS entry
// (tests/people-filters.spec.js calls window.showPage('people') directly
// to bypass the signed-out nav-button visibility gate — same precedent as
// selectManualBakery / switchFeedTab).

import { registerActions } from '../events/actions.js';
import { dataArgs } from '../events/delegate.js';
import { currentUser, fb, allProfiles, isAdmin, isBusiness, setExplicitSignOut } from '../state/appState.js';
import { showToast } from '../utils/dom.js';
import { openProfileModal } from './profileModal.js';
import {
  lbCurrentTab, lbCurrentMode, populateLbLocationFilter,
  renderBakeryLeaderboard, renderLeaderboard,
} from '../pages/leaderboard.js';
import { renderFeed } from '../pages/feed.js';
import { setBakeryViewMode, renderBakeries } from '../pages/bakeries.js';
import { initExplorePage } from '../pages/explore.js';
import { initPreorderPage } from '../pages/preorders.js';
import { renderShopPage } from '../pages/shop.js';
import {
  peopleViewMode, populateRankingLocationFilter, renderRankings, renderPeople,
} from '../pages/people.js';
import { openSettingsPage } from '../pages/settings.js';
import { openAdminPage } from '../pages/admin.js';

export function updateNav() {
  const avatar = document.getElementById('navAvatar');
  const signIn = document.getElementById('signInBtn');
  const feedBtn = document.getElementById('feedNavBtn');
  const peopleBtn = document.getElementById('peopleNavBtn');
  const mobileProfileBtn = document.getElementById('mobileProfileBtn');
  const mobileEditProfileBtn = document.getElementById('mobileEditProfileBtn');
  const mobileSignOutBtn = document.getElementById('mobileSignOutBtn');
  const mobileSignInBtn = document.getElementById('mobileSignInBtn');
  const mobileAdminBtn = document.getElementById('mobileAdminBtn');
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
    if (mobileAdminBtn) mobileAdminBtn.style.display = isAdmin() ? 'block' : 'none';
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
    if (mobileAdminBtn) mobileAdminBtn.style.display = 'none';
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
    ${isAdmin() ? `<div data-onclick="closeAvatarDropdown,showPage" data-args='${dataArgs(['admin'])}'
      style="padding:11px 16px; font-size:0.85rem; color:var(--text-body); cursor:pointer; display:flex; align-items:center; gap:8px;"
      onmouseover="this.style.background='var(--parchment)'" onmouseout="this.style.background=''">
      🛡️ Admin panel
    </div>` : ''}
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
// mirroring signOutFromMobileMenu. Both wrappers land the user back on
// #page-home: the current view may be signed-in-only (Settings, the admin
// panel, the feed) and would otherwise sit there showing the ex-user's
// stale data until manual navigation — which for People/Feed is blocked
// once updateNav() hides their nav buttons.
//
// setExplicitSignOut(true) marks this as a deliberate sign-out so
// legacy-app.js's auth listener doesn't also fire the involuntary-session-end
// UX (toast + re-auth modal) on top of what these wrappers already do. Only
// set it when there's actually a session to end, so it can't get stuck true
// (no transition -> the listener that resets it never runs).
export async function signOutFromAvatarMenu() {
  closeAvatarDropdown();
  if (fb.auth.currentUser) setExplicitSignOut(true);
  await fb.signOut(fb.auth);
  showToast('Signed out');
  showPage('home');
}

export function closeOnClickOutside(e) {
  const d = document.getElementById('avatarDropdown');
  const avatar = document.getElementById('navAvatar');
  if (d && !d.contains(e.target) && !avatar.contains(e.target)) closeAvatarDropdown();
}

export async function signOutFromMobileMenu() {
  closeMobileMenu();
  if (fb.auth.currentUser) setExplicitSignOut(true);
  await fb.signOut(fb.auth);
  showToast('Signed out');
  showPage('home');
}

// ─── PAGE ROUTER ─────────────────────────────────────────────────────────────
// The #page-* view switcher, plus the two mobile-menu wrappers that close
// the menu before navigating (so the destination isn't rendered underneath
// a still-animating-out menu).
export function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (name === 'leaderboard') {
    populateLbLocationFilter();
    if (lbCurrentMode === 'bakeries') renderBakeryLeaderboard(); else renderLeaderboard(lbCurrentTab);
  }
  if (name === 'feed') renderFeed();
  if (name === 'bakeries') { setBakeryViewMode('all'); renderBakeries(); }
  if (name === 'explore') initExplorePage();
  if (name === 'preorders') initPreorderPage();
  if (name === 'shop') renderShopPage();
  if (name === 'people') {
    populateRankingLocationFilter();
    if (peopleViewMode === 'rankings') renderRankings();
    else renderPeople();
  }
  if (name === 'settings') openSettingsPage();
  if (name === 'admin') openAdminPage();
}

export function navigateFromMobileMenu(page) {
  closeMobileMenu();
  setTimeout(() => showPage(page), 50);
}

export function openMyProfileFromMobileMenu() {
  closeMobileMenu();
  setTimeout(() => { if (currentUser) openProfileModal(currentUser.uid); }, 50);
}

registerActions({
  toggleUserMenu, toggleMobileMenu, closeAvatarDropdown, signOutFromAvatarMenu,
  signOutFromMobileMenu, closeMobileMenu,
  showPage, navigateFromMobileMenu, openMyProfileFromMobileMenu, updateNav,
});
