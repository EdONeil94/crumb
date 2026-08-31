import { test, expect } from '@playwright/test';

// Coverage for the Cloud Functions phase (functions/ — C1/C1b/C3/C5/C8/C8b/C9).
// Emulator-only: every callable runs in the Functions emulator, which the
// default `npm run test:e2e` now starts (playwright.config.js). Skips itself
// under prod mode — those callables aren't deployed to crumb-ddeb6 by an
// agent, only by Ed.
//
// This file grows one describe block per callable as the phase lands. The
// Firestore-side assertions use firebase-admin against the emulator (same
// approach as tests/seed-emulator.mjs), so they see exactly what the callable
// wrote — not just what the UI re-rendered.

const EMULATOR = process.env.E2E_MODE === 'emulator';
test.skip(!EMULATOR, 'Cloud Functions callables run only against the emulator.');

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const _origEmitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  const name = rest[0]?.type ?? rest[0];
  if (name === 'MetadataLookupWarning' || String(w).includes('MetadataLookup')) return;
  return _origEmitWarning.call(process, w, ...rest);
};

let adminDb;
async function db() {
  if (adminDb) return adminDb;
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ projectId: 'crumb-ddeb6' });
  adminDb = getFirestore(app);
  return adminDb;
}

// ── C5 — setUserRole (via the Admin panel → Users tab) ─────────────────────
test.describe('C5 — setUserRole', () => {
  const TARGET_NAME = 'Dot Dough';        // seeded, in nobody's follow graph
  const TARGET_UID = 'seed-user-dot';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });
    await page.locator('#navAvatar').click();
    await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Admin panel' }).click();
    await expect(page.locator('#page-admin')).toHaveClass(/active/);
    await page.locator('#adminTabUsers').click();
    await expect(page.locator('#adminTabContent .spinner')).toHaveCount(0);
  });

  test.afterEach(async () => {
    // leave the seed clean for the next spec regardless of assertion outcome
    await (await db()).collection('userRoles').doc(TARGET_UID).delete().catch(() => {});
  });

  const row = (page) => page.locator('.admin-user-row', { hasText: TARGET_NAME });

  test('promote to admin writes userRoles + a roleAudit entry, and shows on re-render', async ({ page }) => {
    page.once('dialog', (d) => d.accept());
    await row(page).locator('[data-onclick="promoteUser"]').click();
    await expect(page.locator('#toast')).toContainText(/promoted to admin/i);

    const roleDoc = await (await db()).collection('userRoles').doc(TARGET_UID).get();
    expect(roleDoc.exists).toBe(true);
    expect(roleDoc.data().role).toBe('admin');

    const audit = await (await db()).collection('roleAudit')
      .where('targetUid', '==', TARGET_UID).get();
    expect(audit.empty).toBe(false);
    const latest = audit.docs.map((d) => d.data())
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
    expect(latest.newRole).toBe('admin');
    expect(latest.actorUid).toBe('KTpBS4yJx2h8LpcryCTfJDFCHlr2');

    // refreshAdminUsersPanel() targets a nonexistent DOM id (pre-existing,
    // documented) so re-render by re-selecting the tab — showAdminTab()
    // reloads allUserRoles first.
    await page.locator('#adminTabUsers').click();
    await expect(page.locator('#adminTabContent .spinner')).toHaveCount(0);
    await expect(row(page).locator('.role-badge.admin')).toBeVisible();
  });

  test('assign a bakery sets role=business with the bakery name', async ({ page }) => {
    page.once('dialog', (d) => d.accept('Seed Bakehouse Beta'));
    await row(page).locator('[data-onclick="promptAssignBakery"]').click();
    await expect(page.locator('#toast')).toContainText(/assigned to Seed Bakehouse Beta/i);

    const roleDoc = await (await db()).collection('userRoles').doc(TARGET_UID).get();
    expect(roleDoc.data()).toMatchObject({ role: 'business', bakeryName: 'Seed Bakehouse Beta' });
  });

  test('remove role deletes the userRoles doc', async ({ page }) => {
    await (await db()).collection('userRoles').doc(TARGET_UID).set({ role: 'admin', bakeryName: '' });
    await page.reload();
    await page.locator('#navAvatar').click();
    await page.locator('[data-onclick="closeAvatarDropdown,showPage"]', { hasText: 'Admin panel' }).click();
    await page.locator('#adminTabUsers').click();
    await expect(page.locator('#adminTabContent .spinner')).toHaveCount(0);

    page.once('dialog', (d) => d.accept());
    await row(page).locator('[data-onclick="removeUserRole"]').click();
    await expect(page.locator('#toast')).toContainText(/role removed/i);

    const roleDoc = await (await db()).collection('userRoles').doc(TARGET_UID).get();
    expect(roleDoc.exists).toBe(false);
  });
});
