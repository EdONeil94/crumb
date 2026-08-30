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
npm run dev         # dev server + live reload at http://localhost:5173/crumb/
```

## Building

```bash
npm run build       # → dist/ (optimized, GitHub-Pages-ready; base = /crumb/)
npm run preview     # serve the built dist/ locally to sanity-check it
```

`dist/` is the deploy artifact — never the raw `src/` files.

## Deploying

Deployment is automatic via **GitHub Actions**
(`.github/workflows/deploy.yml`): every push to `main` runs `npm run build`
and publishes `dist/` to GitHub Pages
(`https://edoneil94.github.io/crumb/`). Repo **Settings → Pages → Source**
must be set to **"GitHub Actions"** for this to work.

You can also trigger a deploy by hand from the repo's **Actions** tab
(the workflow has a `workflow_dispatch` trigger).

## Tests

```bash
cp .env.example .env    # fill in E2E_EMAIL / E2E_PASSWORD (a real test account —
                         # see .env.example and tests/auth.setup.js)
npm run test:e2e         # full Playwright suite
npm run test:e2e:ui      # interactive UI mode
npm run check:dead-refs  # static: dead handler refs, bare-variable scope leaks
```

The suite signs in once via the real UI, reuses that session, and cleans up
its own `E2E `-prefixed Firestore/Storage data afterwards. It runs against
the live Firebase project, so it needs network and the test credentials.
Normal result: ~60 passed, 10–14 skipped (data-dependent), 0 failed.

## What's next (not started)

- Backend / Cloud Functions (currently all client-side against Firestore)
- React (optional — the modular structure is the groundwork for it)
- Native app wrapper
- **Custom domain** — a Wix-managed domain could be pointed at the Pages
  site later; a separate task, not wired up.

## Background

- `CLAUDE.md` — the carving plan (32 steps + post-plan residuals), the
  handler-delegation migration, standing lessons, and "Known pre-existing
  issues".
- `docs/extraction-log.md` — detailed write-up of every carving step and
  bug fix, most recent first.
