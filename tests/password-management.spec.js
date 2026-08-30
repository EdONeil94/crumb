import { test, expect } from '@playwright/test';

// Covers the forgot-password flow (#page-reset, reached via the boot check
// in src/components/passwordReset.js) and the Settings "🔒 Password" card
// (changePassword in src/pages/settings.js).
//
// Emulator-only: both flows need the Auth emulator's oobCodes endpoint and
// create throwaway accounts, neither of which we want against the live
// project. `npm run test:e2e:prod` skips this file entirely.

const PROJECT_ID = 'crumb-ddeb6';
const AUTH_HOST = '127.0.0.1:9099';

test.describe('password management', () => {
  test.skip(process.env.E2E_MODE !== 'emulator', 'password flows use the Auth emulator + its oobCodes endpoint');

  // Signed out by default — each test creates its own throwaway account.
  test.use({ storageState: { cookies: [], origins: [] } });

  async function createEmulatorUser(email, password) {
    const res = await fetch(
      `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }) },
    );
    if (!res.ok) throw new Error(`emulator signUp failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async function latestOobCode(email, requestType = 'PASSWORD_RESET') {
    const res = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
    const { oobCodes = [] } = await res.json();
    const mine = oobCodes.filter((c) => c.email === email && c.requestType === requestType);
    return mine.length ? mine[mine.length - 1].oobCode : null;
  }

  async function signInViaModal(page, email, password) {
    await page.locator('#signInBtn').click();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
    await page.locator('#authEmail').fill(email);
    await page.locator('#authPassword').fill(password);
    await page.locator('#signInSubmit').click();
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });
  }

  async function signOut(page) {
    await page.locator('#navAvatar').click();
    await page.locator('#avatarDropdown [data-onclick="signOutFromAvatarMenu"]').click();
    await expect(page.locator('#navAvatar')).toBeHidden({ timeout: 10_000 });
  }

  test('forgot-password: request a link, set a new password via #page-reset, sign in with it', async ({ page }) => {
    const email = `e2e-reset-${Date.now()}@crumb.test`;
    const oldPw = 'oldpass123';
    const newPw = 'freshpass456';
    await createEmulatorUser(email, oldPw);

    await page.goto('/');
    await page.locator('#signInBtn').click();
    await page.locator('#forgotPasswordLink').click();
    await expect(page.locator('#forgotForm')).toBeVisible();

    await page.locator('#forgotEmail').fill(email);
    await page.locator('#sendResetBtn').click();
    await expect(page.locator('#forgotMsg')).toContainText(/if an account exists/i);

    const code = await latestOobCode(email);
    expect(code, 'no PASSWORD_RESET oobCode found in the emulator').toBeTruthy();

    await page.goto(`/?mode=resetPassword&oobCode=${encodeURIComponent(code)}`);
    await expect(page.locator('#page-reset')).toHaveClass(/active/);
    await expect(page.locator('#resetForm')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#resetEmail')).toHaveText(email);
    // params stripped from the URL so the code can't be replayed
    await expect(page).not.toHaveURL(/oobCode/);

    await page.locator('#resetNew').fill(newPw);
    await page.locator('#resetConfirm').fill(newPw);
    await page.locator('#resetSubmitBtn').click();
    await expect(page.locator('#resetSuccess')).toBeVisible({ timeout: 10_000 });

    await page.locator('[data-onclick="goToSignIn"]').click();
    await expect(page.locator('#authModal')).toHaveClass(/open/);
    await expect(page.locator('#authEmail')).toHaveValue(email); // prefilled
    await page.locator('#authPassword').fill(newPw);
    await page.locator('#signInSubmit').click();
    await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });
  });

  test('forgot-password: an invalid/expired code shows the error state, not the form', async ({ page }) => {
    await page.goto('/?mode=resetPassword&oobCode=totally-not-a-real-code');
    await expect(page.locator('#page-reset')).toHaveClass(/active/);
    await expect(page.locator('#resetError')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#resetForm')).toBeHidden();
    await expect(page.locator('#resetErrorText')).toContainText(/invalid|expired/i);
  });

  test('change-password: update it from Settings, then sign in with the new one', async ({ page }) => {
    const email = `e2e-change-${Date.now()}@crumb.test`;
    const oldPw = 'startpass123';
    const newPw = 'changedpass789';
    await createEmulatorUser(email, oldPw);

    await page.goto('/');
    await signInViaModal(page, email, oldPw);

    await page.evaluate(() => window.showPage('settings'));
    await expect(page.locator('#page-settings')).toHaveClass(/active/);
    await expect(page.locator('#settingsSecurityCard')).toBeVisible({ timeout: 10_000 });

    // wrong current password → clear message, no change
    await page.locator('#pwCurrent').fill('wrongpassword');
    await page.locator('#pwNew').fill(newPw);
    await page.locator('#pwConfirm').fill(newPw);
    await page.locator('#changePwBtn').click();
    await expect(page.locator('#pwMsg')).toContainText(/current password is incorrect/i);

    // same-as-current is blocked client-side
    await page.locator('#pwCurrent').fill(oldPw);
    await page.locator('#pwNew').fill(oldPw);
    await page.locator('#pwConfirm').fill(oldPw);
    await page.locator('#changePwBtn').click();
    await expect(page.locator('#pwMsg')).toContainText(/must be different/i);

    // real change
    await page.locator('#pwCurrent').fill(oldPw);
    await page.locator('#pwNew').fill(newPw);
    await page.locator('#pwConfirm').fill(newPw);
    await page.locator('#changePwBtn').click();
    await expect(page.locator('#pwMsg')).toContainText(/password updated/i, { timeout: 10_000 });

    await signOut(page);
    await signInViaModal(page, email, newPw);
  });
});
