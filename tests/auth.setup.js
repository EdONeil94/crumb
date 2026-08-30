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
// E2E_EMAIL / E2E_PASSWORD: under the default emulator run
// (playwright.config.js) these are the fixed values for the account
// tests/seed-emulator.mjs creates — seeded with the app's SUPER_ADMIN_UID,
// so isAdmin()/ownsBakery() are true everywhere (manage-offerings.spec.js /
// reservations.spec.js need that). Under `npm run test:e2e:prod` they come
// from .env and must be a real crumb-ddeb6 account with the same powers.

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

  // indexedDB: true is required here — Firebase Auth (the modular v9+ SDK,
  // what this app uses) persists its session in IndexedDB, not
  // cookies/localStorage, which is all storageState() captures by default.
  // Without this, every dependent spec loads a context with an empty
  // session and fails "not signed in", even though this sign-in itself
  // succeeded.
  await page.context().storageState({ path: STORAGE_STATE, indexedDB: true });
});
