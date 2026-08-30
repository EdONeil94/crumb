# Tier 2 — move the E2E suite off production onto the Firebase Emulator Suite

Status: **IMPLEMENTED 2026-08-30** (branch `feat/e2e-emulator`). Follows
Tier 1 (commit `045f50e`). The suite now runs against the local emulators
with a seeded baseline — **zero writes to `crumb-ddeb6`**, verified. Full
suite: **71 passed / 3 skipped / 0 failed**, skip count stable across runs.
This document is kept as the design record; what actually shipped differs
from the plan below in a few places:

- **Seed grew to 4 users / 3 bakeries / 9 reviews / 4 products / 4 follow
  edges** (`tests/seed-emulator.mjs`) — "Bea" is the #1-ranked power
  reviewer so the follow-graph tests open *her* profile, not the E2E
  user's own; that (plus a small robustness fix to
  `people-filters.spec.js:190` — re-query the Followers list after the
  follow-toggle re-render) unskipped the follow tests that used to skip
  against prod.
- **`bakery-search.spec.js:90`** (live Google Places) `test.skip`s when
  `E2E_MODE === 'emulator'` — the API key's referrer allowlist is
  per-origin and the emulator's :5174 isn't on it. Covered by `test:e2e:prod`.
- **3 stable skips**: that Google Places test, `bakery-profile-management.js:33`
  (opening hours — also Places-backed), `admin-panel.js:128` (Flags tab —
  no flagged reviews seeded; the test is wiring-only anyway).
- **`firebase-admin` uses the modular API** (`firebase-admin/app` etc.) —
  v14 dropped `app.firestore()` / `app.auth()`.
- **The seed wipes both emulators first** (Firestore + Auth REST
  `/emulator/v1/...` DELETE), so it's idempotent and `reuseExistingServer`
  is safe.
- **CI**: `.github/workflows/e2e.yml` added (PRs + pushes to main).

---

## Original plan (for reference)

Follows Tier 1 (commit `045f50e` — reliable cleanup) which reduced the
bleeding but tests still write to live `crumb-ddeb6`. This removes
production writes entirely.

## Goal

`npm run test:e2e` runs against local Firestore + Auth + Storage emulators
seeded with deterministic baseline data. Zero writes to `crumb-ddeb6`. Full
suite green (passed + legitimately-skipped, 0 failed). `npm run dev` is
unchanged — still the real app against real Firebase, for manual dev.

## Architecture

```
npm run test:e2e
 └─ playwright.config.js webServer: [
      1. firebase emulators:start --only auth,firestore,storage   (ports 9099 / 8080 / 9199, UI 4000)
      2. vite --port 5174   with VITE_USE_EMULATOR=1
    ]
 └─ globalSetup: tests/seed-emulator.mjs   (Admin SDK → emulator, creates baseline data)
 └─ project "setup" (auth.setup.js)         signs in the seeded E2E user
 └─ project "chromium"                       the 71 tests, baseURL http://localhost:5174/crumb/
 └─ project "cleanup" (cleanup.teardown.js)  now a near-no-op (emulator data is thrown away on stop)
```

`src/services/firebase.js` calls `connectAuthEmulator` /
`connectFirestoreEmulator` / `connectStorageEmulator` **only** when
`import.meta.env.VITE_USE_EMULATOR` is set — which only the test webServer
sets. The production bundle never contains a truthy value for it (Vite
statically replaces `import.meta.env.*` at build time), so
`dist/index.html` can't accidentally point at a localhost emulator.

## Files

### New

| File | Purpose |
|---|---|
| `firebase.json` | emulator ports + `firestore.rules` / `storage.rules` paths + `firestore.indexes.json` |
| `.firebaserc` | `{ "projects": { "default": "crumb-ddeb6" } }` — the emulator reuses the project id for parity |
| `firestore.rules` | **the real deployed rules** — see "Blocker" below |
| `storage.rules` | the real deployed Storage rules — same |
| `firestore.indexes.json` | any composite indexes the app queries need (likely near-empty) |
| `tests/seed-emulator.mjs` | Playwright `globalSetup` — Admin SDK against the emulator, creates the baseline (see "Seed data") |
| `.github/workflows/e2e.yml` | *(optional, recommended)* run the emulator suite on PRs — free & safe now |

### Changed

| File | Change |
|---|---|
| `src/services/firebase.js` | `if (import.meta.env.VITE_USE_EMULATOR) { connect*Emulator(...) }` after the `getAuth/getFirestore/getStorage` calls, before `window._crumb` is assembled |
| `playwright.config.js` | `webServer` → array (emulators + vite@5174); `baseURL` → `:5174`; add `globalSetup`; `reuseExistingServer: false` for the vite entry (never reuse a stray prod dev server); drop the `.env` requirement message path where it no longer applies |
| `package.json` | `firebase-tools` + `firebase-admin` devDependencies (pinned — Admin SDK for the seed: bypasses rules so it can create data for multiple users / force the super-admin uid); `"test:e2e:prod"` escape hatch that runs the old way (env `E2E_BASE_URL` + no emulator) for the rare "I want to hit real data" case; maybe `"emulators": "firebase emulators:start ..."` for manual poking |
| `tests/auth.setup.js` | comment update (account now seeded, not "must already exist in crumb-ddeb6"); the sign-in flow itself is unchanged |
| `tests/cleanup.teardown.js` | gate the whole sweep behind `if (!process.env.VITE_USE_EMULATOR)` — or leave it running (it just finds this run's own data in the emulator and deletes it; harmless). Lean: leave it, add a one-line note. |
| `tests/utils/reviews.js`, `tests/utils/preorders.js`, `scripts/cleanup-e2e-data.mjs` | no change — `window._crumb` transparently points at the emulator |
| `.env.example` | note `.env` is now only needed for `test:e2e:prod`; the emulator suite needs no secrets |
| `CLAUDE.md` | rewrite the "E2E tests" + "Known pre-existing issues" (the prod-leak note) sections |
| `README.md` | update the Tests section |
| `.gitignore` | `firebase-debug.log`, `firestore-debug.log`, `ui-debug.log`, `.firebase/` |

## Seed data (`tests/seed-emulator.mjs`)

The emulator starts empty; `openFirstBakeryProfile` (6 spec files) **throws**
without a bakery, and `auth.setup.js` can't sign in a non-existent user.
Everything else `test.skip`s gracefully on missing data — so the seed only
has to cover what would otherwise *fail*, and can grow later.

**Minimum viable seed** — via **`firebase-admin` pointed at the emulator**
(env `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` /
`FIREBASE_STORAGE_EMULATOR_HOST`). The Admin SDK bypasses security rules, so
the seed can write `items`/`profiles`/`products` owned by *several* users
(the client SDK couldn't — rules would reject cross-user writes) and can
force the super-admin uid:

1. **Auth**: the E2E user — either uid **forced to
   `KTpBS4yJx2h8LpcryCTfJDFCHlr2`** (`SUPER_ADMIN_UID` in `appState.js`), or
   any uid + a `userRoles/{uid} = { role: 'admin' }` doc; both make
   `isAdmin()` true. Email/password from `E2E_EMAIL`/`E2E_PASSWORD` or fixed
   test values. Plus 1–2 other users (so "members"/"rankings" have >1).
2. **`profiles/{uid}`** for each user (displayName, location, country).
3. **`items` + `itemRecords`**: ~4–6 reviews across **2 bakeries**, authored
   by the different users, with at least one user reviewing **2 bakeries**
   and another reviewing **exactly 1** (unskips the profile location-chip
   tests). Real `createdAt` timestamps.
4. **`bakeryProfiles/{bakeryName}`** for the 2 bakeries (blurb, ownerId).
5. **`products`**: 2–3 shop products across the 2 bakeries, at least one
   `available: true` (unskips the Buy-button + shop-filter tests).
6. **`follows`**: E2E user → user2, and user3 → E2E user (unskips the Send-
   wiring test and the followers-list test).

Tests still legitimately skipping on the MVP seed (acceptable — they skip
against prod too when the data isn't there): flagged reviews, feature
requests, a "blank day" in the calendar, business-role (non-super-admin)
sub-cases, 2+-bakeries-with-shop-products filter. The seed can be extended
incrementally.

**Determinism**: the seed runs fresh every `globalSetup` (emulator is empty
at start), so the suite's skip count becomes *stable* instead of
data-dependent — a real improvement over today's "10–14 skipped, run to
run".

## ⚠️ Blocker / decision needed: the security rules

**The real Firestore + Storage rules are not in the repo — they live only in
the Firebase console.** The emulator needs them. Options:

- **A (recommended): commit the real rules.** You (project owner) copy
  `firestore.rules` and the Storage rules out of the console
  (Firestore → Rules, Storage → Rules) and I commit them as
  `firestore.rules` / `storage.rules`. This also closes a real gap — those
  rules should be version-controlled regardless. The emulator then exercises
  the *actual* rules, and a future `firebase deploy --only firestore:rules`
  becomes possible.
- **B: I run `firebase login` interactively** (`! firebase login --no-localhost`
  in this session, your Google account) and pull the active ruleset via the
  Rules API. Same outcome as A, less copy-paste for you, but needs the
  interactive login.
- **C: permissive emulator-only rules** (`allow read, write: if request.auth != null`).
  Fastest, but the suite then can't catch rule regressions, and a few specs
  that lean on real rule behavior change:
  - `cleanup.teardown.js` / `scripts/cleanup-e2e-data.mjs` reservations
    fallback (delete-then-cancel) — with permissive rules the delete
    *succeeds*, so the "469 undeletable" situation simply doesn't recur in
    the emulator (fine, arguably better).
  - Any spec asserting a write is *rejected* would need review (I don't
    think any do — they mostly assert wiring, not rejection).

**Recommendation: A.** It's ~5 minutes for you and it's the correct
long-term state. I'll fall back to C with a loud caveat only if A/B aren't
possible.

## Google Places / geocoding

Orthogonal to the emulator — `places.googleapis.com` is external. Current
behavior is unchanged:
- Most specs use `window.selectManualBakery()` which bypasses the Places API
  entirely.
- `bakery-search.spec.js`'s one "live Google Places search" test and
  `dining-map`/`explore` geocoding hit the real API with the real key — they
  pass if network + key are OK, degrade/skip otherwise, exactly as today.

## `firebase-tools` in CI / Codespaces

- Java 25 is present here — emulators run.
- `firebase-tools` as a pinned devDependency (~big, but `npm ci` handles it).
  First `emulators:start` downloads the emulator jars to
  `~/.cache/firebase/emulators` (~cached after).
- Optional `.github/workflows/e2e.yml`: `npm ci` → cache
  `~/.cache/firebase/emulators` → `npx playwright install --with-deps chromium`
  → `npm run test:e2e`. No secrets needed (emulator + seeded fake user).
  This would make the suite actually gate PRs for the first time.

## The 469 cancelled reservations in production

Tier 2 stops *new* ones. The existing 469 (`status: cancelled`,
`offeringName` `E2E `-prefixed) still can't be client-deleted — confirmed,
the rules reject it even for the super-admin. Cleanup options once Tier 2
lands:

- **Admin SDK one-off**: if the rules are committed (option A/B above), a
  short `firebase-admin` script authenticated with a **service-account key**
  (downloaded from the console, used once, not committed) can hard-delete
  them — the Admin SDK bypasses rules. ~20 lines, run once.
- Or add a narrow rule allowing the owner to delete their own `cancelled`
  reservations and reuse `scripts/cleanup-e2e-data.mjs`.
- Or leave them — they're invisible to users (cancelled reservations don't
  render anywhere).

Recommendation: fold a one-off Admin SDK delete into the Tier 2 work (needs
the service-account key from you), then they're gone for good.

## Effort estimate

| Piece | Size |
|---|---|
| `firebase.json` / `.firebaserc` / rules files / indexes | small (mostly config; rules come from you) |
| `src/services/firebase.js` emulator wiring | small (~10 lines) |
| `playwright.config.js` rework (webServer array, globalSetup, port) | medium |
| `tests/seed-emulator.mjs` (MVP seed) | **medium–large** — the real work |
| doc + comment updates | small |
| verification: full suite green against emulator, twice | — |
| *(optional)* CI e2e workflow | small–medium |
| *(optional)* one-off Admin SDK reservation purge | small (needs SA key) |

## Verification (definition of done)

1. `npm run test:e2e` starts the emulators + seeded data + vite@5174, runs
   all 71 tests, **0 failed**, skip count *stable* across two consecutive
   runs.
2. During and after a run, a query against **live `crumb-ddeb6`** shows **no
   new `E2E `-prefixed docs** in any collection (the definitive "no prod
   writes" check).
3. `npm run dev` still serves the real app against real Firebase.
4. `npm run build` output unchanged — `VITE_USE_EMULATOR` absent →
   `connect*Emulator` calls tree-shaken / dead.
5. `npm run test:e2e:prod` (escape hatch) still works against real data with
   Tier 1's cleanup intact.

## Open questions for you

1. **Rules**: option A (you paste them), B (I `firebase login`), or C
   (permissive + caveat)?
2. **CI e2e workflow** — add it in this pass, or as a follow-up?
3. **The 469 reservations** — purge via a one-off Admin SDK script now (you
   provide a service-account key), or leave them?
4. **Tier 1 push/merge** — Tier 1 is committed on `fix/e2e-prod-data-leak`
   but not pushed. Merge Tier 1 to `main` now (it's independently valuable),
   or hold the branch and merge Tier 1 + Tier 2 together?
