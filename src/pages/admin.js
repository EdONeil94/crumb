// ─── ADMIN PANEL PAGE ────────────────────────────────────────────────────────
// The #page-admin routed view. The 4-tab admin content (Users / Bakery
// assignments / Flagged reviews / Feature requests) moved here wholesale
// from the Settings page's #settingsAdminCard on 2026-08-31 — it's a
// dedicated route now, reached from the "🛡️ Admin panel" entry in the
// account menu (desktop avatar dropdown + mobile menu), both gated on
// isAdmin() by nav.js.
//
// The tab machinery itself still lives in components/adminPanel.js
// (showAdminTab + the renderers, which target #adminTabContent and the
// #adminTab{Users,Bakeries,Flags,Features} buttons — same ids, just
// relocated, so adminPanel.js needed no change). This module is only the
// route wrapper: guard on isAdmin(), then kick off the default Users tab.
//
// It reaches showPage() via getAction() rather than importing nav.js,
// because nav.js imports openAdminPage from here — a direct import back
// would form a cycle (same cycle-break pattern as pages/settings.js).

import { getAction } from '../events/actions.js';
import {
  currentUser, currentUserRole, SUPER_ADMIN_UID, loadUserRole, isAdmin,
} from '../state/appState.js';
import { openAuthModal } from '../components/authModal.js';
import { showAdminTab } from '../components/adminPanel.js';

export async function openAdminPage() {
  if (!currentUser) { openAuthModal(); return; }
  // Role may not have loaded yet for a non-super-admin (mirrors openSettingsPage).
  if (!currentUserRole && currentUser.uid !== SUPER_ADMIN_UID) {
    await loadUserRole();
  }
  if (!isAdmin()) { getAction('showPage')('home'); return; }
  showAdminTab('users');
}
