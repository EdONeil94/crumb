import { test as setup, expect } from '@playwright/test';

// Runs once before the real specs (see the `setup`/`chromium` projects and
// `dependencies` in playwright.config.js) and saves the resulting Firebase
// Auth session to STORAGE_STATE, so every spec starts already signed in
// instead of repeating this flow per test.
//
// Google popup sign-in can't be automated headlessly (it's a real OAuth
// consent screen on accounts.google.com), so this uses the app's
// email/password sign-in form instead — see index.html's #authEmail/
// #authPassword/#signInSubmit.
//
// Required env vars: E2E_EMAIL / E2E_PASSWORD, for an account that already
// exists in the target Firebase project (crumb-ddeb6 by default — see
// src/services/firebase.js).
//
// manage-offerings.spec.js and reservations.spec.js additionally need this
// account to be able to open "Manage pre-orders" on whichever bakery
// tests/utils/preorders.js picks — the app's ownsBakery() only allows that
// for the bakery's own business-role owner, or the hardcoded SUPER_ADMIN_UID
// (src/legacy-app.js). Using the super-admin account is the simplest way to
// satisfy this for any bakery in the project.

const STORAGE_STATE = 'playwright/.auth/user.json';

setup('sign in', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD must be set (e.g. in a .env file — see .env.example) ' +
      'to run this suite. See the comment at the top of tests/auth.setup.js for what ' +
      'account privileges the manage-offerings/reservations specs need.'
    );
  }

  await page.goto('/');
  await page.locator('#signInBtn').click();
  await page.locator('#authEmail').fill(email);
  await page.locator('#authPassword').fill(password);
  await page.locator('#signInSubmit').click();

  // updateNav() flips #navAvatar to display:flex once onAuthStateChanged
  // fires with a real user — the most reliable "signed in" signal available.
  await expect(page.locator('#navAvatar')).toBeVisible({ timeout: 15_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
