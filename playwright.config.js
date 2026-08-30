import { defineConfig, devices } from '@playwright/test';

// ─── Two modes ─────────────────────────────────────────────────────────────
// Default: run against the local Firebase Emulator Suite (no production
//   writes). playwright.config starts the emulators + a Vite server on 5174
//   with VITE_USE_EMULATOR=1, and tests/seed-emulator.mjs (globalSetup)
//   seeds baseline data. No .env / secrets needed.
// E2E_EMULATOR=0 (`npm run test:e2e:prod`): the old behaviour — `npm run dev`
//   on 5173 against the real Firebase project, credentials from .env. Kept
//   for the rare "I need to test against real data" case; Tier 1's cleanup
//   machinery (tests/utils/reviews.js's createReview fixture,
//   cleanup.teardown.js, scripts/cleanup-e2e-data.mjs) still applies.
const USE_EMULATOR = process.env.E2E_EMULATOR !== '0';
// Readable by specs (workers inherit process.env set here) — a couple of
// tests hit live external services (Google Places) that don't fit the
// hermetic emulator run.
process.env.E2E_MODE = USE_EMULATOR ? 'emulator' : 'prod';

// .env only matters in prod mode.
if (!USE_EMULATOR) {
  try { process.loadEnvFile('.env'); } catch { /* no .env — CI env vars instead */ }
} else {
  // Fixed creds for the seeded emulator user — keep in sync with
  // tests/seed-emulator.mjs. tests/auth.setup.js reads these unchanged.
  process.env.E2E_EMAIL = process.env.E2E_EMAIL || 'e2e@crumb.test';
  process.env.E2E_PASSWORD = process.env.E2E_PASSWORD || 'crumb-e2e-pw';
}

// vite.config.js sets base:'./' (relative), so the dev server serves at the
// root. E2E_BASE_URL overrides for prod runs (e.g. https://crumbz.lol/).
const PORT = USE_EMULATOR ? 5174 : 5173;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}/`;
const STORAGE_STATE = 'playwright/.auth/user.json';

const emulatorServers = [
  {
    command: 'npx firebase-tools emulators:start --only auth,firestore,storage --project crumb-ddeb6',
    url: 'http://127.0.0.1:4000', // emulator UI — up once all three emulators are ready
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
  },
  {
    command: 'npx vite --port 5174',
    env: { VITE_USE_EMULATOR: '1' },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
];

const prodServer = [{
  command: 'npm run dev',
  url: BASE_URL,
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
}];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // specs share one backend (emulator or project) sequentially
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Emulator mode: seed the baseline data after the emulators start, before
  // any spec. Prod mode: nothing to seed (real data is already there).
  globalSetup: USE_EMULATOR ? './tests/seed-emulator.mjs' : undefined,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Signs in once via the real UI and saves the Firebase Auth session so
    // every spec starts signed in. In emulator mode the account is the one
    // tests/seed-emulator.mjs creates.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // Runs once after the "chromium" project. In emulator mode it's a
    // near-no-op (the emulator is wiped on next run's globalSetup anyway);
    // in prod mode it's the load-bearing cleanup — see cleanup.teardown.js.
    { name: 'cleanup', testMatch: /cleanup\.teardown\.js/, use: { storageState: STORAGE_STATE } },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      teardown: 'cleanup',
    },
  ],

  webServer: USE_EMULATOR ? emulatorServers : prodServer,
});
