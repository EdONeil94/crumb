# Crumbz — working notes

See `README.md` for the phase-1 modularization overview (Vite build, file
layout, deploy steps). This file covers two things that change often enough
to need a living doc: the **handler delegation migration** in progress on
`phase-1-modularize`, and the **E2E test workflow**.

## Handler delegation migration

`index.html` and `src/legacy-app.js` still contain raw inline handlers
(`onclick="fn(...)"`, `onchange="fn(...)"`, `oninput="fn(...)"`) left over
from the original single-file app. These are being converted, cluster by
cluster, to the delegated `data-onclick`/`data-onchange`/`data-oninput`
system in `src/events/` (see `src/events/delegate.js` and
`src/events/actions.js` for how it works — `registerActions()` +
`getAction()` instead of `window[name]` lookups).

**Status as of 2026-08-24: ~67% converted** (197 delegated / 295 total
handler sites, raw + delegated, across both files, comments excluded).

| | raw (`onclick=`/`onchange=`/`oninput=`) | delegated (`data-on*=`) |
|---|---|---|
| `index.html` | 31 | 92 |
| `src/legacy-app.js` | 67 | 105 |
| **total** | **98** | **197** |

Converted clusters (fully delegated, 0 raw handlers left): **FOLLOWS**,
**FILTER HELPERS** (the actual filter logic — `buildItemRowHTML` and
`buildLocationFilterBar` were dead code and got deleted rather than
converted), Pre-order
discovery page + My Pre-orders burger-menu sheet, **Manage Offerings incl.
Pre-orders/Reservations**, and everything else converted in earlier sessions
per the git log.

"Manage Offerings incl. Pre-orders/Reservations" needed a follow-up pass
after being assumed done: it had 2 stragglers, both easy to miss because the
bulk of that flow was already delegated.
- Manage Offerings → Catalogue picker overlay (`openCatalogueManager`,
  `src/legacy-app.js:8059`): the ✕ close button and the per-item Remove
  button were raw `onclick=`. Fixed with a new `closeCatalogueManager()`
  helper (mirrors `closeMpDayDetail`/`closeEditOfferingOverlay`) and
  delegating `removeCatalogueItem` directly; both are now registered in the
  same `registerActions()` block as the rest of that cluster (no new
  `WINDOW EXPORTS`). Covered by a new test in
  `tests/manage-offerings.spec.js`.
- Bakery profile's own Pre-order tab (`renderPreorderTab`) built its
  "Reserve" button with a raw `onclick="openReserveModal(...)"` — a second,
  unconverted copy of a button that was already fully delegated in the
  *other* render path for the same action (the My Pre-orders /
  discovery-page listing, `:6570`). Now delegated the same way; this let
  `openReserveModal` come out of `WINDOW EXPORTS` entirely (it had no other
  external call sites). Already covered by existing tests that go through
  `reserveFromBakeryProfile` (`tests/utils/preorders.js`).

FOLLOWS, by contrast, turned out to already be fully converted — the one
`onclick=` string that greps as a hit inside its section (`:5183`) is a
comment describing the old code, not a live handler.

Remaining clusters, by raw-handler count in `src/legacy-app.js` (run
`npm run check:dead-refs` — it doesn't print this breakdown, but a quick
`grep -noE '\son(click|change|input)=' src/legacy-app.js | grep -v data-on`
does; exclude comment lines):

- DATA — 7
- BAKERY SEARCH — 6
- EDIT REVIEW — 6
- SHARE REVIEW WITH A FOLLOWED USER — 6
- IMAGE COMPRESSION — 5
- ADMIN PANEL RENDERERS — 5
- REACTIONS — 4
- SHOP — 4
- Bakery-profile-modal internals — `toggleBakeryHours`, `saveBakeryBlurb`,
  its Cancel button (raw `onclick="openBakeryProfile(...)"`) — 3 sites.
  Note: `editBakeryBlurb` itself has no visible call site anywhere in
  either file — worth confirming it's genuinely reachable (maybe rendered
  from a path this migration hasn't touched yet) before assuming it's dead.
- BUSINESS — BAKERY PAGE MANAGEMENT / ACTIVITY CALENDAR / DINING MAP /
  QR SCANNER (baker side) — 3 each
- ADD ITEM MODAL / ITEM MATCHING / ADMIN PANEL / SHOP MANAGEMENT (business
  users) — 2 each
- MODAL STEPS — 1

### Conversion workflow (every cluster — this is the definition of done)

1. Run `npm run check:dead-refs` before converting, and map any state
   dependencies within the cluster (shared module-scope variables, DOM ids
   read/written across functions in the cluster, etc.).
2. Convert handlers to the delegated system. No new `window[name]` exports —
   only add to the `WINDOW EXPORTS` block where genuinely unavoidable, and
   say why in a comment when you do.
3. Write or extend the Playwright spec in `tests/<feature>.spec.js` for that
   cluster's flows.
4. Run the full suite — `npm run test:e2e`, not just the new spec.
5. Update the migration status in this file (the table and cluster list
   above).
6. Report back with a summary and a manual verification checklist.

### What `check:dead-refs` (`scripts/check-dead-refs.js`) actually catches

Two distinct bug classes found the hard way during earlier passes, both
invisible until someone clicks the exact broken element — this is why step
1 above runs it *before* converting, not just after:

- **(a) Calls to functions that no longer exist.** Either a
  `data-onclick`/`data-onchange` name with no matching `registerActions()`
  entry (silently no-ops at runtime — `getAction()` just logs a
  `console.warn`), or a standalone `name(args);` statement whose `name`
  isn't defined/imported anywhere — the exact shape of a real bug found
  once (`renderManagePreorders` got renamed and 4 call sites were missed).
- **(b) Bare variable references inside raw `onclick=`/`onchange=`/
  `oninput=` handlers.** Top-level `let`/`const`/`var` bindings in an ES
  module never attach to `window` (unlike this file's *functions*, which do
  via the `WINDOW EXPORTS` block) — so a raw handler that references one
  directly (`currentUser.uid`, `fb.signOut(...)`, `notifItems[i]`) throws a
  `ReferenceError` at click time, regardless of whether delegation has
  touched that handler yet. 5 sites were found broken this way in one pass.

Both are checked statically (regex/line-based heuristics, not a real
parser — cheap and low-false-positive, not a substitute for judgement).

## Known pre-existing issues (out of scope for this migration)

- **Google Places API returns 403s** in the bakery-search flow (see the
  "Google Maps API key required" fallback text `src/legacy-app.js` renders
  around the `BAKERY SEARCH` cluster). Pre-existing, unrelated to handler
  delegation — don't try to fix it while converting that cluster, just
  don't let it block the conversion or get misread as something the
  migration broke.
- **"Test Croissant"** seeded test data in the live Firebase project still
  needs manual deletion. Not `E2E_`/`E2E `-prefixed, so
  `tests/cleanup.teardown.js` won't touch it — this is separate from the
  Playwright suite's own test-data lifecycle.

## E2E tests (Playwright)

**Pending: dedicated E2E test account.** `.env` doesn't exist yet in this
environment, and the suite hasn't been run since the Manage Offerings
catalogue-overlay fix (`closeCatalogueManager`/`removeCatalogueItem`
delegation) and the bakery-profile Pre-order tab Reserve-button conversion
landed — both are covered by specs (new and existing) but **unverified by
an actual run**. A dedicated E2E test account, separate from the personal
super-admin account `E2E_EMAIL`/`E2E_PASSWORD` pointed at until now, is
being set up — once it exists and can open "Manage pre-orders" on a bakery
(see `tests/utils/preorders.js`'s module comment for why that's required),
run the full suite before trusting anything converted since this note was
added, then delete this paragraph.

```bash
cp .env.example .env   # fill in E2E_EMAIL / E2E_PASSWORD — see comments in
                        # .env.example and tests/auth.setup.js for why this
                        # needs an account that can open "Manage pre-orders"
npm run test:e2e       # full suite
npm run test:e2e:ui    # interactive UI mode
```

- `tests/auth.setup.js` signs in once via the real UI and saves the session
  to `playwright/.auth/user.json`; every spec reuses it.
- `tests/cleanup.teardown.js` runs once after the `chromium` project
  finishes and deletes any Firestore docs / Storage files prefixed
  `E2E_`/`E2E ` — it needs the saved auth session to do this, so it can only
  run after `setup` has succeeded.
- Without a `.env` (or `E2E_EMAIL`/`E2E_PASSWORD` set some other way),
  `auth.setup.js` fails immediately and **nothing else runs, including
  teardown** — there's no test data to clean up in that case, since nothing
  ever signed in to create any.
- Gotcha seen once already: if the Playwright process itself gets killed
  (terminal closed, session ended) before or during a run, the HTML report
  it leaves behind shows *every* test — including `setup` and `cleanup` —
  as `skipped` with ~0 duration, no traces/screenshots. That's the signature
  of an interrupted run, not a real "everything skipped" result. Don't treat
  a report like that as a clean/uneventful run; treat it as "did not really
  run" and re-run before trusting the result.
