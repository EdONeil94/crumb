# Crumbz — working notes

See `README.md` for the phase-1 modularization overview (Vite build, file
layout, deploy steps). This file covers three things that change often
enough to need a living doc: the **handler delegation migration** (complete
as of 2026-08-24 — see milestone note below), the **carving of
`src/legacy-app.js` into `src/pages/`/`src/components/`** (in progress, see
its own section below), and the **E2E test workflow** — all done on
`phase-1-modularize`.

## Carving src/legacy-app.js into src/pages/ and src/components/

**Status as of 2026-08-28: the 32-step carving plan is COMPLETE.**
All 32 steps landed (Phase 7's last five: `src/pages/bakeries.js` (step 26,
`465522f`); `src/pages/leaderboard.js` (step 27, `4f01f3`);
`src/pages/home.js` (step 28, `7b8db6c`); `src/pages/explore.js` (step 29,
`3235a09`) — the largest cluster (~735 lines), which also spun off
`src/data/exploreCities.js` + `src/services/places.js`;
`src/pages/preorders.js` (step 30, `048fcc3`);
`src/components/preordersSheet.js` (step 31, `913d1d2`);
`src/pages/settings.js` (step 32, `69704e0`) — the final step).
`src/legacy-app.js` went from 9,412 lines / 296 functions at the start of
the plan to ~1,357 lines (app bootstrap + a set of functions with genuine
raw/`WINDOW EXPORTS`/registry call sites, or explicitly held back at a
neighbour's extraction — see the `saveEdit`/`deleteReview` write-up in
`docs/extraction-log.md` for the current inventory).

**Post-plan residual cleanups (NOT plan steps — separate follow-ups):**
1. ✅ **RESOLVED 2026-08-30 (commit `52250da`).** `showPage()` /
   `navigateFromMobileMenu()` / `openMyProfileFromMobileMenu()` →
   `src/components/nav.js` — the Phase 1 step 5 deferral. `nav.js` imports
   the 9 page renderers + `openProfileModal` one-way; the lone cycle edge
   (`settings.js` ↔ `nav.js`) is broken via `getAction()` on
   `settings.js`'s side. `index.html`'s last raw `showPage()` site
   (profile modal ✏️, `:824`) converted to `data-onclick`. `showPage`
   stays in `WINDOW EXPORTS` (`window.showPage`, for
   `tests/people-filters.spec.js` only). See `docs/extraction-log.md`.
2. ✅ **RESOLVED 2026-08-30 (commit `2c7ef8c`).** `loadData()` /
   `loadProfiles()` / `buildBakeryIndex()` (+ `exploreCache`) →
   `src/state/appState.js` — the Phase 0 stage 3b deferral. `appState.js`
   stays a leaf: its two loaders reach their UI callbacks
   (`renderRecentGrid`/`updateStats`/`updateNav`/`renderPeople`) via
   `getAction()`. The ~5 `getAction('buildBakeryIndex')()` sites +
   `adminPanel.js`'s `getAction('loadData')()` became plain
   `appState.js` imports; both `registerActions()` calls for them removed
   from `legacy-app.js`. `setAllItems`/`setAllBakeries` deleted.
   `madge --circular`: still clean. See `docs/extraction-log.md`.
   - ✅ **Tied follow-up RESOLVED 2026-08-30 (commit `dc45b62`).**
     `saveEdit()` / `deleteReview()` → `src/components/editReviewModal.js`,
     which is whole again (the Phase 2 step 9 split is fully closed). No
     cycle — `editReviewModal.js` is imported only by `legacy-app.js`. Both
     register from `editReviewModal.js` now;
     `editingItemId`/`editPhotoFile`/`editPhotoDataURL` lost their `export`.
3. ✅ **RESOLVED 2026-08-30.** The `loadData()` reconcile race (was in
   "Known pre-existing issues") — an app-robustness bug carried through the
   whole plan unfixed by design, then fixed as a deliberate post-plan
   behavior change (diagnosed first in `docs/residual-3-diagnosis.md`).
   `loadData()` now rebuilds `allBakeries` so it's never stale w.r.t.
   `allItems`, re-renders the active Bakeries/Leaderboard page if the fetch
   lands after navigation, and supports an opt-in `mergeLocal` mode (used
   only by `saveReview`'s reconcile) that preserves a just-written row a
   racing server read hasn't caught up to. Regression coverage:
   `tests/data-reconcile.spec.js` (one deterministic test per manifestation,
   each confirmed to fail pre-fix). See `docs/extraction-log.md`.

See `docs/extraction-log.md` for every step's write-up.
Earlier: steps 1-25 — Phase 4's `manageOfferingsModal.js` (the "does
this scale" milestone) and `addReviewModal.js` (the modalNext/modalBack
cluster — held to an explicitly elevated verification bar, see its own
entry in `docs/extraction-log.md`). Phase 5 (composite modals: `itemDetailModal.js` —
✅ done, step 19; `shareReviewModal.js` — ✅ done, step 20;
`bakeryModal.js` — ✅ done, step 21; `profileModal.js` — ✅ done, step 22,
closing out the phase and resolving the largest backlog of deferred items
in the whole plan, see its own entry in `docs/extraction-log.md`). Phase 6 opened with
`adminPanel.js` — ✅ done, step 23, which corrected the plan's own "5
headers, one real feature" framing (see its own entry in `docs/extraction-log.md`) —
`businessBakeryManagement.js` — ✅ done, step 24, a clean single-feature
move, no split needed, but caught a real check:dead-refs regression
(`closeBakeryEditModal` exported but never registered) before build/tests
ran, see its own entry in `docs/extraction-log.md` — `notifications.js` — ✅ done, step
25, closing out Phase 6, another clean single-feature move, zero prior
test coverage (verified manually with a throwaway debug spec), see its own
entry in `docs/extraction-log.md`.
This is separate from — and comes after — the handler delegation migration
above; don't conflate the two milestones. Plan approved 2026-08-24 (was
drafted as a plan-mode file at `~/.claude/plans/logical-painting-kurzweil.md`,
which is **outside this repo and not guaranteed to survive a session
reset** — this section is the durable copy of record; treat it, not the
plan file, as authoritative if they ever diverge).

**Why this is happening now**: the handler delegation migration removed the
main reason functions needed `window[name]` exposure, which was the blocker
to splitting `legacy-app.js` (9,412 lines, 296 functions) safely.

**The single biggest risk**: module scope. Splitting one file into many ES
modules means top-level `let`s that today are implicitly shared (same file,
same scope) become genuinely private to whichever file they end up in,
unless deliberately exported — the exact bug class already hit twice this
project (bare `currentUser`/`fb` refs throwing `ReferenceError`,
`modalNext`/`modalBack` silently unregistered past `check:dead-refs`). This
is why a dedicated shared-state module (`src/state/appState.js`) is
front-loaded early rather than discovered cluster by cluster.

### Proposed layout

```
src/
  state/appState.js     — shared mutable state + its loader functions
  data/categories.js     — CATEGORY_TREE and friends: static, read-only, zero risk
  data/exploreCities.js  — EXPLORE_COUNTRIES/ALL_CITIES/UK_CITIES: static, read-only
                            (added step 29 — same rationale as categories.js)
  services/places.js     — geocodeBakeryAddress: Google Places text-search helper
                            (added step 29 — shared by explore.js + profileModal.js)
  config.js              — GOOGLE_MAPS_KEY (added step 18)
  utils/                 — showToast, timeAgo, escJS, lockScroll/unlockScroll, distKm,
                            extractCity, extractCountry — pure functions, zero shared state
  app/lifecycle.js       — PWA install, update check, mobile status bar fix,
                            pull-to-refresh, keyboard-aware scrolling
  components/*.js        — reusable modals/widgets used from more than one page
  pages/*.js             — the 9 index.html `#page-*` routed views
```

`appState.js` centralizes: **identity/roles** (`currentUser`, `fb`,
`allUserRoles`, `currentUserRole`, `currentUserBakery`, `bakeryProfiles`,
`isAdmin()`/`isBusiness()`/`ownsBakery()`, `loadUserRole()`/
`loadAllUserRoles()`/`loadBakeryProfiles()` — ✅ done, 3a), **core data
caches** (`allItems`, `allBakeries`, `allProfiles`, `allItemRecords`,
`exploreCache` + their loaders `loadData()`/`buildBakeryIndex()`/
`loadProfiles()`/`loadItemRecords()`/`ensureProfileExists()` — ✅ done, 3b
for the caches + `loadItemRecords`/`ensureProfileExists`; the other three
loaders + `exploreCache` followed at post-plan residual #2, 2026-08-30,
reaching their UI callbacks via `getAction()` so `appState.js` stays a
leaf. Corrected 2026-08-24: an earlier draft of this line duplicated
`loadBakeryProfiles()`/`loadAllUserRoles()`/`loadUserRole()` here too,
which was wrong — those belong to identity/roles, moved in 3a), and
**social state** (`myFollowing`/`myFollowers` + `loadFollows()`,
`userBookmarks` + `loadBookmarks()`, `userSavedItems` + `loadSavedItems()`
— ✅ done, 3c). Centralizing the loaders alongside the raw state is
deliberate — two of this doc's "Known pre-existing issues" (below) are bugs
in exactly these loaders, and this move is a natural point to at least
surface that, not an obligation to fix it while extracting.

Sections that must **not** become 1:1 modules: **FILTER HELPERS** (grab-bag
spanning People page + Profile modal + Bakery modal internals — splits
three ways); **ADMIN PANEL / ADMIN PANEL RENDERERS / MANAGE BAKERY / REVIEW
FLAGGING (empty) / FLAG REVIEW** (5 headers, one real feature →
`adminPanel.js`); **RATING** (1 function, folds into `addReviewModal.js` —
it's the wizard's own slider); **UTILS** (mostly a migration-log comment
block, not utility code — prune, don't carry into `src/utils/`).

**Prerequisite, not yet done**: `scripts/check-dead-refs.js` defaults to
scanning `src/legacy-app.js` only (the same documented blind spot that let
`modalNext`/`modalBack` ship broken during the delegation migration) — needs
extending to cover the new directories before relying on it during this
work, ideally before Phase 1 starts.

### Extraction order (32 steps across 8 phases)

Ordered by a mix of test-coverage confidence *and* entanglement/blast-radius
— not coverage alone (e.g. `src/app/lifecycle.js` has no dedicated tests but
near-zero entanglement, so it's Phase 1, not Phase 7).

- **Phase 0 — infrastructure, most carefully, full E2E after each:**
  1. `src/data/categories.js` — ✅ **done** (2026-08-24, commit `2d06491`)
  2. `src/utils/*` — ✅ **done** (2026-08-24, commit `a372e56`)
  3. `src/state/appState.js` — **split into 3 checkpointed commits**, full
     `test:e2e` after each: **3a** identity/roles — ✅ **done** (2026-08-24,
     commit `81c15a4`), **3b** core data caches — ✅ **done** (2026-08-24,
     commit `068b68c`), **3c** social state — ✅ **done** (2026-08-24,
     commit `2367ba2`) — the cleanest of the three: all 5 loaders
     (`loadFollows`/`loadBookmarks`/`loadSavedItems`) genuinely
     self-contained, no setters needed at all. Resolved before
     3a started: the plan's general "functions stay in `legacy-app.js`,
     only state moves" framing conflicted with 3a's own specific
     enumeration (which lists 6 functions) — confirmed with the user that
     the specific enumeration wins where they conflict, so small
     self-contained state-management functions (no DOM/UI rendering) move
     together with the state they manage. **This did NOT transfer cleanly
     to 3b, as flagged**: `loadData()`/`buildBakeryIndex()`/`loadProfiles()`
     each depend on something `legacy-app.js` still owns (UI render calls,
     or `exploreCache` from the not-yet-extracted Explore page) — moving
     them would've meant `appState.js` importing back from the file that
     imports it. Resolved by moving state + setters only for those three
     (mirroring 3a's `currentUser`/`fb` treatment), while the two genuinely
     self-contained functions (`loadItemRecords`, `ensureProfileExists`)
     moved wholesale like 3a. **The half-done part was closed 2026-08-30 by
     post-plan residual #2** (commit `2c7ef8c`): all three loaders +
     `exploreCache` moved into `appState.js`, the UI callbacks reached via
     `getAction()`, `setAllItems`/`setAllBakeries` deleted. 3c also turned
     out cleanest — no setters at all.
  4. Extend `check:dead-refs` to cover the new directories — ✅ **done**
     (2026-08-24, commit `d72d04e`).
- **Phase 1 — foundational, high fan-in, implicitly covered by every spec:**
  5. `src/components/nav.js` — ✅ **done** (2026-08-24, commit `a2e5c61`) —
  split, not moved wholesale: `showPage`/`navigateFromMobileMenu`/
  `openMyProfileFromMobileMenu` deferred, see step 32's callout below ·
  6. `src/components/authModal.js` — ✅ **done** (2026-08-24, commit
  `1e56987`) — fully self-contained, no deferred pieces, unlike step 5 ·
  7. `src/app/lifecycle.js` — ✅ **done** (2026-08-24, commit `01419f1`) —
  side-effect-only import, execution-order change verified safe by
  inspection (no dedicated tests for this cluster)
- **Phase 2 — small, self-contained, strongly direct-tested:**
  8. `src/components/reactions.js` — ✅ **done** (2026-08-24, commit
  `98e1120`) — genuinely clean, no split needed, matches the plan's own
  characterization of this phase ·
  9. `src/components/editReviewModal.js` — ✅ **done** (2026-08-24, commit
  `a911b4f`) — split, not clean, unlike step 8: `handleEditPhoto` deferred
  to step 18, `saveEdit`/`deleteReview` deferred past the whole plan. **All
  three since rejoined — the split is fully closed** (`handleEditPhoto`
  2026-08-25 commit `d4cfec1`; `saveEdit`/`deleteReview` 2026-08-30 commit
  `dc45b62`, a follow-up to residual #2) ·
  10. `src/components/qrCode.js` — ✅ **done** (2026-08-24, commit
  `b002aa0`) — split; see step 17 callout below for the 2 deferred
  functions ·
  11. `src/pages/shop.js` — ✅ **done** (2026-08-24, commit `163abf4`) —
  **closes out Phase 2** — genuinely clean despite several external
  callers, a true leaf module (first page extraction)
- **Phase 3 — medium, cohesive, good coverage:**
  12. `src/components/reviewCard.js` — ✅ **done** (2026-08-24, commit
  `502e057`) — split, not clean: `openProfileIfSignedIn` deferred, see its
  own entry in `docs/extraction-log.md` ·
  13. `src/pages/feed.js` — ✅ **done** (2026-08-24, commit `bcb1366`) —
  moved wholesale, but `switchFeedTab` keeps its `WINDOW EXPORTS` entry
  (a new situation — see its own entry in `docs/extraction-log.md`) ·
  14. `src/components/follows.js` — ✅ **done** (2026-08-24, commit
  `df961f0`) — split 5-and-5, see its own entry in `docs/extraction-log.md` for
  the two different deferral targets ·
  15. `src/pages/people.js` — ✅ **done** (2026-08-25, commit `4d5633e`) —
  moved wholesale (best-covered page in the app); resolved step 14's
  deferred-follow-up decision — see its own entry in `docs/extraction-log.md` ·
  16. `src/components/reservations.js` — ✅ **done** (2026-08-25, commit
  `a07cb2e`) — **closes out Phase 3** — split, not clean:
  `cancelReservation` deferred to Phase 7 step 31, see its own
  entry in `docs/extraction-log.md`
- **Phase 4 — large but well-tested (the "does this scale" milestone):**
  17. `src/components/manageOfferingsModal.js` — ✅ **done** (2026-08-25,
  commit `ebeec4e`) — the "does this scale" milestone passed: biggest
  single cluster in the plan (~1,020 lines, 11 real-click tests — deepest
  coverage in the app), moved wholesale as **one** commit, not split — see
  its own entry in `docs/extraction-log.md` for why no sub-staging applied here
  (unlike `appState.js`'s 3a/3b/3c)

  **✅ Resolved (2026-08-25, same commit).** The Phase 2 step 10 deferral
  on `confirmCollected()`/`closeQrConfirmOverlay()` (`qrCode.js`) is
  closed: `markCollected()` now has a real importable home in this file,
  so both moved into `qrCode.js` — one-way dependency
  (`qrCode.js` → `manageOfferingsModal.js`), no cycle, verified explicitly
  before moving. See `qrCode.js`'s own updated header comment and the
  entry in `docs/extraction-log.md` for the full reasoning.

  18. `src/components/addReviewModal.js` — ✅ **done** (2026-08-25, commit
  `2c827ae`) — kept as **one** module per the plan (internal state is
  deeply cross-referential; this is the exact cluster where
  `modalNext`/`modalBack` broke during delegation), held to an explicitly
  elevated verification bar — see its own entry in `docs/extraction-log.md`.

  **✅ Resolved (2026-08-25, commit `d4cfec1`, separate follow-up commit).**
  The Phase 2 step 9 deferral on `handleEditPhoto()` (`editReviewModal.js`)
  is closed: `compressImage()`/`compressToDataURL()` now have a real
  importable home in `addReviewModal.js`, so `handleEditPhoto()` moved into
  `editReviewModal.js` — one-way dependency, no cycle, verified before
  moving. `saveEdit()`/`deleteReview()`'s own deferral outlived step 9 —
  its last blocker (`loadData()`) cleared at residual #2 (2026-08-30), and
  they moved into `editReviewModal.js` the same day (commit `dc45b62`),
  fully closing the step 9 split.
- **Phase 5 — composite modals aggregating several historical clusters:**
  19. `src/components/itemDetailModal.js` — ✅ **done** (2026-08-25, commit
  `2d90c6a`) — **opens Phase 5** — split, not clean:
  `closeDetailAndOpenProfile` deferred to step 22, see its own
  entry in `docs/extraction-log.md` ·
  20. `src/components/shareReviewModal.js` — ✅ **done** (2026-08-25, commit
  `49a31db`) — split, not clean: `renderSavedTab`/
  `removeBookmarkAndRefreshSaved` deferred to step 22, see its own
  entry in `docs/extraction-log.md` ·
  21. `src/components/bakeryModal.js` — ✅ **done** (2026-08-25, commit
  `7b89f37`) — brought in the reserveOffering/openReserveModal/
  closeReserveModal/renderPreorderTab cluster deliberately left out of
  step 16 (confirmed by reading, not trusted from the plan alone); two
  genuinely blocked calls (buildBakeryIndex, loadMyPreorders/
  renderPreorderPage) resolved via the getAction() pattern from step 18 —
  see its own entry in `docs/extraction-log.md` ·
  22. `src/components/profileModal.js` — ✅ **done** (2026-08-26, commit
  `45b33a3`) — **closes out Phase 5**, resolving the largest backlog of
  deferred items in the whole plan (closeDetailAndOpenProfile from step 19,
  renderSavedTab/removeBookmarkAndRefreshSaved from step 20,
  openProfileIfSignedIn from step 12, half of follows.js's step 14 pair);
  also brought in Activity Calendar/Dining Map (never their own plan step)
  and toggleBookmark (a dependency found only by reading, not pre-flagged
  anywhere) — see its own entry in `docs/extraction-log.md`
- **Phase 6 — admin/business surfaces (spec exists, but destructive actions
  are wiring-only, not click-verified — extra manual QA regardless of order):**
  23. `src/components/adminPanel.js` — ✅ **done** (2026-08-26, commit
  `b86c34e`) — **opens Phase 6**. Corrected the plan's own "5 headers, one
  real feature" framing: `flagReview` (FLAG REVIEW) stayed behind (general
  "report a review" action, not admin-only), and FEATURE REQUESTS split
  (general submit flow stays, admin-only vote/status/delete/render moves).
  Also picked up 5 functions never under any of the 5 named headers at all
  (living under the otherwise-fully-migrated ROLES header). Surfaced a real
  pre-existing bug (`refreshAdminUsersPanel`/`renderAdminUsers` target a
  nonexistent DOM id) rather than fixing it — see its own extraction-log
  entry ·
  24. `src/components/businessBakeryManagement.js` — ✅ **done** (2026-08-26,
  commit `a127a52`) — carries the documented
  `renderBusinessSection()`-missing-`buildBakeryIndex()` bug forward,
  surfaced not fixed. Genuinely one clean feature, no split needed —
  distinct from adminPanel.js's similarly-named MANAGE BAKERY (separate
  modal, separate Firestore collection). `check:dead-refs` caught a real
  bug before build/tests ran (`closeBakeryEditModal` exported but never
  registered as a delegated action) — see its own entry in `docs/extraction-log.md` ·
  25. `src/components/notifications.js` — ✅ **done** (2026-08-26, commit
  `0be56ae`) — **closes out Phase 6**. Zero prior test coverage confirmed
  (no dedicated spec, no existing spec references it) — verified manually
  with a throwaway debug spec (bell open/close, empty-state render,
  mark-read timer, zero console errors); direct Firestore write to
  simulate a real notification was correctly blocked by security rules,
  not attempted further. `loadNotifications` imported back for 4 real
  plain-JS callers in `legacy-app.js`'s `initFirebaseApp()` — see its own
  entry in `docs/extraction-log.md`
- **Phase 7 — last, zero/confirmed-zero direct test coverage, budget extra
  manual QA, write/extend specs at extraction time rather than leaving the
  gap open:**
  26. `src/pages/bakeries.js` — ✅ **done** (2026-08-28, commit `465522f`)
  — **opens Phase 7**. Clean single-cluster move; `buildBakeryIndex()`
  stayed behind at the time (reached via `getAction('buildBakeryIndex')()`);
  it moved to `appState.js` at residual #2 (2026-08-30) and this file's two
  call sites are now plain imports. The documented `loadData()` race is
  carried forward unfixed (it's the still-`legacy-app.js` `loadData()` and
  the once-only `renderBakeries()` call from `showPage()` — neither moved
  or changed). Zero prior coverage confirmed; verified with a throwaway
  debug spec. See its entry in `docs/extraction-log.md` ·
  27. `src/pages/leaderboard.js` — ✅ **done** (2026-08-28, commit
  `4f01f3`). Clean single-cluster move; `renderBakeryLeaderboard` reached
  `buildBakeryIndex()` via `getAction()` at the time (a plain
  `appState.js` import since residual #2). `lbCurrentTab`/`lbCurrentMode`
  exported as plain live bindings (never written outside the file). This
  makes `renderLeaderboard`/`lbCurrentTab` importable, resolving half of
  the deferral for `editReviewModal.js`'s `saveEdit`/`deleteReview` — the
  other half (`loadData()`) landed at residual #2, and both functions
  moved into `editReviewModal.js` on 2026-08-30 (commit `dc45b62`).
  Removed a dead `openBakeryProfile` import from `legacy-app.js`. See its
  entry in `docs/extraction-log.md` ·
  28. `src/pages/home.js` — ✅ **done** (2026-08-28, commit `7b8db6c`).
  Smallest move in the plan: `updateStats` + `renderRecentGrid` only, both
  pure render helpers with no `data-onclick`/`data-onchange` and no
  `showPage('home')` branch — reached only from `loadData()`/`saveReview()`
  (both still in `legacy-app.js`). Also removed 3 imports dead in
  `legacy-app.js` since step 13 (`cardHTML`/`feedCardHTML`,
  `buildReactionBarInner`/`loadReactionsForItems`) while trimming the one
  `cardHTML` genuinely forced this step. `renderRecentGrid` is implicitly
  covered by every signed-in spec; `updateStats` verified with a throwaway
  debug spec. See its entry in `docs/extraction-log.md` ·
  29. `src/pages/explore.js` — ✅ **done** (2026-08-28, commit `3235a09`).
  Largest cluster in the plan (~735 lines). Spun off two support modules
  (necessary side effects): `src/data/exploreCities.js` (static
  `EXPLORE_COUNTRIES`/`ALL_CITIES`/`UK_CITIES`, also used by Settings +
  Pre-order discovery) and `src/services/places.js` (`geocodeBakeryAddress`,
  moved out of `profileModal.js` so both it and explore can share it).
  `exploreCache` + `initExplorePage` exported back to `legacy-app.js` (both
  since severed — `initExplorePage` at residual #1, `exploreCache` at
  residual #2, when it moved on to `appState.js`). 16 stale WINDOW EXPORTS
  entries + 4 now-dead imports (`GOOGLE_MAPS_KEY`, `getCategoryDisplay`,
  `isBookmarked`, `extractCountry`) removed. Two full E2E runs given the
  size. The two ⚠️ deferred decisions this unblocked were both resolved
  2026-08-30 (residuals #1 and #2). See its entry in
  `docs/extraction-log.md` ·
  30. `src/pages/preorders.js` — ✅ **done** (2026-08-28, commit `048fcc3`).
  Clean ~210-line move (7 functions, 4 module-private state vars, no
  `getAction` needed — `bakeryModal.js`'s existing
  `getAction('renderPreorderPage')()` resolves via the registry
  unchanged). Removed 2 dead imports from `legacy-app.js` (`distKm`,
  `ALL_CITIES` — last consumers left with this page). Debug spec, one
  closing E2E run. See its entry in `docs/extraction-log.md` ·
  31. `src/components/preordersSheet.js` — ✅ **done** (2026-08-28, commit
  `913d1d2`). ~135-line move (5 functions, 1 state var). `loadMyPreorders`
  exported back (auth listener + `cancelReservation` call it directly);
  `bakeryModal.js`'s `getAction('loadMyPreorders')()` unchanged — a direct
  import there would form a cycle (`bakeryModal → preordersSheet →
  profileModal → bakeryModal`). `viewOrdersFromMyPreordersSheet` imports
  `openProfileModal`/`switchProfileTab` one-way from `profileModal.js`.
  Debug spec (mobile viewport), one closing E2E run. See its entry in
  `docs/extraction-log.md` ·
  32. `src/pages/settings.js` — ✅ **done** (2026-08-28, commit `69704e0`).
  **The final step of the plan.** `openSettingsPage`/`handleSettingsPhoto`/
  `saveSettingsProfile`/`signOutFromSettings` + `settingsPhotoFile`. The
  cluster never had its raw inline handlers delegated, so
  `handleSettingsPhoto`/`saveSettingsProfile`/`signOutFromSettings` stay in
  `WINDOW EXPORTS` (re-imported), like `switchFeedTab` (step 13);
  `signOutFromSettings` reaches the still-`legacy-app.js` `showPage()` via
  `getAction('showPage')()` (5th reuse of that pattern). Removed 5 dead
  `legacy-app.js` imports (`EXPLORE_COUNTRIES` whole line,
  `renderBusinessSection`, `showAdminTab`, `SUPER_ADMIN_UID`,
  `currentUserRole`). Runtime-verified window-reachability + full flow in a
  debug spec; two closing E2E runs. See its entry in
  `docs/extraction-log.md`.

  **✅ RESOLVED 2026-08-30 (commit `2c7ef8c`) — residual #2, set up in
  Phase 0 stage 3b.** `loadData()`/`loadProfiles()`/`buildBakeryIndex()`
  (+ `exploreCache`) moved into `src/state/appState.js`. `appState.js`
  stays a leaf — its two loaders reach `renderRecentGrid`/`updateStats`
  (`loadData`) and `updateNav`/`renderPeople` (`loadProfiles`) via
  `getAction()` (registered from `home.js` / `people.js` / `nav.js`; none
  has a markup call site). `exploreCache` moved too — `buildBakeryIndex`
  is its only cross-module reader besides `explore.js`, which imports it
  back one-way. The ~5 `getAction('buildBakeryIndex')()` sites
  (`bakeryModal.js`, `adminPanel.js`, `bakeries.js` ×2, `leaderboard.js`)
  + `adminPanel.js`'s `getAction('loadData')()` all became ordinary
  `import … from '../state/appState.js'`; both `registerActions()` calls
  for them removed from `legacy-app.js`. `setAllItems`/`setAllBakeries`
  deleted. `legacy-app.js` now imports nothing from `src/pages/explore.js`
  or `src/utils/geo.js`. `npx madge --circular src/`: clean.

  **✅ Tied follow-up RESOLVED 2026-08-30 (commit `dc45b62`), set up in
  Phase 2 step 9.** `saveEdit()`/`deleteReview()` moved into
  `src/components/editReviewModal.js` — the last blocker (`loadData()`,
  importable from `appState.js` as of residual #2) was gone;
  `renderLeaderboard`/`lbCurrentTab` importable since step 27,
  `closeEditModal` since step 9. **The Phase 2 step 9 split is fully
  closed — `editReviewModal.js` is whole again.** No cycle
  (`editReviewModal.js` is imported only by `legacy-app.js`, the entry
  point). Both register from `editReviewModal.js`;
  `editingItemId`/`editPhotoFile`/`editPhotoDataURL` lost their `export`
  (nothing outside the file reads them now). `legacy-app.js` keeps only
  `import { closeEditModal }` (its modal-overlay/Escape listeners). Closing
  `test:e2e`: 60 passed, 11 skipped, 0 failed. See `docs/extraction-log.md`.

  **✅ RESOLVED 2026-08-30 (commit `52250da`) — residual #1, set up in
  Phase 1 step 5.**
  `showPage()`/`navigateFromMobileMenu()`/`openMyProfileFromMobileMenu()`
  moved into `src/components/nav.js`. `nav.js` imports the 9 page
  renderers/initters + `openProfileModal` one-way and registers all three
  (+ `updateNav`) as delegated actions. The lone cycle edge —
  `showPage()`'s `settings` branch → `openSettingsPage()` while
  `settings.js` imported `updateNav` from `nav.js` — was broken on
  `settings.js`'s side: it now reaches both `updateNav` and `showPage` via
  `getAction()` and no longer imports `nav.js`. `index.html:824`'s raw
  `onclick="closeProfileModal(); showPage('settings')"` (the profile
  modal's ✏️) → `data-onclick="closeProfileModal,showPage" data-args='["settings"]'`;
  every other nav / mobile-menu site was already `data-onclick`. **Raw
  handler sites in `index.html`: 11 → 10.** `showPage` stays in
  `legacy-app.js`'s `WINDOW EXPORTS` (`window.showPage`, used only by
  `tests/people-filters.spec.js` to bypass the signed-out nav-button
  visibility gate); `legacy-app.js` imports it back from `nav.js` for that.
  `npx madge --circular src/`: clean. See `docs/extraction-log.md`.

**Coverage verified, not assumed, for the two originally-"unclear" items**:
grepped `tests/` for every DOM id/function name tied to `#page-preorders`
(`poCountrySelect`/`poCitySelect`/`poBakeryFilter`/`onPoCountryChange`/
`onPoCityChange`/`poDetectNearest`/`renderPreorderPage`/`initPreorderPage`)
and the My Pre-orders sheet (`myPreordersSheet`/`mobilePreordersBtn`/
`openMyPreordersSheet`/`closeMyPreordersSheet`/
`viewOrdersFromMyPreordersSheet`/`loadMyPreorders`/`updatePreorderBadge`) —
zero hits on either. `tests/utils/preorders.js` is misleadingly named: it
drives Bakeries page → bakery profile modal → Manage pre-orders /
reserve-from-profile, never `#page-preorders` itself. Both genuinely
untested, not just unclear — no reordering needed, Phase 7 stands.

### Commit strategy

**One commit per module (32 steps → at least 32 commits), never fewer.**
Each commit lands only after its own single closing full `test:e2e` run is
green (the per-extraction workflow below covers when a fresh *baseline* run
is also needed — usually it isn't). Extractions are never stacked ungated
before running the suite, so a regression always bisects to exactly one
module's change. Phase 0 stage 3
(`appState.js`) is finer-grained than the module-level norm (3 commits, one
per state group) given its elevated risk. Phase boundaries are not commit
boundaries — commits happen at the module/stage level throughout.

### Per-extraction workflow (mirrors the delegation migration's proven process)

Run these per step, in order. **Scale the ceremony to the risk** (see the
note after the list) — but the four unconditional checks and the single
closing full-suite gate are never dropped.

1. **Baseline — only if stale.** Run a fresh full `npm run test:e2e` at the
   start of a step *only* if the previous step's closing run is no longer
   known-clean — something has touched the repo since (a commit landed, a
   rebase, a dependency bump, a manual edit, an unknown gap). If the last
   step ended green and nothing has changed since, that run *is* this
   step's baseline — don't re-run it.
2. **Re-verify the target list.** Re-grep the module's function/state
   list — line numbers shift as earlier steps land.
3. **Move the code.** Rewrite shared-state reads/writes to import from
   `appState.js` instead of relying on same-file scope. Use `sed` to lift
   exact source ranges for anything sizeable (lesson 6).
4. **Wire in and clean up.** Remove moved functions from `legacy-app.js`
   and any now-stale `WINDOW EXPORTS` entry; register the new module's
   delegated actions from the module itself.
5. **`npm run check:dead-refs`, then `npm run build`.**
6. **Targeted spec first — always.** Run the spec(s) covering the affected
   cluster before the full suite. This is the cheap, fast check that has
   caught real regressions first: step 9's unregistered modal actions (via
   `auth.setup.js`), step 22's dropped `renderOrdersTab` import (via
   `reservations.spec.js`) — both past a clean `check:dead-refs` + build.
   On a failure here, confirm it's real (isolated rerun, or `git stash`
   vs. the pre-change commit) before debugging — don't assume, don't wave
   it off.
7. **Debug spec — only for uncovered clusters.** If `tests/` has zero
   coverage for the cluster (grep to confirm), write a throwaway spec
   driving its real user flows with `pageerror`/console-error listeners,
   run it, and delete it before committing (as for `bakeries.js`,
   step 26). Clusters that already have spec coverage don't get one.
8. **Full `npm run test:e2e` once — the closing gate.** After the targeted
   (and debug, if any) specs pass, run the full suite one time as final
   confirmation, then commit. No second "to be sure" run unless the
   baseline was stale (step 1) or a genuine flake needs a clean rerun to
   gate the commit. Normal skipped-test count is data-dependent,
   historically 10–14.
9. **Commit, then log.** One green full run per step, per commit. Step
   write-up goes in `docs/extraction-log.md`; CLAUDE.md gets only the
   status-line + phase-checklist update.

**Scaling to risk.** A small, already-isolated, single-cluster move
(`bakeries.js` step 26, `leaderboard.js` step 27) runs the list above once
and no more. Reserve the extra weight — a wider targeted-spec net, a
throwaway debug spec even next to existing coverage, a second full run, an
extra pass over every call site — for steps with heavy cross-file coupling,
zero prior coverage, or a regression history. **Anything touching modal
action registration takes the elevated bar regardless of size** — that's
the exact class that shipped broken three times (lesson 1).

**Never skipped, never scaled down:**
- Grep `index.html` for every moved name's delegated markup before
  assuming its registration moved correctly (lessons 1–2).
- Grep every real call site before trimming an import from `legacy-app.js`
  — a staying function can still call a leaving one (lesson 4).
- Never edit source while a full `test:e2e` run is live against the dev
  server — Vite HMR serves the half-edited state mid-suite (lesson 3).
- Triage a full-suite failure against known flake patterns via isolated
  rerun before calling it a regression — and don't call a deterministic
  isolated failure a flake (lesson 8).

### Standing lessons from completed steps

Recurring rules distilled from the per-step history in
[`docs/extraction-log.md`](docs/extraction-log.md) — kept here so they stay
visible. Each points to the step(s) that established it; read that entry
for the full context.

1. **Delegated-action registration is not the same mechanism as a
   `window`/ES export.** A function reached from static
   `data-onclick`/`data-onchange`/`data-oninput` markup in `index.html`
   must be in *its own module's* `registerActions()` call — exporting it
   for `legacy-app.js`'s plain-JS listeners is not enough, and neither is
   registering it from `legacy-app.js` after the code moved out. Shipped
   broken three times this way (`modalNext`/`modalBack` in the delegation
   migration; `openEditModal`, step 9; `closeBakeryEditModal`, step 24 —
   the last one caught by `check:dead-refs`, not a failing spec).
2. **Grep `index.html` for every moved name before touching that name's
   `WINDOW EXPORTS` entry or its `registerActions()` call.** Most
   `WINDOW EXPORTS` entries are stale and should be removed — but a
   function with a genuine raw `onclick=`/`onchange=`/`oninput=` call site
   (the clusters never in delegation scope: FEED TABS, the RATING
   overall-rating slider, nav's "+ Add"/"Rate a Bake!" triggers, SETTINGS,
   the admin-only Manage Bakery modal) *must* keep its entry.
   `switchFeedTab` (step 13) would have silently broken both feed-tab
   buttons if it had been dropped like the stale ones around it.
3. **Don't edit source files while a baseline or gating `npm run test:e2e`
   run is active against the dev server** (step 25). Vite HMR serves the
   mid-edit state (function deleted, import not yet added) to the browser
   mid-suite, producing phantom `ReferenceError` failures that aren't real
   regressions. Finish all edits, then run the suite.
4. **When trimming an import list shared by a moving function and a staying
   one, grep every real call site of each removed name — not just the
   ones inside the code that's moving** (step 22, the `renderOrdersTab`
   regression). A function staying in `legacy-app.js` can still call
   something that's leaving; that shape passes `check:dead-refs` and
   `npm run build` and is caught only by a spec.
5. **Resolve genuinely blocked cross-cluster calls with
   `getAction('name')()`, never a direct import back into
   `legacy-app.js`** (leaf modules never import from it). The function
   staying behind self-registers via `registerActions({ name })`. Used for
   `saveReview` (step 18), `buildBakeryIndex`/`loadMyPreorders`/
   `renderPreorderPage` (step 21), and `loadData` (step 23).
6. **Use `sed` to extract exact source line ranges for large clusters**
   rather than retyping them — a silently-dropped `escJS()` wrapper
   (step 11) made this mandatory for anything sizeable (steps 17, 18).
   Verify line and export counts against the original before writing to
   `src/`.
7. **A clean `check:dead-refs` + `npm run build` is necessary but not
   sufficient** — real regressions pass both (step 9's unregistered modal
   actions, step 22's dropped import). The **targeted spec** is the fast
   catch; a **single closing `npm run test:e2e`** is the proof. Run the
   full suite once per step, not twice (see the per-extraction workflow
   above). Normal skipped-test count is data-dependent, historically
   10–14.
8. **A full-suite failure isn't automatically a regression; an isolated
   failure isn't automatically a flake.** Re-run a failing full-suite test
   in isolation and check it against the known flake patterns (the mutable
   follow-graph flake in `share-and-saved`/`people-filters`, seen
   green-on-rerun in steps 1, 5, 26) before reacting. Conversely, a test
   that fails *deterministically* in isolation is real — confirm against
   the pre-change commit with `git stash` rather than dismissing it
   (step 22).

### Extraction log

Detailed write-ups for every completed step — commit hashes, what moved,
what was deferred and why, and every per-step lesson and bug found — live
in [`docs/extraction-log.md`](docs/extraction-log.md), most recent first.
Add each newly-completed step's entry there; the phase checklist under
**Extraction order** above stays in this file as the index.

## Milestone: handler delegation migration complete (2026-08-24)

Every cluster of raw inline `onclick=`/`onchange=`/`oninput=` handlers that
was ever in scope for this migration is now converted to the delegated
`data-onclick`/`data-onchange`/`data-oninput` system. Verified fresh, not
recalled, on 2026-08-24 after the BAKERY SEARCH cluster (the last one)
landed and after fixing an unrelated Google Places API key config issue
that had been blocking its live-network test:

- `npm run check:dead-refs` — clean (no dead references, no dead statement
  calls, no bare-variable scope leaks).
- `npm run build` — succeeds.
- `npm run test:e2e` (full suite, fresh run) — **59 passed, 12 skipped
  (expected — data-dependent, e.g. no Send candidates / no 2+-bakery
  location / no bakery with opening hours / no flagged reviews in the
  target project), 0 failed.**
- `src/legacy-app.js` — 0 raw handler sites left (every remaining
  `onclick=`/`onchange=`/`oninput=` match is inside a comment, verified
  line-by-line).
- `index.html` — **10 raw handler sites left** (was 11 — the profile
  modal's ✏️ edit-profile button at `:824`,
  `onclick="closeProfileModal(); showPage('settings');"`, was converted to
  `data-onclick` as part of Phase 1 residual #1, 2026-08-30, since
  `showPage` had to leave `legacy-app.js` for `nav.js`). The remaining 10
  are all in clusters that were never in scope for this migration:
  top-level nav's "+ Add"/"Rate a Bake!" triggers (`:73`, `:138`), FEED
  TABS (`:262`–`:263`), RATING's own overall-rating slider (`:420`),
  SETTINGS (`:877`, `:881`, `:936`, confirmed by DOM to be inside
  `#page-settings`), and the admin-only Manage Bakery assignment modal
  (`:988`, `:1009`, confirmed by DOM to be the modal alongside
  `closeManageBakeryModal`).

**Not the same milestone as README.md's "Phase 1."** This migration —
converting inline handlers to the delegated system — is complete, but
README's own "What's NOT done yet" section still lists carving
`src/legacy-app.js` into `src/pages/*.js`/`src/components/*.js` as
unstarted, separate, larger work. This migration was a necessary precursor
to that carving (delegated handlers don't need `window[name]` exports, so
files can split more cleanly), but doing the carving itself hasn't started.
Don't read "handler delegation migration complete" as "Phase 1 modularization
complete" — they're different scopes.

Everything in "Known pre-existing issues" below is exactly that — pre-existing
app-level robustness gaps (a data-loading race, a shared `z-index` on
modals, some manual Firestore cleanup) explicitly unrelated to and out of
scope for this migration, not blockers to calling it done.

## Handler delegation migration

`index.html` and `src/legacy-app.js` still contain raw inline handlers
(`onclick="fn(...)"`, `onchange="fn(...)"`, `oninput="fn(...)"`) left over
from the original single-file app. These are being converted, cluster by
cluster, to the delegated `data-onclick`/`data-onchange`/`data-oninput`
system in `src/events/` (see `src/events/delegate.js` and
`src/events/actions.js` for how it works — `registerActions()` +
`getAction()` instead of `window[name]` lookups).

**Status as of 2026-08-24: migration complete** — every cluster that was
ever in scope, including the last one (**BAKERY SEARCH**), is now fully
delegated. The remaining raw sites are all in `index.html` and all belong
to clusters that were never in scope for this migration (top-level nav's
"+ Add"/"Rate a Bake!" triggers, FEED TABS, RATING's own overall-rating
slider, SETTINGS, and the admin-only Manage Bakery assignment modal).
`src/legacy-app.js` itself is 100% delegated — 0 raw sites left. (The
count dropped from 11 to 10 on 2026-08-30 when the profile modal's ✏️
button, `index.html:824`, was delegated as part of Phase 1 residual #1.)

| | raw (`onclick=`/`onchange=`/`oninput=`) | delegated (`data-on*=`) |
|---|---|---|
| `index.html` | 10 | 113 |
| `src/legacy-app.js` | 0 | 169 |
| **total** | **10** | **282** |

Converted clusters (fully delegated, 0 raw handlers left): **FOLLOWS**,
**FILTER HELPERS**, Pre-order discovery page + My Pre-orders burger-menu
sheet, **Manage Offerings incl. Pre-orders/Reservations**, **DATA**,
**EDIT REVIEW**, **SHARE REVIEW WITH A FOLLOWED USER**, **IMAGE
COMPRESSION**, **ADMIN PANEL RENDERERS**, **REACTIONS**, **SHOP**,
**Bakery-profile-modal internals**, **BUSINESS — BAKERY PAGE MANAGEMENT**,
**ACTIVITY CALENDAR**, **DINING MAP**, **QR SCANNER (baker side)**, **ADD
ITEM MODAL**, **MODAL STEPS**, **ITEM MATCHING**, **ADMIN PANEL**, **SHOP
MANAGEMENT (business users)**, **BAKERY SEARCH**, and everything else
converted in earlier sessions per the git log. Notes on the trickier ones,
most recent first:

- **BAKERY SEARCH** (`searchBakery`/`selectBakery`/`selectManualBakery`/
  `clearBakery`, `:2494`–`:2722`, the "Rate a Bake!" modal's step 1 —
  `renderKnownMatches`/`fetchBakeryPlaces` also live in this range but never
  had attribute call sites of their own). The last remaining cluster,
  deferred until a real Google Places API key started working from this
  environment (see below). `searchBakery` switched from taking the search
  query as a string to taking the `#bakerySearch` input element itself
  (delegate.js's trailing-live-value convention, same as
  `filterShareCandidates`/`searchExistingItems`) — its one internal
  (non-attribute) caller, `selectBakery` (via `searchExistingItems`), was
  already passing the element per the ITEM MATCHING note below.
  `searchBakery`/`selectBakery`/`clearBakery` come out of `WINDOW EXPORTS`
  entirely. `showKnownBakeries` stays exported — `index.html`'s
  `#bakerySearch onfocus="if(!this.value) showKnownBakeries()"` is
  delegate.js's one deliberately-unconverted `onfocus` site (a single call
  site isn't worth wiring up), so this is a real remaining raw call site,
  not staleness. `selectManualBakery` also stays exported, for a different
  reason: it has no raw call site left either, but `tests/utils/reviews.js`
  and several specs call `window.selectManualBakery()` directly to bypass
  the Google Places results UI — removing it would break every spec that
  creates a review. New spec: `tests/bakery-search.spec.js` (known-bakery
  list, "Already on Crumbz" substring matching, live Google Places search,
  and the manual-entry fallback). First full suite run: 58 passed, 12
  skipped (expected, data-dependent), the live-Google-Places test failed —
  but on a real external API blocker (the Places API key's referrer
  restriction), not anything wrong with the conversion itself (every other
  assertion in that same spec file, including known-bakery selection and
  manual entry, passed even on that first run). That referrer restriction
  turned out to have a mundane cause: the allowlist edit in Cloud Console
  had never actually been saved (page-level "Save" button, separate from
  adding items to the list, wasn't clicked) — once actually saved and
  verified via a fresh page reload, a live `curl` against
  `places.googleapis.com` with `Referer: http://localhost:5173/` returned
  real results immediately, and a re-run of
  `npx playwright test tests/bakery-search.spec.js` came back **6/6
  passed**, including the live Google Places test. Worth remembering if a
  similar "I added the config but it's still failing" situation comes up
  elsewhere — check whether the edit actually persisted (reload and
  re-open) before assuming it's a propagation delay.
- **ADD ITEM MODAL / MODAL STEPS / ITEM MATCHING / ADMIN PANEL / SHOP
  MANAGEMENT (business users)** — the last five small clusters, converted
  together in one pass:
  - **MODAL STEPS** (`goToStep`/`modalNext`/`modalBack`, `:2726`).
    `goToStep` has no attribute call site anywhere (only called internally
    by the other two plus `resetAddModal`) so it needed no registration;
    `modalNext`/`modalBack` do, from the modal's static Back/Next footer
    buttons in `index.html`. **Caught a real mistake of this session's own
    making, not a pre-existing bug**: after converting those two buttons,
    `check:dead-refs` passed clean and `npm run build` succeeded, but
    `modalNext`/`modalBack` had only been removed from `WINDOW EXPORTS` —
    never actually passed to `registerActions()` — so clicking "Next" did
    nothing at all beyond a silent `console.warn`. `check:dead-refs`
    defaults to scanning `src/legacy-app.js` only (per this doc's own note
    below); since the dead `data-onclick` references were in `index.html`,
    the checker had no visibility into them. Only caught once
    `tests/add-review-flow.spec.js` actually clicked the button against
    the real running app — a concrete reminder that a clean
    `check:dead-refs` + build is necessary but not sufficient, and the
    full E2E run (workflow step 4) is what actually proves a conversion
    works, not just that it's statically well-formed. Fixed by adding the
    missing `registerActions({ modalNext, modalBack })` call. Worth
    double-checking any future cluster whose *only* new call sites are in
    `index.html` rather than `src/legacy-app.js`.
  - **ITEM MATCHING** (`selectItemMatch`/`createNewItem`/`clearItemMatch`/
    `searchExistingItems`, `:2835`, plus one call site — `showBakeryItemHints`
    — co-located in the MODAL STEPS section by file position rather than
    topic, same split seen in earlier clusters). `searchExistingItems`
    changed from taking the search query as a string to taking the
    `#itemName` input element itself (delegate.js's trailing-live-value
    convention, same as `filterShareCandidates`) — its two *internal*
    (non-attribute) call sites, in `goToStep` and `selectBakery`
    (BAKERY SEARCH, converted in a later session — see its own note above),
    were updated to pass the element instead of a string read out of
    `.value` beforehand. `showBakeryItemHints`
    turned out to be stale in `WINDOW EXPORTS` too (zero attribute call
    sites, purely an internal helper) — cleaned up while already here,
    same as `openProfileModal`/`openAddModalForBakery` in earlier sessions.
  - **ADD ITEM MODAL** (`:2243`). Only 2 sites of its own:
    `resetAddModal`'s dynamically-rebuilt photo-upload `<input>`
    (`handlePhotoChange`, already partly delegated from an earlier
    IMAGE COMPRESSION session via `removePhoto`'s identical rebuild — this
    resolved its other two raw call sites, `resetAddModal` here and the
    initial static markup in `index.html`, so it comes out of `WINDOW
    EXPORTS` entirely now) and `buildTastingDims`'s per-dimension rating
    sliders. The latter's inline `oninput=` handler
    (`document.getElementById(...).textContent = ...`) was functionally
    identical to EDIT REVIEW's existing `updateEditDimDisplay` action, so
    rather than adding a near-duplicate, that function was renamed to the
    more general `updateDimDisplay` and reused here too (3 call sites
    total now: the edit form's per-dimension and overall sliders, plus the
    add form's per-dimension ones).
  - **ADMIN PANEL** (`dismissFlag`/`removeReviewAndFlag`/`showAdminTab`,
    `:3373`+`:3420`). `dismissFlag`/`removeReviewAndFlag` are the Flags
    tab's two per-row buttons; `showAdminTab` itself (the
    Users/Bakeries/Flags/Features tab switcher) had 4 raw call sites, all
    in `index.html`, not counted in this cluster's original tally (scoped
    to `src/legacy-app.js` only) but clearly the same feature surface —
    same "file-position vs. topic" reasoning used for SHOP's filter
    `<select>`s and BUSINESS's Edit-page button in earlier sessions.
    **Not automatically clicked**: `dismissFlag`/`removeReviewAndFlag`
    delete real flag/review docs from the target Firebase project — same
    treatment as `promoteUser` etc. in `tests/admin-panel.spec.js`.
  - **SHOP MANAGEMENT (business users)** (`renderManageShop`, `:5471`,
    plus the ADD/EDIT PRODUCT modal it opens into —
    `openProductModal`/`handleProductPhoto`/`saveProduct`/`deleteProduct`,
    converted together since the modal is only ever reached from the shop
    manager). `openProductModal`'s two calls dropped the old `escJS(...)`
    wrapping — no longer building a JS string literal, so unnecessary now
    that `dataArgs()` does its own escaping, same as `openBakeryProfile`
    call sites elsewhere. **Not automatically clicked**: `saveProduct`/
    `deleteProduct` write to/delete from a real bakery's public shop —
    same treatment as `saveBakeryPage`. Covered by
    `tests/shop-management.spec.js`.

- **QR SCANNER (baker side)** (`openQRScanner`/`closeQRScanner`/
  `confirmCollected`, `:8291`). Found and fixed a real, pre-existing bug
  while converting: the collected-confirm overlay's Cancel button used
  `this.closest('div[style]')` to find its own overlay to remove — but a
  sibling inner wrapper `<div>` also carries an inline `style` attribute,
  so `closest()` matched *that* one instead, leaving the actual overlay
  stuck on screen (a real, silent, user-facing bug, not something this
  conversion introduced). `confirmCollected` had the identical bug
  internally. Fixed both by giving the overlay a dedicated
  `.qr-confirm-overlay` class and a new `closeQrConfirmOverlay(el)` action
  scoped to it. `openQRScanner`/`closeQRScanner`/`confirmCollected` come out
  of `WINDOW EXPORTS` entirely. Camera/jsQR decoding itself isn't driveable
  in this environment — `tests/qr-scanner-baker.spec.js` exercises the
  overlay open/Cancel for real, then bypasses the scan step by calling
  `window.processScannedReservation(id, bakeryName)` directly (the same
  function `scanFrame()` calls on a successful decode) to exercise the
  rest of the cluster.
- **DINING MAP** (`switchDmTab`, profile modal's My Map tab stat toggle,
  `:5872`). `switchDmTab(btn, tab)` reordered to `switchDmTab(tab, btn)`
  for the trailing-clicked-element convention; comes out of `WINDOW
  EXPORTS` entirely. Noticed, not touched: the initial static markup's
  "active" tab uses `font-weight:600` (via a CSS class plus inline style)
  while `switchDmTab()` itself sets `700` via pure inline-style
  manipulation on click — a pre-existing inconsistency between the
  hand-written initial HTML and the function's own behavior, harmless but
  worth a skim if that tab's styling changes.
- **ACTIVITY CALENDAR** (`calNav`/`onCalDayClick`, profile modal's Activity
  tab, `:5810`). Both come out of `WINDOW EXPORTS` entirely. Found and
  fixed a real, pre-existing bug directly in `onCalDayClick`: it opened a
  bakery profile (`openBakeryProfile`) from *within* an already-open
  `#profileModal` without closing it first — unlike every other
  profile-modal-relative "jump to a bakery" action elsewhere in the app
  (Followers/Following rows, a profile's location chips), which all close
  the profile modal first. Since every `.modal-overlay` shares the exact
  same `z-index: 2000` (`src/styles/main.css`) and `#profileModal` sits
  later than `#bakeryModal` in `index.html`'s DOM order, leaving it open
  meant it visually/interactively sat on top of the bakery modal just
  opened underneath it — blocking that modal's own close button (found via
  `tests/activity-calendar.spec.js`'s first test timing out on exactly that
  click). Fixed by adding `closeProfileModal()` before both
  `openBakeryProfile()` call sites in `onCalDayClick` (the single-review
  direct-open path and the multi-review bottom-sheet's row click), matching
  the pattern used everywhere else. The underlying z-index tie itself is
  unchanged — see "Known pre-existing issues" below.
- **BUSINESS — BAKERY PAGE MANAGEMENT** (`openBakeryEditModal`/
  `handleBakeryEditPhoto`/`saveBakeryPage`, reached from Settings' Business
  section, `:3230`). Converting the Edit page button resolved
  `openBakeryEditModal`'s last raw call site; converting both photo-input
  `onchange`s and the modal's own Save button resolved
  `handleBakeryEditPhoto`/`saveBakeryPage`'s only call sites — all three
  come out of `WINDOW EXPORTS` entirely. Along the way, cleaned up a stale
  multi-line `WINDOW EXPORTS` comment (from the ADMIN PANEL RENDERERS
  session) that still described `openProfileModal`/`openAddModalForBakery`
  as having other raw call sites they didn't. **Not automatically
  clicked**: `saveBakeryPage` writes real content (blurb/website/instagram/
  cover photo) to a real bakery's public page in the target project, even
  though the form starts pre-filled with that bakery's own current values —
  `tests/bakery-profile-management.spec.js` asserts its `data-onclick`
  wiring instead, same approach as `handleBuy`/`promoteUser` elsewhere.
  Found (not fixed, out of scope): `renderBusinessSection()` reads the
  module-level `allBakeries` with no `buildBakeryIndex()` call of its own —
  see "Known pre-existing issues" below.
- **Bakery-profile-modal internals** (`toggleBakeryHours`, `:1579`).
  Converting its one call site was the easy part; the other two functions
  originally flagged in this cluster, `editBakeryBlurb`/`saveBakeryBlurb`
  (an inline blurb-edit UI), turned out to be genuinely dead code — zero
  call sites anywhere, and `editBakeryBlurb`'s own target
  (`getElementById('bakeryBlurbSection')`) doesn't exist in the real
  template (only a similarly-named CSS *class* on the actual read-only
  blurb display) — it would have thrown if anything had called it. Blurb
  editing is already fully handled by the real "✏️ Edit page" button
  (`openBakeryEditModal`, part of the next cluster below). Deleted both
  rather than converting. `tests/bakery-profile-management.spec.js`'s
  opening-hours test is skipped in the current target project — no bakery
  there shows hours (the documented Google Places 403 issue below, not a
  bug in this cluster).
- **SHOP** (`renderShopPage`/`productCardHTML` etc., `:5316`). Same
  card-plus-nested-elements shape as DATA/ADMIN PANEL's bakery rows — the
  product card, its nested bakery link, and its nested Buy button all
  convert together, `openBakeryProfile`'s call explicitly passing `''` for
  `catFilter` (same latent-trailing-arg guard as DATA/ADMIN PANEL). Also
  converted the 3 filter `<select>`s in `index.html` (bakery/type/sort) —
  not counted in the original "SHOP — 4" tally, since that was scoped to
  `src/legacy-app.js` only, but genuinely this cluster's own UI, just
  defined statically. `openProductDetail`/`handleBuy`/`applyShopFilters`
  all come out of `WINDOW EXPORTS` entirely (no other call sites).
  **Not automatically clicked**: `handleBuy` does a real
  `window.open()`/`mailto:` navigation depending on the product's own
  data — `tests/shop.spec.js` asserts its wiring instead, same approach as
  the Send button in `tests/share-and-saved.spec.js`. Verified against real
  shop product data in the target project (not skipped).
- **REACTIONS** (`toggleReaction` etc., `:5048`, nested inside DATA's
  `feedCardHTML`). `toggleReactionPicker`'s param order reordered to
  `(itemId, btn)` for the trailing-clicked-element convention. The picker
  popup's buttons did `toggleReaction(...); this.closest('.reaction-picker').remove();`
  — parameterized action *followed* by cleanup, the reverse of the usual
  shape — so that got a small `toggleReactionFromPicker` wrapper instead.
  One handler wasn't converted at all: the add-button's wrapper `<div>`'s
  own `onclick="event.stopPropagation()"` was fully redundant once its
  sibling buttons are delegated too (already covered by `feedCardHTML`'s
  `noop`-registered guard, DATA cluster, `:708`) — deleted outright,
  dropping the total handler-site count by 1. Covered by
  `tests/reactions.spec.js`.
- **ADMIN PANEL RENDERERS** (`renderAdminUsersHTML`/`renderAdminBakeriesHTML`,
  `:3536`, Settings page's Admin Panel). Clean single-topic section this
  time — no file-position surprise. `promoteUser`/`promptAssignBakery`/
  `removeUserRole` come out of `WINDOW EXPORTS` entirely; converting the
  Bakeries table's "Edit page" button also resolved `openManageBakeryModal`'s
  `WINDOW EXPORTS` entry (its last raw call site). Along the way, noticed
  `openProfileModal`/`openAddModalForBakery` in that same `WINDOW EXPORTS`
  comment block also show zero raw call sites now — pre-existing staleness,
  not caused by this session, not cleaned up (worth a skim). **Not
  automatically tested**: `promoteUser`/`promptAssignBakery`/`removeUserRole`
  grant/revoke real admin or business access for real accounts in the
  target Firebase project (the Users tab lists real users, not `E2E_`-
  prefixed throwaway data) — `tests/admin-panel.spec.js` asserts their
  `data-onclick`/`data-args` wiring instead of clicking them, same approach
  as the Send button in `tests/share-and-saved.spec.js`.
- **IMAGE COMPRESSION**: same file-position-vs-topic split as SHARE
  REVIEW — its own raw count was only 2, the other 3 belonged to the
  category-chip picker (`selectParentCategory`/`clearParentCategory`/
  `selectSubCategory`), co-located by position. `selectSubCategory`'s param
  order got reordered to `(subKey, el)` for the trailing-clicked-element
  convention (mirrors `switchLbTab`'s precedent); its one other,
  non-attribute call site (`prefillItemForReview`) relied on
  `document.querySelector('[onclick*="..."]')` to find a specific sub-chip
  — a real dependency on the raw attribute text that would've silently
  broken, replaced with a dedicated `data-subcat` attribute. Also deleted
  `selectCategory(el, cat)`, a dead "legacy shim" with zero call sites
  anywhere (same treatment as `buildItemRowHTML`/`buildLocationFilterBar`
  in FILTER HELPERS). Covered by `tests/image-compression.spec.js`.
- **SHARE REVIEW WITH A FOLLOWED USER**: own raw count was 2
  (`filterShareCandidates` now takes the search `<input>` directly, the
  live-value convention). The other 4 belonged to `renderSavedTab` (Saved
  profile tab), same file-position-vs-topic split as above — converting
  those resolved `openDetail`/`switchProfileTab`/`toggleBookmark`'s
  `WINDOW EXPORTS` entries entirely. Send button's real click isn't
  exercised in `tests/share-and-saved.spec.js` (writes an uncleaned
  `sharedReviews` doc) — its wiring is asserted directly instead; manually
  verify a real Send if that path changes. Fixed while verifying the
  handler delegation migration milestone above: the "Item detail modal"
  `registerActions` block's own comment (`:8937`) claimed 5 functions still
  had other raw call sites keeping them in `WINDOW EXPORTS` — re-checked and
  none of them do, and none of the 6 functions in that block were actually
  in `WINDOW EXPORTS` to begin with (someone removed them there without
  updating the comment). Comment corrected to say so.
- **EDIT REVIEW**: both rating sliders shared one new
  `updateEditDimDisplay(displayId, el)` action. Covered by
  `tests/edit-review.spec.js` via a new `tests/utils/reviews.js` helper
  (drives the real "Rate a Bake!" flow, self-cleans by deleting what it
  creates) — reused by `share-and-saved.spec.js` too.
- **DATA** (`feedCardHTML`/`cardHTML`, `:609`). First cluster where a card
  and its own nested clickables needed converting together — per
  `delegate.js`'s header comment, `closest()`-based dispatch resolves to
  the innermost match on its own once both are delegated, no
  `event.stopPropagation()` needed (the same pattern `renderSavedTab`
  reused above). `feedCardHTML`'s reaction-bar guard div (protecting clicks
  on REACTIONS' — still raw, out of scope — padding) became a registered
  no-op (`noop()`) instead, since a pure `stopPropagation()` has no action
  to name. Also flagged, not fixed: `openBakeryProfile`'s single-arg
  call-site shorthand (`dataArgs([bakeryName])`, used at `:1040` from an
  earlier session) lets the trailing clicked-element argument land in its
  `catFilter` parameter — a latent bug, worth fixing if that site is
  revisited. Covered by `tests/feed.spec.js`.
- **Manage Offerings incl. Pre-orders/Reservations** needed a follow-up pass
  after being assumed done: the catalogue picker overlay's ✕ close/Remove
  buttons, and a second raw Reserve button in the bakery profile's own
  Pre-order tab. Covered by `tests/manage-offerings.spec.js`.
- **FILTER HELPERS**: the actual filter logic was already fully converted;
  `buildItemRowHTML`/`buildLocationFilterBar` turned out to be dead code and
  got deleted rather than converted.
- **FOLLOWS** turned out to already be fully converted — one `onclick=`
  string that greps as a hit inside its section (`:5183`) is a comment, not
  a live handler.

Remaining clusters: **none.** BAKERY SEARCH was the last one, converted
2026-08-24. `src/legacy-app.js` now has 0 raw handler sites left (run
`npm run check:dead-refs` to re-verify, or a quick
`grep -noE '\son(click|change|input)=' src/legacy-app.js | grep -v data-on`,
excluding comment lines). The 11 raw sites still in `index.html` all belong
to clusters that were never in scope for this migration (see the status
summary at the top of this section).

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

Three distinct bug classes found the hard way during earlier passes, all
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
- **(c) Bare identifiers inside a `registerActions({...})` call itself**
  (shorthand `{ openEditModal }` or a keyed value `{ save: saveHandler }`)
  that aren't defined/imported in that file — evaluating the object literal
  throws a `ReferenceError` before `registerActions()` is ever called,
  halting that whole module's execution. Added after this exact shape shipped
  once (`editReviewModal.js`, Phase 2 step 9) — see the fix note below.

All three are checked statically (regex/line-based heuristics, not a real
parser — cheap and low-false-positive, not a substitute for judgement).

**Blind spot confirmed in practice (MODAL STEPS, delegation migration):**
the default invocation only scanned `src/legacy-app.js` — a `data-onclick`
in `index.html` with no matching `registerActions()` entry passed clean,
since the checker never saw it. `modalNext`/`modalBack` shipped broken
(removed from `WINDOW EXPORTS` but never actually registered) past both
`check:dead-refs` and `npm run build` for exactly this reason, and was only
caught once a real E2E spec clicked the button. **Fixed** as part of the
carving plan's own Phase 0 step 4 — see the "Carving" section above; the
checker now scans all of `src/` + `index.html` with globally-aggregated
registered-action/top-level-variable sets, not just `legacy-app.js` in
isolation.

**Second, different blind spot found in practice (`editReviewModal.js`,
Phase 2 step 9 of the carving plan, 2026-08-24) — fixed 2026-08-24, before
Phase 3 started.** `checkDeadStatementCalls` only recognizes a dead
reference when it's the *entire* line as a standalone `name(args);` call —
it did **not** check bare identifiers used as object-shorthand properties
inside a `registerActions({ a, b, undefinedName })` call, which is exactly
as real a `ReferenceError` risk as the statement-call form. Missing this let
`openEditModal` (removed from `legacy-app.js`, forgotten from
`editReviewModal.js`'s own `registerActions()` call) ship past both
`check:dead-refs` and `npm run build` clean — the `ReferenceError` it threw
during module evaluation silently halted script execution before
`initDelegatedEvents()` ran, meaning **no delegated click handler worked
at all**, not just this one. Only caught because `auth.setup.js`'s real
sign-in click timed out waiting for the auth modal to open — the same
"full E2E suite is what actually proves it, not just a clean checker/build"
lesson as the `modalNext`/`modalBack` case above, demonstrated twice before
this fix.

**Fix**: a third check, `checkDeadRegisterActionsRefs`, added to
`scripts/check-dead-refs.js`. For every `registerActions({...})` call in a
file, it walks each entry — shorthand (`openEditModal`) or keyed
(`save: saveHandler`) — extracts the identifier that must actually resolve
(the shorthand name itself, or the value after the colon), and checks it
against that file's own `knownNames` (the same per-file
function-declaration/arrow-const/import set `checkDeadStatementCalls`
already used) rather than the cross-file `registeredActions` set (which
would be the wrong set to check against here — a dangling reference in
*this* file isn't made valid by some *other* file happening to register a
same-named action; the two checks answer different questions:
`checkDeadDelegatedActions` asks "is this `data-onclick` name registered
somewhere", `checkDeadRegisterActionsRefs` asks "does this specific
`registerActions()` call's own identifier resolve in the file it's
written in"). Verified against a throwaway two-file fixture reproducing
the exact step-9 shape (a dangling shorthand ref in one file, a valid
shorthand + a valid keyed ref in another) before trusting it — flagged
the dangling one at the correct line, didn't false-positive on the valid
file. Re-ran `check:dead-refs` against the real codebase clean (12
targets, all three checks report none found) and `npm run build` clean
afterward — no E2E gate needed for this, same reasoning as Phase 0 step 4
(dev-tool script, zero runtime/bundle impact).

## Known pre-existing issues (out of scope for this migration)

- ✅ **RESOLVED 2026-08-30 (Phase 1 residual #3)** — `loadData()`'s
  unawaited reconcile could clobber recent state, and `allBakeries` needed
  a page visit nobody guaranteed happened (`src/state/appState.js`). Fixed
  as a deliberate post-plan behavior change: (a) `loadData()` now calls
  `buildBakeryIndex()` so `allBakeries` is never stale w.r.t. `allItems`
  (kills the "Settings Business empty" and "Bakeries needs a visit"
  halves), (b) it re-renders the active Bakeries/Leaderboard page if the
  fetch lands after the user has navigated there
  (`refreshActiveDataView()`, mirroring `loadProfiles()`'s existing
  "re-render People if visible"), (c) an opt-in `loadData({ mergeLocal:
  true })` / `loadItemRecords({ mergeLocal: true })` — used **only** by
  `saveReview()`'s reconcile — keeps a just-written row a racing `getDocs()`
  hasn't seen yet, instead of overwriting it away. Every other caller keeps
  the exact prior full-replace behavior (`deleteReview()` /
  `removeReviewAndFlag()` need it to drop a deleted row). Diagnosis:
  `docs/residual-3-diagnosis.md`. Regression coverage:
  `tests/data-reconcile.spec.js` — one deterministic test per manifestation
  below, each confirmed to fail on the pre-fix code. The three
  manifestations, for the record:
  - **Bakeries page.** `loadData()` (populates `allItems`, the only thing
    `renderBakeries()` reads via `buildBakeryIndex()`) runs async and
    unawaited from `onAuthStateChanged` — `#navAvatar` becoming visible
    only means auth resolved, not that this fetch finished.
    `renderBakeries()` itself runs exactly once, synchronously on nav
    click, and nothing re-renders it once `loadData()` completes later —
    so navigating to Bakeries fast enough to beat that fetch shows a
    *permanent* "No bakeries found" empty state, not a slow-then-populated
    one, until the page is reloaded or re-navigated to. Found via
    `tests/utils/preorders.js`'s `openFirstBakeryProfile` hitting this
    reliably enough in automated runs (which click through the UI far
    faster than any human) to need a workaround there (wait for
    `#recentGrid .card` — `loadData()`'s first synchronous side effect —
    before ever clicking into Bakeries).
  - **Just-saved reviews disappearing from the home page.** `saveReview()`
    optimistically `unshift()`s the new review into `allItems` and
    re-renders immediately, *then* fires its own `loadData()` reconcile in
    the background (unawaited, same function as above) to pick up
    server-side aggregates. If that reconcile's fresh `getDocs()` read
    happens to race ahead of Firestore's own write becoming visible to it
    (an eventual-consistency edge case, not guaranteed-impossible even for
    the writer's own client), it overwrites `allItems` with a version
    *missing* the review just saved — same "nothing re-renders once the
    correct data eventually would be there" shape as the Bakeries case,
    just triggered by a write instead of a page-load. Seen once in
    practice, via `tests/utils/reviews.js`'s `addReview()` (used by EDIT
    REVIEW/SHARE REVIEW/REACTIONS specs) — that helper now retries once via
    a page reload if the card doesn't show up, since a reload forces a
    fresh `loadData()` after enough wall-clock time has passed for
    consistency to catch up.
  - **Settings' Business section can show "No bakeries assigned yet" for
    an admin who manages all of them.** Different root cause from the
    other two — not a timing race, a genuinely missing call.
    `renderBusinessSection()` reads the module-level `allBakeries` directly
    (`isAdmin() ? Object.keys(allBakeries) : ...`) with no
    `buildBakeryIndex()` call of its own; that cache is only ever populated
    as a side effect of visiting a page that *does* call it (Bakeries,
    a bakery profile). Going straight to Settings on a fresh session — no
    amount of waiting fixes this one — leaves it empty regardless of how
    much data actually exists. Found via
    `tests/bakery-profile-management.spec.js`, worked around there by
    visiting a bakery profile first.

  (All three suggested directions from this note — `loadData()` re-rendering
  the active page, the reconcile merging rather than overwriting, and
  `buildBakeryIndex()` becoming part of `loadData()` — were taken together
  in the residual #3 fix above.)

  **Related, NOT fixed:** the People page's *rankings* view reads `allItems`
  but `loadProfiles()` only re-renders the *members* view when it lands
  (`renderPeople`, not `renderRankings`), so a fast-nav-to-rankings at
  startup can still show an empty list until re-nav. Smaller blast radius,
  and it's `loadProfiles` not `loadData` — left for a follow-up.
- **Every `.modal-overlay` shares the same `z-index: 2000`**
  (`src/styles/main.css`), so when two modals are open simultaneously,
  which one is interactively on top is decided purely by DOM order in
  `index.html` (later wins), not by which one was opened more recently.
  Found via ACTIVITY CALENDAR: `onCalDayClick` used to open a bakery
  profile from within an already-open `#profileModal` without closing it
  first, and since `#profileModal` sits later than `#bakeryModal` in the
  DOM, it sat on top and blocked the bakery modal's own close button. That
  one call site is now fixed (`onCalDayClick` closes `#profileModal`
  first, matching every other profile→bakery jump in the app), but the
  underlying tie-break-by-DOM-order architecture is unchanged — any future
  code path that opens one modal from within another, open one, without
  closing the first, can hit the same problem depending on those two
  elements' relative position in `index.html`. Worth a real fix eventually
  (e.g. bumping `z-index` on open so the most-recently-opened modal always
  wins, regardless of source order).
- **E2E test data leaking into the live project (`crumb-ddeb6`).** The
  suite runs against real Firebase (no separate project / emulator — yet;
  see below). Two rounds of cleanup + fixes so far:
  - ✅ **2026-08-30 — the review leak, fixed and purged.** A mid-test
    `test.skip()` in `share-and-saved.spec.js`'s "Send button wiring" test
    (the E2E account follows nobody, so it skipped *every* run, after
    `addReview()` had already created a review and before its inline
    delete) leaked **87 `E2E Share Wiring` / `E2E Share` / `E2E Edit
    Sliders` / etc. reviews (+ 87 `itemRecords`)** into the live Recent
    Reviews feed over ~6 days — `cleanup.teardown.js` never swept
    `items`/`itemRecords`. All 87 + 87 purged (2026-08-30); the earlier
    "8 orphaned items" and "Test Croissant" notes here are subsumed by that
    sweep (verified: 0 `E2E `-prefixed items remain, no "Test Croissant").
    **Tier 1 fix (commit `045f50e`)**: `tests/utils/reviews.js`'s
    `createReview` fixture auto-deletes every review on test teardown
    (incl. mid-test skip); the "Send wiring" test now skips *before*
    creating; `cleanup.teardown.js` also sweeps `items`/`itemRecords`;
    `scripts/cleanup-e2e-data.mjs` (`npm run cleanup:e2e`) + a nightly
    GitHub Actions cron are the standalone safety net.
  - ✅ **Tier 2 (2026-08-30) — the suite now runs against the Firebase
    Emulator Suite.** No test writes hit production at all. `npm run
    test:e2e` starts the emulators + a seeded baseline (see the "E2E tests"
    section below); `npm run test:e2e:prod` is the escape hatch for the
    real project. `firestore.rules` / `storage.rules` committed (were
    console-only). Design record: `docs/tier2-emulator-scope.md`.
  - 🔽 **Low-priority backlog: ~469 cancelled `E2E ` reservations in
    prod.** `tests/utils/preorders.js`'s pre-order specs create
    `reservations` docs; `cleanup.teardown.js` can't hard-delete them
    (the Firestore rules only let `KTpBS4yJx2h8LpcryCTfJDFCHlr2` delete a
    reservation, and even that path is currently rejected from the
    client — confirmed), so it marks them `status: 'cancelled'` instead,
    run after run. They're **invisible to users** (cancelled reservations
    don't render anywhere), just collection bloat (469 of 473 total).
    Tier 2 stopped new ones (they land in the emulator now). Purging the
    existing 469 needs the Admin SDK (a service-account key) — deliberately
    deferred as not worth it
    for cosmetic cleanup.

## E2E tests (Playwright)

**Status as of 2026-08-30: runs against the Firebase Emulator Suite — no
production writes.** (Tier 2 of the prod-data-leak fix — see "Known
pre-existing issues" and `docs/tier2-emulator-scope.md`.)

- `npm run test:e2e` (the default): `playwright.config.js` starts the Auth +
  Firestore + Storage emulators (`firebase.json`, ports 9099/8080/9199) and
  a Vite server on **5174** with `VITE_USE_EMULATOR=1`;
  `tests/seed-emulator.mjs` (Playwright `globalSetup`, via `firebase-admin`)
  wipes both emulators and seeds a deterministic baseline (4 users — the E2E
  user forced to `SUPER_ADMIN_UID`; 3 bakeries; 9 reviews with "Bea" as the
  #1-ranked power reviewer; 4 products; a 4-edge follow graph). No `.env` /
  secrets. `src/services/firebase.js` calls `connect*Emulator()` only when
  `VITE_USE_EMULATOR` is set, so `npm run dev` and the production build are
  untouched (the block is dead code Vite strips from `dist/`).
- `npm run test:e2e:prod` (`E2E_EMULATOR=0`): the old path — `npm run dev` on
  5173 against real `crumb-ddeb6`, creds from `.env`. Kept for the rare
  "check against real data" case; Tier 1's cleanup machinery still applies.
- `.github/workflows/e2e.yml` runs the emulator suite on PRs + pushes to
  `main` (free, no secrets).
- The security rules the emulator loads (`firestore.rules`, `storage.rules`)
  are the real production rules — committed 2026-08-30, previously
  console-only.
- **Two tests behave differently under the emulator**, both deliberate:
  `bakery-search.spec.js:90` (live Google Places call) `test.skip`s when
  `E2E_MODE === 'emulator'`; `people-filters.spec.js:190` got a small
  robustness fix (re-query the Followers list after the follow-toggle
  re-render instead of reusing a stale locator) — it used to *skip* against
  prod when the E2E account's follow graph didn't have the right shape, and
  the deterministic seed made it run.
- **Skip count is now stable** (the emulator is reseeded fresh every run):
  expect ~6 skipped — flagged reviews / opening-hours (Google Places) / the
  live-Places test / a couple of genuinely-data-shaped cases the MVP seed
  doesn't cover. 0 failed.

<details><summary>Earlier status (2026-08-24, against the live project) — historical</summary>

**Status as of 2026-08-24: verified green**, dedicated E2E account in place
(separate from the personal super-admin account used earlier), Google
Places API key referrer restriction confirmed working from this
environment. A full `npm run test:e2e` run showed 58 passed, 12 skipped
(data-dependent — no candidates to test Send against, no location with 2+
bakeries, no bakery showing opening hours in the target project, no
flagged reviews/admin users/shop products to list, etc.), 1 failed (the
Places API referrer issue described in the BAKERY SEARCH note above); after
that got fixed in Cloud Console, a re-run of just
`tests/bakery-search.spec.js` came back 6/6 passed, including the
previously-failing live Google Places test. This covers everything
converted since the migration started, including DATA, EDIT REVIEW, SHARE
REVIEW WITH A
FOLLOWED USER, IMAGE COMPRESSION, ADMIN PANEL RENDERERS, REACTIONS, SHOP,
Bakery-profile-modal internals, BUSINESS — BAKERY PAGE MANAGEMENT, ACTIVITY
CALENDAR, DINING MAP, QR SCANNER (baker side), ADD ITEM MODAL, MODAL STEPS,
ITEM MATCHING, ADMIN PANEL, SHOP MANAGEMENT (business users), and BAKERY
SEARCH — the last cluster in the migration.

**Normal skipped-test count: 10–14**, data-dependent and run-to-run (which
throwaway records exist, whether a location has 2+ bakeries, etc.). Treat
anything in that band with 0 failed as a clean run, not a regression —
same figure the per-extraction workflow and standing lesson #7 use.

Getting to green — and staying there as REACTIONS landed and exercised the
suite under slightly different conditions — took three rounds of fixes, all
in `tests/`, not `src/`:

- **The suite couldn't sign in at all, until now.** `tests/auth.setup.js`'s
  `page.context().storageState({ path: STORAGE_STATE })` call doesn't
  capture IndexedDB by default — and Firebase Auth (the modular v9+ SDK
  this app uses) stores its session there, not in cookies/localStorage.
  Every spec after setup loaded a context with an empty session and failed
  "not signed in", even though setup's own sign-in succeeded every time.
  Fixed by adding `indexedDB: true` to that call — **don't remove it**, or
  this regresses silently (setup itself still passes; only every dependent
  spec breaks). Playwright's own docs for this option literally cite
  Firebase Authentication as the motivating case.
- **Six further real, reproducible bugs**, found only once sign-in
  actually worked and specs could run against live data — all in test
  code, not caused by any conversion:
  - `openFirstBakeryProfile` (`tests/utils/preorders.js`) could hit the
    Bakeries page before `loadData()` (unawaited, fired from
    `onAuthStateChanged`) resolved — `renderBakeries()` runs once on nav
    click with nothing to re-trigger it once data arrives late, so this
    showed a *permanent* false-empty state, not a slow one. Now waits for
    `#recentGrid .card` (proof `loadData()` finished) first.
  - `people-filters.spec.js`'s "signed out" test tried to reach the People
    page via its nav button — which is `display:none` until signed in, so
    that path never exists for a signed-out session. Now calls
    `showPage('people')` directly.
  - The same file's "My Map" tab check used `toHaveCount(0)` against a
    spinner that `renderDiningMapTab` hides via `style.display`, not
    removes — that count is never 0. Fixed to check visibility instead.
  - `refreshOpenProfile()` always resets the profile modal to the Reviews
    tab (`openProfileModal` has no "reopen on this tab" parameter) — a
    Followers-list follow-toggle test assumed it stayed put.
  - The rankings location filter can legitimately list a city with zero
    ranking results: `populateRankingLocationFilter` includes a location
    from any item's address with no `userId` check, while `renderRankings`
    only counts items that have one (e.g. a city whose only reviews are
    seed data with no real account attached) — the test now tries each
    listed option instead of assuming the first one has results.
  - A handful of locator-scoping bugs: substring text matches colliding
    with similar labels ("Cake" matching "Cheesecake"), unscoped buttons
    matching same-labeled buttons in other modals, and a Reserve-button
    lookup that broke once enough test offerings had accumulated across a
    full sequential run for more than one to share the visible list.
- **A third round, surfaced by REACTIONS's own run** (a fresh spec file,
  run deeper into a longer sequential suite than any single prior run had
  gone) — two more real bugs, still both test-side:
  - The Followers-list follow-toggle test (fixed above to survive the
    Reviews-tab reset) reused its very first `row` locator — captured
    *before* any of that toggling — for one final click at the very end.
    By then two more `refreshOpenProfile()` re-renders had happened since;
    the fix re-navigates to Followers and re-queries fresh right before
    that click instead of trusting the stale reference.
  - `tests/utils/reviews.js`'s `addReview()` hit the *other* manifestation
    of the `loadData()` reconcile race described above (a just-saved
    review's card failing to appear at all, not just slowly) — it now
    retries once via a page reload if the card doesn't show up initially.

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

</details>

The bullets above still describe `test:e2e:prod` accurately (real project,
`.env`, teardown scoped to the `E2E ` prefix). Under the default emulator
run, `auth.setup.js` signs in the *seeded* account, and
`cleanup.teardown.js` is a near-no-op (the emulator is wiped by the next
run's `globalSetup`).
