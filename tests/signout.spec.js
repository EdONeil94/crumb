import { test, expect } from '@playwright/test';

// Two ways a session ends, both of which must not strand the user:
//
// 1. The sign-out BUTTON (signOutFromAvatarMenu / signOutFromMobileMenu,
//    src/components/nav.js) — always lands on #page-home, shows a "Signed
//    out" toast, no re-auth prompt (they chose to leave).
// 2. WITHOUT a button — onAuthStateChanged(null) fires on its own (token
//    expiry, account disabled/revoked server-side, sign-out in another
//    tab). Handled by handleInvoluntarySignOut() in src/legacy-app.js:
//    close any open modal, redirect to #page-home *only* if the active view
//    is a signed-in-only one (Settings/Admin/Feed/People) whose nav path is
//    now hidden, show "You've been signed out", and pop the auth modal.

const AUTH_HOST = '127.0.0.1:9099';
const PROJECT_ID = 'crumb-ddeb6';

test.describe('button sign-out', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('#navAvatar'),
      'Not signed in — check E2E_EMAIL/E2E_PASSWORD and tests/auth.setup.js',
    ).toBeVisible({ timeout: 15_000 });
  });

  test('avatar-dropdown sign-out from Settings redirects to home', async ({ page }) => {
    await page.evaluate(() => window.showPage('settings'));
    await expect(page.locator('#page-settings')).toHaveClass(/active/);

    await page.locator('#navAvatar').click();
    await page.locator('#avatarDropdown [data-onclick="signOutFromAvatarMenu"]').click();

    await expect(page.locator('#page-home')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(page.locator('#page-settings')).not.toHaveClass(/active/);
    await expect(page.locator('#navAvatar')).toBeHidden();
    await expect(page.locator('#signInBtn')).toBeVisible();
    // A deliberate sign-out does NOT shove the auth modal at them.
    await expect(page.locator('#authModal')).not.toHaveClass(/open/);
  });

  test('mobile-menu sign-out from Settings redirects to home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.showPage('settings'));
    await expect(page.locator('#page-settings')).toHaveClass(/active/);

    await page.locator('#hamburgerBtn').click();
    await page.locator('#mobileSignOutBtn').click();

    await expect(page.locator('#page-home')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(page.locator('#page-settings')).not.toHaveClass(/active/);
    await expect(page.locator('#navAvatar')).toBeHidden();
  });
});

test.describe('session ends without a click', () => {
  test.skip(
    process.env.E2E_MODE !== 'emulator',
    'needs the Auth emulator to create throwaway accounts and revoke sessions',
  );
  // Signed out by default — each test brings up its own throwaway account so
  // it never touches the shared seeded session that later specs reuse.
  test.use({ storageState: { cookies: [], origins: [] } });

  const PW = 'crumb-e2e-pw-123';
  let seq = 0;
  const freshEmail = () => `e2e-involuntary-${Date.now()}-${seq++}@crumb.test`;

  async function createEmulatorUser(email) {
    const res = await fetch(
      `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PW, returnSecureToken: true }) },
    );
    if (!res.ok) throw new Error(`emulator signUp failed: ${res.status} ${await res.text()}`);
    return (await res.json()).localId;
  }

  async function signInInPage(page, email) {
    await page.evaluate(
      async ({ email, pw }) => {
        await window._crumb.signInWithEmailAndPassword(window._crumb.auth, email, pw);
      },
      { email, pw: PW },
    );
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });
  }

  test('simulated signOut() on a signed-in-only page redirects home and prompts re-auth', async ({ page }) => {
    const email = freshEmail();
    await createEmulatorUser(email);
    await page.goto('/');
    await signInInPage(page, email);

    await page.evaluate(() => window.showPage('settings'));
    await expect(page.locator('#page-settings')).toHaveClass(/active/);

    // The path a token-expiry / other-tab sign-out takes: onAuthStateChanged(null)
    // with no button handler involved.
    await page.evaluate(() => window._crumb.signOut(window._crumb.auth));

    await expect(page.locator('#page-home')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(page.locator('#page-settings')).not.toHaveClass(/active/);
    await expect(page.locator('#navAvatar')).toBeHidden();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
    await expect(page.locator('#toast')).toContainText('signed out');
  });

  test('an open modal overlay is closed when the session ends mid-task', async ({ page }) => {
    const email = freshEmail();
    await createEmulatorUser(email);
    await page.goto('/');
    await signInInPage(page, email);

    await page.evaluate(() => window.showPage('feed'));
    // Stand in for "the ex-user had some modal open mid-task".
    await page.evaluate(() => document.getElementById('detailModal').classList.add('open'));
    await expect(page.locator('#detailModal')).toHaveClass(/open/);

    await page.evaluate(() => window._crumb.signOut(window._crumb.auth));

    await expect(page.locator('#detailModal')).not.toHaveClass(/open/);
    await expect(page.locator('#authModal')).toHaveClass(/open/);
  });

  test('does NOT redirect when the session ends on a public page', async ({ page }) => {
    const email = freshEmail();
    await createEmulatorUser(email);
    await page.goto('/');
    await signInInPage(page, email);

    await page.evaluate(() => window.showPage('explore'));
    await expect(page.locator('#page-explore')).toHaveClass(/active/);

    await page.evaluate(() => window._crumb.signOut(window._crumb.auth));

    // Explore is public — stay put, just prompt re-auth.
    await expect(page.locator('#authModal')).toHaveClass(/open/, { timeout: 10_000 });
    await expect(page.locator('#navAvatar')).toBeHidden();
    await expect(page.locator('#page-explore')).toHaveClass(/active/);
    await expect(page.locator('#page-home')).not.toHaveClass(/active/);
  });

  test('server-side account disable ends the session the same way', async ({ page }) => {
    const email = freshEmail();
    const uid = await createEmulatorUser(email);
    await page.goto('/');
    await signInInPage(page, email);

    await page.evaluate(() => window.showPage('settings'));
    await expect(page.locator('#page-settings')).toHaveClass(/active/);

    // Disable the account server-side via the Auth emulator's admin API.
    const res = await fetch(
      `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId: uid, disableUser: true }) },
    );
    expect(res.ok, `emulator accounts:update failed: ${res.status}`).toBeTruthy();

    // Force a token refresh — the emulator rejects it (user disabled), so the
    // SDK signs out and onAuthStateChanged(null) fires, same as a real
    // revocation the client notices at its next refresh.
    await page.evaluate(() => window._crumb.auth.currentUser?.getIdToken(true).catch(() => {}));

    await expect(page.locator('#page-home')).toHaveClass(/active/, { timeout: 15_000 });
    await expect(page.locator('#navAvatar')).toBeHidden();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
  });
});
