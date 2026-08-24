import { defineConfig, devices } from '@playwright/test';

// Loads E2E_EMAIL/E2E_PASSWORD (see .env.example) without needing the
// `dotenv` package — process.loadEnvFile is a built-in Node API (stable
// since Node 21.7/22.0). Silently no-ops if .env doesn't exist, so CI can
// supply these as real environment variables instead.
try { process.loadEnvFile('.env'); } catch { /* no .env file — fine */ }

// vite.config.js sets base:'/crumb/', so every route (including the built
// app served by `vite preview`) lives under that prefix — baseURL includes
// it so tests can navigate with page.goto('/') instead of repeating it.
const PORT = 5173;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}/crumb/`;

const STORAGE_STATE = 'playwright/.auth/user.json';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // specs share one real Firebase project — avoid concurrent writes racing each other
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: 60_000, // real Firestore round-trips are slower than a mocked backend
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Signs in once via the real UI (email/password — see tests/auth.setup.js
    // for why Google popup sign-in isn't an option here) and saves the
    // resulting Firebase Auth session, so every other spec starts already
    // signed in instead of repeating the sign-in flow per test.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // Runs once after every spec in "chromium" finishes (Playwright's
    // teardown-project mechanism — see tests/cleanup.teardown.js for what
    // it removes and how tightly it's scoped) and reuses the same signed-in
    // session, since deleting the test data requires being signed in as
    // whatever account created it.
    { name: 'cleanup', testMatch: /cleanup\.teardown\.js/, use: { storageState: STORAGE_STATE } },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      teardown: 'cleanup',
    },
  ],

  // Reuses a dev server you already have running (e.g. via `npm run dev`)
  // instead of starting a second one — set reuseExistingServer to false in
  // CI so a stale/incompatible server can't be reused silently.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
