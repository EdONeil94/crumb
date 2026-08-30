# Crumbz

A community pastry-review app (Firebase + vanilla JS, built with Vite).

Phase 1 — moving Crumbz off a single 12,000-line `index.html` and onto a
proper modular project structure — is **complete**. No app logic was
rewritten in the process; behaviour matches the original single-file site
(plus a handful of documented robustness fixes).

## Project structure

```
index.html              page structure + modal markup only; one <script type="module">
src/
  main.js               entry point — imports the CSS, Firebase, and the app
  services/firebase.js  Firebase init; exposes window._crumb (legacy interface)
  state/appState.js     shared mutable state + its loader functions
  data/                 static read-only data (category tree, city lists)
  config.js             shared static config (Google Places API key)
  utils/                pure helpers (dom, geo, strings)
  events/               delegated-event system (data-onclick/onchange/oninput)
  app/lifecycle.js      PWA install, update check, pull-to-refresh, keyboard scroll
  components/*.js        reusable modals/widgets (nav, auth, review card, …)
  pages/*.js            the 9 routed #page-* views
  legacy-app.js         app bootstrap + a few feature clusters not yet carved out
  styles/main.css        all CSS
tests/                  Playwright E2E suite (see below)
scripts/check-dead-refs.js   static check for dead handler refs / scope leaks
docs/extraction-log.md  per-step history of the carving work
CLAUDE.md               living notes: the carving plan, standing lessons, known issues
.github/workflows/deploy.yml   builds + publishes to GitHub Pages on push to main
```

### How the HTML calls into the JS

The markup uses a delegated handler system — `data-onclick="openAddModal"`
instead of `onclick="openAddModal()"`. One listener per event type on
`document` dispatches to a registry (`src/events/`), so injected markup
needs no re-binding and modules register their own actions. A small
`WINDOW EXPORTS` block at the bottom of `legacy-app.js` still puts a few
functions on `window` — only where `index.html` keeps a genuine raw
`onclick=` (nav "+ Add", feed tabs, the rating slider, Settings, the admin
Manage-Bakery modal) or where a test drives one directly.

## Running it locally

```bash
npm install        # first time only
npm run dev         # dev server + live reload at http://localhost:5173/
```

## Building

```bash
npm run build       # → dist/ (optimized, GitHub-Pages-ready; base = './' relative)
npm run preview     # serve the built dist/ locally to sanity-check it
```

`dist/` is the deploy artifact — never the raw `src/` files.

## Deploying

Deployment is automatic via **GitHub Actions**
(`.github/workflows/deploy.yml`): every push to `main` runs `npm run build`
and publishes `dist/` to GitHub Pages. Repo **Settings → Pages → Source**
must be set to **"GitHub Actions"** for this to work.

The site is being migrated to the custom domain **`https://crumbz.lol/`**
(GitHub Pages hosting is unchanged — Wix is only the registrar, DNS points
at Pages). `public/CNAME` holds the domain so no deploy can drop it, and
`base: './'` in `vite.config.js` means the same build works both there and
at the legacy `https://edoneil94.github.io/crumb/` URL during the
transition. Cutover steps still pending: set the custom domain in the
Pages UI, add the DNS records at Wix, and allowlist `crumbz.lol` in
Firebase Auth / the Google Places API key / Stadia Maps.

You can also trigger a deploy by hand from the repo's **Actions** tab
(the workflow has a `workflow_dispatch` trigger).

## Tests

```bash
npm run test:e2e         # full Playwright suite — against the Firebase emulators
npm run test:e2e:ui      # interactive UI mode
npm run check:dead-refs  # static: dead handler refs, bare-variable scope leaks
```

`npm run test:e2e` needs **Java 21+** (firebase-tools 15's emulators) and network (for
Playwright's browser + a couple of Google-Places-backed specs), but **no
credentials and no production access**. `playwright.config.js` starts the
Auth/Firestore/Storage emulators (`firebase.json`) and a Vite server on
5174; `tests/seed-emulator.mjs` seeds a fresh deterministic baseline every
run. Result: **71 passed, 3 skipped, 0 failed** (verified locally and in
CI). The 3 skips are the live-Google-Places test and two Places-backed
cases the emulator can't cover.

```bash
cp .env.example .env       # E2E_EMAIL / E2E_PASSWORD — a real test account
npm run test:e2e:prod      # run the suite against the live Firebase project instead
```

Use `test:e2e:prod` only when you specifically need to check behaviour
against real data — it writes to `crumb-ddeb6` (with cleanup: a per-test
fixture, `cleanup.teardown.js`, and `npm run cleanup:e2e` as a safety net).

## What's next (not started)

- **Move the E2E suite onto the Firebase Emulator Suite** — it currently
  runs against the live Firebase project. See
  `docs/tier2-emulator-scope.md`.
- **Account management — no password change or reset.** Confirmed missing:
  the Settings page has only profile fields (name / location / country /
  bio / favourite category / avatar) + "Sign out"; the auth modal has no
  "Forgot password?" link; there are no `updatePassword` /
  `sendPasswordResetEmail` calls anywhere. An email/password user who wants
  to change their password, or has forgotten it, has no in-app path.
  (Google-sign-in users are unaffected — Google manages that credential.)
- Backend / Cloud Functions (currently all client-side against Firestore)
- React (optional — the modular structure is the groundwork for it)
- Native app wrapper
- **Custom domain** (`crumbz.lol`) — build-side prep done (`public/CNAME`
  + `base: './'`); DNS + Pages-UI cutover + external-service allowlisting
  still pending. See the Deploying section.

## Background

- `CLAUDE.md` — the carving plan (32 steps + post-plan residuals), the
  handler-delegation migration, standing lessons, and "Known pre-existing
  issues".
- `docs/extraction-log.md` — detailed write-up of every carving step and
  bug fix, most recent first.
