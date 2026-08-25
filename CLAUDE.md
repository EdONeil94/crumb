# Crumbz — working notes

See `README.md` for the phase-1 modularization overview (Vite build, file
layout, deploy steps). This file covers three things that change often
enough to need a living doc: the **handler delegation migration** (complete
as of 2026-08-24 — see milestone note below), the **carving of
`src/legacy-app.js` into `src/pages/`/`src/components/`** (in progress, see
its own section below), and the **E2E test workflow** — all done on
`phase-1-modularize`.

## Carving src/legacy-app.js into src/pages/ and src/components/

**Status as of 2026-08-25: Phases 0, 1, 2, and 3 all complete** (steps
1-16 of 32 done — Phase 3's five: `reviewCard.js`, `feed.js`, `follows.js`,
`people.js`, `reservations.js`). Phase 4 (`manageOfferingsModal.js`,
`addReviewModal.js`) not started.
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
caches** (`allItems`, `allBakeries`, `allProfiles`, `allItemRecords` + their
loaders `loadData()`/`buildBakeryIndex()`/`loadProfiles()`/
`loadItemRecords()`/`ensureProfileExists()` — corrected 2026-08-24: an
earlier draft of this line duplicated `loadBakeryProfiles()`/
`loadAllUserRoles()`/`loadUserRole()` here too, which was wrong — none of
those three populate `allItems`/`allBakeries`/`allProfiles`/`allItemRecords`,
they belong to identity/roles only, already moved in 3a), and **social
state** (`myFollowing`/`myFollowers` + `loadFollows()`, `userBookmarks` +
`loadBookmarks()`, `userSavedItems` + `loadSavedItems()`). Centralizing the
loaders alongside the raw state is
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
     moved wholesale like 3a. **This is a deferred follow-up, not a closed
     question — see the ⚠️ callout under Phase 7 step 29
     (`src/pages/explore.js`) below for when to revisit it.** Re-confirm
     3c's own scope the same way
     before assuming — don't default to either pattern.**
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
  `a911b4f`) — split, not clean, unlike step 8; see step 18/29 callouts
  below for the 3 deferred functions ·
  10. `src/components/qrCode.js` — ✅ **done** (2026-08-24, commit
  `b002aa0`) — split; see step 17 callout below for the 2 deferred
  functions ·
  11. `src/pages/shop.js` — ✅ **done** (2026-08-24, commit `163abf4`) —
  **closes out Phase 2** — genuinely clean despite several external
  callers, a true leaf module (first page extraction)
- **Phase 3 — medium, cohesive, good coverage:**
  12. `src/components/reviewCard.js` — ✅ **done** (2026-08-24, commit
  `502e057`) — split, not clean: `openProfileIfSignedIn` deferred, see its
  own extraction-log entry below ·
  13. `src/pages/feed.js` — ✅ **done** (2026-08-24, commit `bcb1366`) —
  moved wholesale, but `switchFeedTab` keeps its `WINDOW EXPORTS` entry
  (a new situation — see its own extraction-log entry below) ·
  14. `src/components/follows.js` — ✅ **done** (2026-08-24, commit
  `df961f0`) — split 5-and-5, see its own extraction-log entry below for
  the two different deferral targets ·
  15. `src/pages/people.js` — ✅ **done** (2026-08-25, commit `4d5633e`) —
  moved wholesale (best-covered page in the app); resolved step 14's
  deferred-follow-up decision — see its own extraction-log entry below ·
  16. `src/components/reservations.js` — ✅ **done** (2026-08-25, commit
  `a07cb2e`) — **closes out Phase 3** — split, not clean:
  `cancelReservation` deferred to Phase 7 step 31, see its own
  extraction-log entry below
- **Phase 4 — large but well-tested (the "does this scale" milestone):**
  17. `src/components/manageOfferingsModal.js` (biggest single cluster,
  ~1,020 lines, 11 real-click tests — deepest coverage in the app)

  **⚠️ Deferred follow-up tied to this step — set up in Phase 2 step 10,
  don't lose track of it.** `confirmCollected()`/`closeQrConfirmOverlay()`
  (`qrCode.js`) stayed in `legacy-app.js` because `confirmCollected()`
  calls `markCollected()`, part of this cluster. Moving them during step
  10 would've meant `qrCode.js` importing back from `legacy-app.js` while
  `legacy-app.js` already needs `generateOrderQRCodes()`/
  `processScannedReservation()` imported back the normal direction — a
  genuine two-file cycle. **Once step 17 lands and `markCollected()` has a
  real importable home, revisit whether `confirmCollected()`/
  `closeQrConfirmOverlay()` can move into `qrCode.js`.** Deliberate,
  separate decision at that point.

  18. `src/components/addReviewModal.js` (kept as **one** module — internal
  state is deeply cross-referential; this is the exact cluster where
  `modalNext`/`modalBack` broke during delegation, splitting further risks
  the same bug class via cross-module import mistakes instead)

  **⚠️ Deferred follow-up tied to this step — set up in Phase 2 step 9,
  don't lose track of it.** `handleEditPhoto()` (`editReviewModal.js`)
  stayed in `legacy-app.js` because it calls `compressImage()`/
  `compressToDataURL()`, part of IMAGE COMPRESSION — moving into
  `addReviewModal.js` here. **Once step 18 lands, revisit whether
  `handleEditPhoto()` can move into `editReviewModal.js`.** Separate from
  `saveEdit()`/`deleteReview()`'s own deferral (tied to step 29 instead —
  see that callout) — `handleEditPhoto()` doesn't need `loadData()` or
  `renderLeaderboard()`, so it may unblock earlier than they do.
- **Phase 5 — composite modals aggregating several historical clusters:**
  19. `src/components/itemDetailModal.js` ·
  20. `src/components/shareReviewModal.js` ·
  21. `src/components/bakeryModal.js` · 22. `src/components/profileModal.js`
- **Phase 6 — admin/business surfaces (spec exists, but destructive actions
  are wiring-only, not click-verified — extra manual QA regardless of order):**
  23. `src/components/adminPanel.js` ·
  24. `src/components/businessBakeryManagement.js` (carries the documented
  `renderBusinessSection()`-missing-`buildBakeryIndex()` bug — natural point
  to surface it, not obligated to fix) ·
  25. `src/components/notifications.js` (thin direct coverage, wide fan-in)
- **Phase 7 — last, zero/confirmed-zero direct test coverage, budget extra
  manual QA, write/extend specs at extraction time rather than leaving the
  gap open:**
  26. `src/pages/bakeries.js` (also carries the documented `loadData()`
  race) · 27. `src/pages/leaderboard.js` · 28. `src/pages/home.js` ·
  29. `src/pages/explore.js` (largest zero-coverage cluster, ~1,075 lines,
  but most self-contained of the zero-coverage group) ·
  30. `src/pages/preorders.js` (confirmed zero coverage via grep — see
  below) · 31. `src/components/preordersSheet.js` (confirmed zero coverage) ·
  32. `src/pages/settings.js` (mostly composition of Phase 6's components
  by this point)

  **⚠️ Deferred follow-up tied to this step (29, `explore.js`) — set up in
  Phase 0 stage 3b, don't lose track of it by the time we're here.**
  `loadData()` and `buildBakeryIndex()` stayed in `legacy-app.js` during 3b
  specifically because `buildBakeryIndex()` reads `exploreCache`, owned by
  Explore's still-unextracted state. **Once step 29 lands and Explore's
  state (including `exploreCache`) has a real importable home, revisit
  whether `loadData()`/`buildBakeryIndex()` (and `loadProfiles()`, deferred
  for a different reason — see 3b's extraction log entry) can now move into
  `appState.js` alongside `allItems`/`allBakeries`, completing what 3b left
  half-done.** This is a deliberate, separate decision to make at that
  point — not an automatic consequence of step 29 landing.

  **⚠️ Second deferred follow-up also tied to this step — set up in Phase 2
  step 9.** `saveEdit()`/`deleteReview()` (`editReviewModal.js`) stayed in
  `legacy-app.js` because both call `loadData()` (itself deferred to this
  same step, per the callout above); `deleteReview()` additionally calls
  `renderLeaderboard()` and reads `lbCurrentTab`, both owned by
  `leaderboard.js` (step 27 — lands before step 29, so already resolved by
  the time this one does). **Once step 29 lands, revisit whether
  `saveEdit()`/`deleteReview()` can move into `editReviewModal.js`,
  alongside the `loadData()`/`buildBakeryIndex()` decision above** — a
  natural point to make both calls together, though still two separate
  decisions.

  **⚠️ Deferred follow-up tied to this step (32, `settings.js`, the last
  page) — set up in Phase 1 step 5, don't lose track of it.**
  `showPage()`/`navigateFromMobileMenu()`/`openMyProfileFromMobileMenu()`
  stayed in `legacy-app.js` during step 5 because `showPage()` alone
  directly calls 12 functions spread across all 9 pages (`leaderboard.js`,
  `feed.js`, `bakeries.js`, `explore.js`, `preorders.js`, `shop.js`,
  `people.js`, `settings.js`) and `openMyProfileFromMobileMenu()` calls
  `openProfileModal()` (`profileModal.js`, step 22). Unlike 3b's
  single-dependency deferral, this one needs *every* page extracted
  before it can move cleanly — step 32 landing is the actual point all
  of `showPage()`'s dependencies finally exist as real imports. **Once
  step 32 lands, revisit whether these 3 functions can move into
  `nav.js`.** Deliberate, separate decision at that point, same as above.

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
Each commit lands only after its own full `test:e2e` run is green —
extractions are never stacked ungated before running the suite, so a
regression always bisects to exactly one module's change. Phase 0 stage 3
(`appState.js`) is finer-grained than the module-level norm (3 commits, one
per state group) given its elevated risk. Phase boundaries are not commit
boundaries — commits happen at the module/stage level throughout.

### Per-extraction workflow (mirrors the delegation migration's proven process)

1. Before moving: re-verify the function/state list for that module — line
   numbers shift as earlier steps land; re-grep at extraction time.
2. Move the code; rewrite shared-state reads/writes to import from
   `appState.js` instead of relying on same-file scope.
3. Wire the new module in; remove moved functions from `legacy-app.js` and
   from `WINDOW EXPORTS` if still listed (worth checking even if the plan
   didn't flag it — e.g. `getCategoryDisplay`/`getTastingDims` turned out to
   be stale `WINDOW EXPORTS` entries, same class as the Item detail modal
   fix from the delegation migration).
4. `npm run check:dead-refs` (once extended per the prerequisite above).
5. `npm run build`.
6. Run the **full** `npm run test:e2e`, not just the spec(s) matching that
   module.
7. Commit (see commit strategy above).
8. Update this section: check off the step, note anything found.

### Extraction log (most recent first)

- **`src/components/reservations.js` — step 16** (2026-08-25, commit
  `a07cb2e`). **Closes out Phase 3.** Split, not clean — flagged before
  writing any code: moved `parseSlotStartTime` and `renderOrdersTab` (the
  Profile modal's own Orders tab: pending/past reservations, the 12-hour
  cancel cutoff display, the tap-to-enlarge QR trigger). `cancelReservation`
  stayed in `legacy-app.js` — it calls `loadMyPreorders()`, part of the
  not-yet-extracted "MY PRE-ORDERS (burger menu)" cluster (future
  `src/components/preordersSheet.js`, Phase 7 step 31 — a *distant* step,
  unlike most of this plan's imminent-step deferrals, e.g. step 14's
  1-step wait). Moving `cancelReservation` here would've meant this file
  importing `loadMyPreorders` back from `legacy-app.js`, while
  `legacy-app.js` already needs `renderOrdersTab` imported the normal
  direction (from `switchProfileTab`, itself staying — the Profile modal,
  future `profileModal.js`, Phase 5 step 22) — a genuine two-file cycle,
  same shape as `qrCode.js`'s `confirmCollected` deferral (Phase 2 step
  10). `legacy-app.js` imports `parseSlotStartTime` back too, since
  `cancelReservation` needs it — an ordinary one-way import, not
  circular, since nothing in `reservations.js` calls back into
  `legacy-app.js`.
  **Scope boundary decided explicitly, not left implicit**: `reserveOffering`/
  `openReserveModal`/`closeReserveModal`/`renderPreorderTab` — the
  "Reserve" flow reached from a bakery profile's own Pre-order tab, also
  reading/writing the `reservations` Firestore collection — were
  deliberately left out of this file. That's bakery-profile-modal
  internals (future `src/components/bakeryModal.js`, Phase 5 step 21), a
  different call path from the Orders-tab flow this file owns, and
  `tests/reservations.spec.js` itself never exercises it directly (only
  indirectly, via `tests/utils/preorders.js`'s own setup helper, to create
  a reservation to then cancel/view) — confirmed by reading the spec
  before deciding, not assumed from the file's name.
  Explicitly grepped `index.html` for raw handler references to all 3
  candidate functions before assuming any `WINDOW EXPORTS` entry was
  stale, per the step 13 (`switchFeedTab`) lesson — none found.
  `renderOrdersTab` had a stale `WINDOW EXPORTS` entry (zero raw call
  sites) — removed; `parseSlotStartTime` was never in that block (no
  external callers besides this cluster's own two functions, one of which
  stayed in `legacy-app.js`, importing it back). `cancelReservation`'s own
  `registerActions()` registration was already correctly separate
  (untouched, since it isn't moving).
  Verified: `check:dead-refs` clean, `npm run build` succeeds (45
  modules), full `test:e2e` 58 passed/13 skipped/0 failed;
  `reservations.spec.js` re-run in isolation afterward came back a clean
  5/5 passed/0 skipped, directly confirming the 12-hour cancel cutoff and
  QR enlarge/close paths across the new module boundary — same
  verification pattern as step 15.
- **`src/pages/people.js` — step 15** (2026-08-25, commit `4d5633e`). Moved
  `peopleViewMode`/`setPeopleView`/`computeUserScore`/`computeCountryRank`/
  `populateRankingLocationFilter`/`renderRankings`/`renderPeople` wholesale
  — every dependency (`currentUser`/`fb`/`allItems`/`allProfiles`,
  `extractCity`/`extractCountry`, `followBtnHTML`, `dataArgs`) was already
  extracted in Phase 0/3, confirmed via a fresh re-grep before moving
  anything (line numbers had shifted since the plan was drafted, as
  expected — see the workflow's own step 1). `computeUserScore` kept
  module-private (not exported) — its only callers, `computeCountryRank`
  and `renderRankings`, both moved into this same file; nothing outside
  ever called it, unlike `computeCountryRank`, which `openProfileModal()`
  (still in `legacy-app.js`, future `profileModal.js`, Phase 5 step 22)
  calls — that's the one normal one-way import back, no cycle, since
  nothing in `people.js` calls back into `legacy-app.js`. `peopleViewMode`
  exported as a plain live `let` binding (same convention as
  `appState.js`'s state vars) since `showPage()` (`legacy-app.js`, Phase 7
  step 32) reads it directly and nothing outside this file ever writes it
  — confirmed via grep, so no setter function was needed.
  Explicitly grepped `index.html` for raw handler references to all 7
  candidate functions before assuming any `WINDOW EXPORTS` entry was
  stale, per the step 13 (`switchFeedTab`) lesson: `setPeopleView`/
  `renderRankings`/`populateRankingLocationFilter` are all reached via
  delegated `data-onclick`/`data-onchange`, not raw handlers — confirmed
  no surprise here, their `registerActions()` registration simply moved
  into `people.js` itself instead of staying in `legacy-app.js`.
  `computeCountryRank`/`computeUserScore` had stale `WINDOW EXPORTS`
  entries (zero raw call sites, confirmed via grep) — removed; the other
  5 functions were already correctly absent from that block (registered
  actions and plain-JS-only calls never went through `window[name]` to
  begin with).
  **Resolves step 14's (`follows.js`) deferred-follow-up decision, made
  deliberately rather than automatically**: `toggleFollow`/
  `refreshFollowButtons`/`followAndRefreshPeople` were flagged there as
  "revisit once `people.js` lands." Now that it has, moving those three
  into `follows.js` would create a genuine two-file cycle between
  `follows.js` and `people.js` — `refreshFollowButtons`/
  `followAndRefreshPeople` call `renderPeople()` directly, while
  `people.js` itself already imports `followBtnHTML` from `follows.js`
  (used in both `renderPeople`'s member cards and
  `buildFollowUserRowHTML`). Decided to leave all three in
  `legacy-app.js`, which keeps importing one-way from both leaf modules —
  the same shape as every other resolved-by-staying-put deferral in this
  plan, just discovered via a direct dependency check this time rather
  than needing a fresh grep sweep to surface it (the cycle was visible
  immediately from `people.js`'s own new `follows.js` import). Documented
  in `people.js`'s own header comment, not just here.
  Verified: `check:dead-refs` clean, `npm run build` succeeds (44
  modules), full `test:e2e` 58 passed/13 skipped/0 failed (the People-page
  cluster's own spec, `people-filters.spec.js`, re-run in isolation
  afterward came back a clean 12/12 passed/0 skipped — the full-suite
  skip count is normal data-dependent run-to-run variance, per this doc's
  own historical range of 10-12 skips across prior runs, not a regression
  introduced here).
- **`src/components/follows.js` — step 14** (2026-08-24, commit `df961f0`).
  Split, not clean — flagged before writing any code: moved the 5
  self-contained functions (`getFollowState`, `followBtnHTML`,
  `getFollowersForUser`, `getFollowingForUser`, `buildFollowUserRowHTML`)
  — every dependency (`currentUser`/`fb`/`allItems`/`myFollowing`/
  `myFollowers`, `dataArgs`) was already extracted in Phase 0.
  The other 5 (`toggleFollow`, `refreshFollowButtons`,
  `followAndRefreshProfile`, `followAndRefreshPeople`, `refreshOpenProfile`)
  stayed in `legacy-app.js`, split across **two different deferral
  targets** — the first time this carving has had a cluster split three
  ways (moved / deferred-to-imminent-step / deferred-to-distant-step)
  rather than the usual two:
  - `toggleFollow`/`refreshFollowButtons`/`followAndRefreshPeople` each
    reach `renderPeople()` — still in `legacy-app.js`, but only because
    it's *literally the next step* (15, `people.js`). Revisit whether
    these three can move into `follows.js` once step 15 lands — an
    explicit decision to make at that point, not an automatic consequence
    (same framing as every other deferral in this plan).
  - `followAndRefreshProfile`/`refreshOpenProfile` reach
    `openProfileModal()` and `profileModalUid`/`profileActiveCatFilter`/
    `profileActiveLocFilter` — `refreshOpenProfile` turned out to have no
    call sites of its own anywhere outside `followAndRefreshProfile`,
    confirmed via grep, so it's really one deferred unit, not two. Both
    wait for step 22 (`profileModal.js`, Phase 5) — much further out.
  Moving any of the 5 would have meant `follows.js` importing back from
  `legacy-app.js` for `renderPeople`/`openProfileModal`, while
  `legacy-app.js` already needs the 5 moved functions imported the normal
  direction — a genuine two-file cycle.
  Explicitly grepped `index.html` for raw handler references to all 10
  candidate functions before assuming any `WINDOW EXPORTS` entry was safe
  to drop — the step 13 lesson (`switchFeedTab`) made this worth checking
  every time now, not just when a function "looks like" a click handler.
  None of the 10 had one; all 5 stale entries removed as usual.
  Verified: `check:dead-refs` clean, `npm run build` succeeds, full
  `test:e2e` 59 passed/12 skipped/0 failed.
- **`src/pages/feed.js` — step 13** (2026-08-24, commit `bcb1366`). Moved
  `feedCurrentTab`/`switchFeedTab`/`renderFeed` wholesale — every
  dependency was already extracted (Phase 0/2), and `renderFeed`'s only
  external caller, `showPage()`, stays in `legacy-app.js` (Phase 7 step
  32) as a normal one-way import back, no cycle.
  **A genuinely new situation, flagged before writing any code**: unlike
  every function moved in steps 1-12, `switchFeedTab` is called from a
  *raw, undelegated* `onclick="switchFeedTab(...)"` on both FEED TABS
  buttons in `index.html` — that cluster was explicitly out of scope for
  the handler-delegation migration (see its status table above). Every
  prior step's `WINDOW EXPORTS` cleanup was pure staleness-removal; this
  one is the opposite — `switchFeedTab` **must** keep its entry there,
  re-imported from `feed.js`, since raw markup can only ever resolve
  `window[name]`, never a delegated `data-onclick`. Dropping it the way
  every previous step's stale entries were dropped would have silently
  broken both buttons. `renderFeed`'s own `WINDOW EXPORTS` entry, by
  contrast, genuinely was stale (no raw call site) — removed as usual.
  **Worth remembering for later steps**: CLAUDE.md's own migration status
  table lists several other clusters still out of scope for delegation —
  RATING's own slider, the nav's "+ Add"/"Rate a Bake!" triggers, FEED
  TABS (now handled here), SETTINGS, and the admin-only Manage Bakery
  assignment modal — any future extraction step touching those needs the
  same check (grep `index.html` for a raw `onclick=`/`onchange=`/
  `oninput=` referencing the function before assuming a clean stale-entry
  removal).
  No existing spec clicks the feed tab buttons themselves (`feed.spec.js`
  only navigates *to* the Feed page and exercises card clicks) — grepped
  `tests/` directly to confirm zero hits for `feedTabAll`/
  `feedTabFollowing`/`switchFeedTab`. That makes this exactly the failure
  mode where a wrong `WINDOW EXPORTS` call would ship past `check:dead-refs`,
  `npm run build`, *and* the full `test:e2e` suite undetected — manually
  verified instead, using the real saved auth session: clicking
  Following then All correctly toggled each button's active class and
  `#feedTitle`'s text, zero console/page errors.
  Verified: `check:dead-refs` clean, `npm run build` succeeds, full
  `test:e2e` 61 passed/10 skipped/0 failed, including `feed.spec.js`.
- **`src/components/reviewCard.js` — step 12** (2026-08-24, commit `502e057`).
  **Opens Phase 3.** Split, not clean — flagged and confirmed *before*
  writing any code this time (the pattern from step 10 onward): moved the
  2 genuinely self-contained functions, `cardHTML` (Home page's
  `renderRecentGrid`, itself still in `legacy-app.js` — Phase 7 step 28)
  and `feedCardHTML` (Feed page's `renderFeed`, still in `legacy-app.js` —
  Phase 3 step 13), plus their shared `noop` no-op action. Every one of
  their dependencies (`getCategoryDisplay`, `allItems`/`allItemRecords`,
  `timeAgo`, `dataArgs`) was already extracted in Phase 0 — no surprises
  there. `openProfileIfSignedIn` — registered alongside `noop` in the
  *same original* `registerActions()` call, and referenced by both
  `cardHTML`'s and `feedCardHTML`'s markup — stayed behind: it calls
  `openProfileModal`, still in `legacy-app.js` (future
  `src/components/profileModal.js`, Phase 5 step 22). Moving it would have
  meant `reviewCard.js` importing back from `legacy-app.js` for
  `openProfileModal`, while `legacy-app.js` already needs `cardHTML`/
  `feedCardHTML` imported the normal one-way direction from
  `reviewCard.js` — a genuine two-file cycle, same shape as `qrCode.js`'s
  `confirmCollected`/`closeQrConfirmOverlay` deferral (step 10). The
  global `registerActions()` registry means `openProfileIfSignedIn`
  staying registered from `legacy-app.js` doesn't break the
  `data-onclick="openProfileIfSignedIn"` references sitting inside the
  now-moved markup. Also corrected, while here: an earlier assumption in
  this session that `cardHTML` was reused across several not-yet-extracted
  pages (Bakeries/Leaderboard/People) turned out to be wrong — a full-file
  grep found exactly one call site each for `cardHTML` and `feedCardHTML`
  (`renderRecentGrid`/`renderFeed` respectively); the plan's naming this a
  shared "review card" component anyway is about avoiding duplicated
  rendering logic once Home/Feed both exist as separate files, not about
  current fan-in. `cardHTML`/`feedCardHTML` both had stale `WINDOW
  EXPORTS` entries — removed, same class of finding as every step so far.
  Ran a targeted Playwright smoke check first (Home page load, checked for
  console/page errors) but it couldn't get past a signed-out session's
  differently-labeled nav — abandoned in favor of going straight to the
  full suite, which is the real gate regardless. Verified: `check:dead-refs`
  clean, `npm run build` succeeds (41 modules), full `test:e2e` 60
  passed/11 skipped/0 failed, including `feed.spec.js` (exercises
  `feedCardHTML` directly).
- **`src/pages/shop.js` — step 11** (2026-08-24, commit `163abf4`).
  **Closes out Phase 2.** First page extraction — genuinely clean and
  moved wholesale despite `allProducts` and 4 of these 7 functions
  (`loadProducts`, `renderShopPage`, `productCardHTML`, and implicitly
  `openProductDetail`/`closeProductDetailModal`/`handleBuy` via markup)
  having several external callers still in `legacy-app.js`, spread across
  3 different not-yet-extracted clusters (`initFirebaseApp`'s auth
  listener, the bakery-profile-modal's shop tab, SHOP MANAGEMENT) — none
  of those callers are themselves called *from* this module, so it's a
  true leaf module with no cycle, just several normal one-way imports
  back into `legacy-app.js`.
  Caught one accidental content change via a line-by-line diff against
  the original before wiring anything up: `escJS()` wrapping around the
  bakery/type filter `<select>` option values had been silently dropped
  while retyping the function — restored before it could matter.
  Found the same stale-registerActions-reference bug pattern a 3rd time
  this phase (`closeProductDetailModal`, in the big bulk "modal-close
  buttons" call) — caught by a grep sweep this time, not a failing test.
  Also initially forgot to register `closeProductDetailModal` in
  `shop.js`'s own `registerActions()` call — the same mistake as step 9's
  `openEditModal` and step 10's `expandQR` — caught this time by the same
  grep sweep, before ever running the checker or a test. The catching
  method has moved earlier each step this phase: test failure (9) →
  `check:dead-refs` (10, partially) → manual grep sweep, pre-checker (11).
  Verified: `check:dead-refs` clean (18 targets), build succeeds (40
  modules), a targeted runtime check (console/pageerror listeners, zero
  errors) before the full suite, then full `test:e2e` 59 passed/12
  skipped/0 failed, including `shop.spec.js`.
- **`src/components/qrCode.js` — step 10** (2026-08-24, commit `b002aa0`).
  Split, per confirmation caught *before* writing any code this time
  (learned from step 9 — spotted the `confirmCollected()`→`markCollected()`
  dependency during dependency analysis, flagged it immediately rather
  than discovering it mid-write). Moved the 7 clean functions
  (`generateOrderQRCodes`, `expandQR`, `closeExpandedQR`, `openQRScanner`,
  `scanFrame`, `closeQRScanner`, `processScannedReservation` — diner QR
  display + baker scanner bundled into one file). `confirmCollected()`/
  `closeQrConfirmOverlay()` stayed behind — moving them would've formed a
  genuine two-file cycle with `legacy-app.js` (which already needs
  `generateOrderQRCodes()`/`processScannedReservation()` imported back).
  `processScannedReservation` keeps its `WINDOW EXPORTS` entry (imported
  back into `legacy-app.js` purely for that) since
  `tests/qr-scanner-baker.spec.js` calls
  `window.processScannedReservation(...)` directly.
  **Found and fixed 3 more of step 9's exact bug class**: 3 different
  `legacy-app.js` `registerActions()` calls still referenced now-moved
  functions (`closeQRScanner`; `expandQR`/`closeExpandedQR`;
  `openQRScanner`) as bare bindings — caught by grep sweep this time, not
  by a failing test. **Also repeated step 9's actual mistake once**:
  forgot to register `expandQR` itself in `qrCode.js`'s own
  `registerActions()` call — but `check:dead-refs` caught this one
  automatically, since a `data-onclick` string with no matching
  registration is exactly what its dead-delegated-actions check covers
  (the bare-identifier-in-object-literal form is the part still not
  covered — see "What `check:dead-refs` actually catches" above).
  Confirms the Phase 0 step 4 global-registry work is paying off in
  practice. Verified with a targeted Playwright script (console + page
  error listeners) that the app loads with zero runtime errors *before*
  running the full suite this time, given how expensive discovering
  another `ReferenceError` only via the 5-minute E2E run was last step.
  Full `test:e2e`: 60 passed/11 skipped/0 failed.
- **`src/components/editReviewModal.js` — step 9** (2026-08-24, commit
  `a911b4f`). Split, not clean, unlike step 8 — flagged and confirmed
  before writing any code: `handleEditPhoto()`/`saveEdit()`/
  `deleteReview()` each depend on not-yet-extracted code across 2
  different future clusters (`compressImage()`/`compressToDataURL()` —
  step 18; `loadData()` — already deferred since 3b; `renderLeaderboard()`/
  `lbCurrentTab` — step 27), so they stayed in `legacy-app.js`. Moved the 5
  clean functions (`openEditModal`, `updateDimDisplay`,
  `updateEditSubCategory`, `closeEditModal`, `clearEditPhoto`). Two
  separate deferred-follow-up callouts added — step 18's for
  `handleEditPhoto()` (its own, earlier-possible unblock), step 29's for
  `saveEdit()`/`deleteReview()` (piggybacking on 3b's existing callout
  there, since both need `loadData()`).
  `editingItemId`/`editPhotoFile`/`editPhotoDataURL` are read/written from
  *both* sides of the split (`handleEditPhoto`, staying, writes the latter
  two; `saveEdit`/`deleteReview`, also staying, read the first) —
  exported as live bindings + setters for the two written from outside,
  same pattern as `appState.js`; `editingItemId` needed no setter since
  only moving-side code ever writes it.
  **Caught and fixed a real bug of this session's own making before it
  shipped**: `openEditModal` was missing from `editReviewModal.js`'s own
  `registerActions()` call (it's reached via a comma-chained
  `data-onclick`, `"closeDetailModal,openEditModal"`, from the item detail
  modal), while `legacy-app.js`'s stale ITEM DETAIL registration still
  referenced the now-undefined local binding — a `ReferenceError` during
  module evaluation that silently halted script execution before
  `initDelegatedEvents()` ran, breaking **every** delegated click handler
  in the app, not just this one. `check:dead-refs` and `npm run build`
  both passed clean regardless — this specific failure mode (a bare
  identifier used as object-shorthand inside `registerActions({...})`) is
  a newly-found, still-open blind spot in the checker, documented above
  under "What `check:dead-refs` actually catches." Only caught because
  `auth.setup.js`'s real sign-in stopped working — full `test:e2e`:
  59 passed/12 skipped/0 failed, after the fix (first attempt failed at
  `auth.setup.js` itself).
- **`src/components/reactions.js` — step 8** (2026-08-24, commit
  `98e1120`). **Opens Phase 2** — genuinely clean, no split needed, first
  step where the plan's own "small, self-contained" characterization held
  exactly as expected. Every dependency (`currentUser`/`fb`/`allItems`,
  `openAuthModal`, `showToast`, `dataArgs`) was already extracted in
  Phase 0/1. `buildReactionBarInner()`/`loadReactionsForItems()` are
  called from `feedCardHTML` (still in `legacy-app.js`, step 12) —
  imported back, ordinary one-way direction. The other 4 functions
  (`toggleReaction`/`toggleReactionPicker`/`toggleReactionFromPicker`/
  `refreshReactionBar`) have no external call sites at all — they register
  their own actions from `reactions.js` and don't need importing back into
  `legacy-app.js`. Removed 3 more stale `WINDOW EXPORTS` entries. Full
  `test:e2e`: 59 passed/12 skipped/0 failed, including `reactions.spec.js`
  directly.
- **`src/app/lifecycle.js` — step 7** (2026-08-24, commit `01419f1`).
  **Closes out Phase 1.** Different shape of move from steps 5/6 — all 5
  blocks (keyboard-aware scrolling, app update check, mobile status bar
  fix, pull to refresh, PWA install) are self-executing IIFEs or top-level
  side effects, not functions called elsewhere, so this is a side-effect-
  only import (`import './app/lifecycle.js'`, no named bindings). The real
  risk here wasn't a missing dependency (there wasn't one — verified each
  block only touches static DOM or sets up listeners/timers with zero
  reliance on other `legacy-app.js` init running first) but **execution
  order**: ES import hoisting means this file now runs considerably
  earlier in the load sequence than its old position (near the very end of
  `legacy-app.js`) would suggest. Confirmed harmless by code inspection
  before moving, not just assumed — there's no dedicated spec for any of
  these 5 behaviors, so the full `test:e2e` run's real signal was "the app
  still boots and nothing else broke," not direct coverage of this
  cluster. `triggerPwaInstall` pulled out of `legacy-app.js`'s shared
  mobile-menu `registerActions()` call, now registers from here instead.
  Removed 1 more stale `WINDOW EXPORTS` entry (`showMobileInstallBtn`).
  Full `test:e2e`: 61 passed/10 skipped/0 failed.
- **`src/components/authModal.js` — step 6** (2026-08-24, commit
  `1e56987`). Fully self-contained move, unlike step 5 — the whole
  8-function AUTH section only ever touched `fb`/`showToast`/
  `lockScroll`/`unlockScroll` (all already extracted) plus internal
  cross-calls, no deferred pieces. `openAuthModal()`/`closeAuthModal()`
  are called as plain JS from many places in `legacy-app.js` (including a
  `keydown` Escape-key listener) — imported back the ordinary one-way
  direction, not circular. `closeAuthModal` was pulled out of a big bulk
  `registerActions()` call mixing 15 unrelated future clusters' close-modal
  functions — only that one entry moved, the other 15 stayed untouched.
  Removed 3 more stale `WINDOW EXPORTS` entries (`openAuthModal`,
  `showAuthError`, `friendlyAuthError`) — one of their justifying comments
  was itself stale (described a "mobile menu sign-in item (compound)" that
  was actually already `data-onclick`-delegated). Full `test:e2e`: 59
  passed/12 skipped/0 failed, including `auth.setup.js`'s real sign-in
  through the newly-extracted module — the most direct possible test of
  this specific change.
- **`src/components/nav.js` — step 5** (2026-08-24, commit `a2e5c61`). First
  real page/component extraction (Phase 0 was infrastructure only). Split
  rather than moved wholesale, per confirmation: moved the 8 self-contained
  functions (`updateNav`, `toggleMobileMenu`, `closeMobileMenu`,
  `toggleUserMenu`, `closeAvatarDropdown`, `signOutFromAvatarMenu`,
  `closeOnClickOutside`, `signOutFromMobileMenu`); `showPage`/
  `navigateFromMobileMenu`/`openMyProfileFromMobileMenu` stayed in
  `legacy-app.js` — `showPage()` alone calls 12 functions across all 9
  not-yet-extracted pages. Deferred follow-up logged at step 32 above, not
  just buried here. `registerActions()` calls split accordingly for the 6
  moved functions with real markup call sites; verified this resolves
  correctly at runtime (not just the static checker) since
  `src/events/actions.js`'s registry is a single module-level singleton
  shared by every importer regardless of which file calls
  `registerActions()`. Removed 3 more stale `WINDOW EXPORTS` entries
  (`updateNav`, `closeMobileMenu`, `closeOnClickOutside`) — `showPage`'s own
  entry correctly stays (real raw call site: `index.html`'s
  `profileEditBtn`). Full `test:e2e`: 59 passed/12 skipped/0 failed (one
  `manage-offerings.spec.js` flake on the first run, confirmed
  non-reproducing via isolated rerun before this clean full rerun).
- **`scripts/check-dead-refs.js` extended — step 4** (2026-08-24, commit
  `d72d04e`). Default targets now walk `index.html` + every `.js` under
  `src/` recursively (12 targets, up from 1), instead of hardcoding
  `src/legacy-app.js`. Two real architectural changes beyond a longer file
  list: `registerActions()` name resolution and top-level-variable
  collection both became **global** (aggregated across every target)
  rather than per-file — necessary now that more than one file can
  register actions or declare shared state; verified both directions work
  with throwaway two-file fixtures before trusting it on the real
  codebase. Also fixed two real gaps surfaced only once the checker
  actually scanned files beyond `legacy-app.js`: (a)
  `collectTopLevelVariables` never matched `export let/const/var` — only
  bare `let/const/var` — which made **every single export in
  `appState.js` invisible to the bare-variable check**, silently
  defeating the exact protection this extension exists to add; `export`
  only affects cross-module importability, not window-visibility, so this
  was a real gap, not a stylistic nit. (b) one false positive in
  `src/events/delegate.js` (`const fn = getAction(name); ... fn(...args,
  el);` — a local var initialized from a call expression, not a stale
  reference) — added a narrow pattern for that idiom. Verified: scans 12
  targets, passes clean. No E2E gate needed — dev-tool script, zero
  runtime/bundle impact, unlike every source-code step before it.
- **`src/state/appState.js` — stage 3c, social state** (2026-08-24, commit
  `2367ba2`). Moved `myFollowing`/`myFollowers`/`loadFollows()`,
  `userBookmarks`/`loadBookmarks()`, `userSavedItems`/`loadSavedItems()`
  wholesale — the cleanest of the three sub-stages. Verified via grep: all
  5 loaders are genuinely self-contained (no UI-render calls, no
  cross-cluster reads besides `currentUser`/`fb`, both already in
  `appState.js` from 3a), and each of the 4 state variables has exactly
  one reassignment site — the loader itself — so **no setter functions
  were needed at all**, unlike 3a/3b. Functions staying in `legacy-app.js`
  that touch this state (`toggleFollow`/`toggleBookmark`/`toggleSaveItem`)
  only ever mutate by property/Set-method (`.add()`/`.delete()`,
  `userBookmarks[k] = ...`), never reassign wholesale — confirmed via the
  same grep sweep. All 3 moved loaders had stale `WINDOW EXPORTS` entries,
  removed. Full `test:e2e`: 60 passed/11 skipped/0 failed. **This
  completes Phase 0 step 3 (`appState.js`) — the highest-risk step in the
  whole plan.** Stopped here per instruction; step 4 (extending
  `check:dead-refs`) not started.
- **`src/state/appState.js` — stage 3b, core data caches** (2026-08-24,
  commit `068b68c`). Moved `allItems`/`allBakeries` as state + setters only
  (`setAllItems`/`setAllBakeries`) — `loadData()` and `buildBakeryIndex()`
  stay in `legacy-app.js`, rewired to call the setters instead of direct
  reassignment. Moved `allItemRecords`/`loadItemRecords()` and
  `ensureProfileExists()` wholesale (genuinely self-contained, no setter
  needed since `loadItemRecords`'s sole reassignment site moves with it).
  `allProfiles` moved as bare state with **no setter at all** — verified
  via grep it's never reassigned anywhere in the codebase, only mutated by
  property (`allProfiles[d.id] = ...`, inside `loadProfiles()`, which also
  stays in `legacy-app.js` unchanged since it calls `updateNav()`/
  `renderPeople()`). Also fixed a duplication error in the plan text itself
  (`CLAUDE.md`) found before starting: an earlier draft had listed
  `loadBakeryProfiles()`/`loadAllUserRoles()`/`loadUserRole()` under "core
  data caches" too, despite none of them populating any of 3b's four
  caches — they belong to identity/roles only, already moved in 3a.
  Corrected before any code moved (see the step-3 bullet above). All 5
  candidate functions (`buildBakeryIndex`, `loadData`, `loadProfiles`,
  `loadItemRecords`, `ensureProfileExists`) had stale `WINDOW EXPORTS`
  entries — removed regardless of whether the function moved or stayed,
  same class of finding as steps 1-2 and 3a. Full `test:e2e`: 60 passed/11
  skipped/0 failed. Stopped here per instruction; 3c not started.
- **`src/state/appState.js` — stage 3a, identity/roles** (2026-08-24, commit
  `81c15a4`). Moved `SUPER_ADMIN_UID`, `currentUser`, `fb`,
  `currentUserRole`, `currentUserBakery`, `allUserRoles`, `bakeryProfiles`,
  `isAdmin()`/`isBusiness()`/`ownsBakery()`, and
  `loadUserRole()`/`loadBakeryProfiles()`/`loadAllUserRoles()`. Resolved a
  real conflict in the plan's own text before starting (see the step-3
  bullet above) — confirmed with the user that 3a's specific function
  enumeration overrides the plan's general "functions don't move yet"
  framing, since this cluster is genuinely self-contained (Firestore reads
  + state assignment, zero DOM/UI logic). `initFirebaseApp()` (stays in
  `legacy-app.js` — app bootstrap, not identity-state logic) was the only
  site outside the moved functions themselves that ever assigned these 6
  variables (verified via grep) — rewired to use new
  `setCurrentUser`/`setFb`/`setCurrentUserRole`/`setCurrentUserBakery`
  setters instead of direct assignment, since ES module imports are
  read-only bindings from the consumer's side. All 6 moved functions had
  stale `WINDOW EXPORTS` entries (verified zero raw markup call sites each)
  — removed, same class of finding as steps 1-2. Full `test:e2e`: 61
  passed/10 skipped/0 failed, including `auth.setup.js`'s real sign-in and
  every admin/business/role-gated spec that depends on
  `isAdmin()`/`isBusiness()`/`ownsBakery()` working through the new module
  boundary — the highest-confidence signal available that this, the
  highest-risk step in the whole plan, didn't silently break auth. Stopped
  here per instruction; 3b/3c not started.
- **`src/utils/{dom,geo,strings}.js`** (2026-08-24, commit `a372e56`).
  `lockScroll`/`unlockScroll`/`showToast`/`timeAgo` → `dom.js`;
  `distKm`/`extractCity`/`extractCountry` → `geo.js`; `escJS` → `strings.js`.
  `lockScroll`/`unlockScroll`'s `scrollY` was a module-level `let` in the
  original file — verified used nowhere else, kept as private state inside
  `dom.js` rather than promoted to `appState.js`. Found `distKmUser`
  (`:811` at the time) doesn't belong in this step: it reads
  `userGeoCoords`, which is `src/pages/bakeries.js`'s own future local
  state (Phase 7), not a true shared utility — left in `legacy-app.js`,
  will import `distKm` from `geo.js` once `bakeries.js` moves. All 8 moved
  functions had stale `WINDOW EXPORTS` entries (verified zero raw markup
  call sites each) — removed, same class of finding as step 1.
- **`src/data/categories.js`** (2026-08-24, commit `2d06491`). Moved
  `CATEGORY_TREE`/`CATEGORIES`/`SUB_TO_PARENT`/`SUB_LABEL`/
  `getCategoryDisplay`/`TASTING_DIMS_UNIVERSAL`/`TASTING_DIM_5TH`/
  `DEFAULT_DIM_5TH`/`getTastingDims`/`TASTING_DIMS` as-is. Found
  `getCategoryDisplay`/`getTastingDims` were stale `WINDOW EXPORTS` entries
  (every call site is a direct JS call, never a raw markup attribute) —
  removed them, same class of finding as the Item detail modal fix. Also
  found `TASTING_DIMS` (the "legacy flat list") is genuinely dead code —
  zero references anywhere outside its own declaration — moved as-is rather
  than deleted, since deleting dead code wasn't this extraction's job;
  worth deleting in a follow-up if still unused then. One E2E flake on the
  first full run (`qr-scanner-baker.spec.js`, a bakery-ownership-permission
  issue on whichever bakery `openFirstBakeryProfile` happened to land on —
  nothing in that spec's path touches category/tasting data), confirmed
  non-reproducing via an isolated rerun (4/4 passed) before a clean full
  rerun (60 passed/11 skipped/0 failed) gated the commit.

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
- `index.html` — 11 raw handler sites left, all in clusters that were never
  in scope for this migration: top-level nav's "+ Add"/"Rate a Bake!"
  triggers (`:73`, `:138`), FEED TABS (`:262`–`:263`), RATING's own
  overall-rating slider (`:420`), SETTINGS (`:877`, `:881`, `:936`,
  confirmed by DOM to be inside `#page-settings`), and the admin-only
  Manage Bakery assignment modal (`:988`, `:1009`, confirmed by DOM to be
  the modal alongside `closeManageBakeryModal`). One of the 11
  (`:824`, the user-profile modal's ✏️ edit-profile button — its handler is
  just `closeProfileModal(); showPage('settings');`) wasn't spelled out
  verbatim in this list before; it's bucketed under SETTINGS here since its
  only job is entering that page, the same way the nav's own "+ Add"
  trigger is bucketed separately from the Add modal it opens — not a gap
  introduced by this migration, just a site worth naming explicitly rather
  than leaving implicit.

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
delegated. 281 of 292 total handler sites (raw + delegated, across both
files, comments excluded) are delegated; the 11 remaining raw sites are all
in `index.html` and all belong to clusters that were never in scope for this
migration (top-level nav's "+ Add"/"Rate a Bake!" triggers, FEED TABS,
RATING's own overall-rating slider, SETTINGS, and the admin-only Manage
Bakery assignment modal). `src/legacy-app.js` itself is now 100% delegated —
0 raw sites left.

| | raw (`onclick=`/`onchange=`/`oninput=`) | delegated (`data-on*=`) |
|---|---|---|
| `index.html` | 11 | 112 |
| `src/legacy-app.js` | 0 | 169 |
| **total** | **11** | **281** |

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

- **`loadData()`'s unawaited reconcile can clobber recent state, and
  `allBakeries` needs a page visit nobody guarantees happened**
  (`src/legacy-app.js`) — a real robustness gap in how this app's shared
  module-level caches (`allItems`, `allBakeries`) get populated, three
  manifestations found so far, all unrelated to handler delegation and not
  touched here:
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

  Worth fixing in the app itself eventually (e.g. `loadData()` re-rendering
  whichever page/state is currently active instead of only what called it,
  the reconcile merging rather than overwriting, or `buildBakeryIndex()`
  becoming part of the same startup sequence as `loadData()` instead of an
  incidental side effect of unrelated pages).
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
- **Manual Firestore cleanup still needed** in the live project (`crumb-ddeb6`)
  — two separate items, neither touched by `tests/cleanup.teardown.js`:
  - **"Test Croissant"** seeded test data. Not `E2E_`/`E2E `-prefixed, so
    outside the teardown script's scope entirely.
  - **8 orphaned `items` docs (+ their `itemRecords`)**, confirmed via a
    one-off signed-in script against the live project on 2026-08-24 (not
    caught by `npm run test:e2e`'s own teardown, since `items`/`itemRecords`
    were never in its scope — see `tests/utils/reviews.js`'s module
    comment). Leftover from *earlier* debugging runs this same session,
    where a test failed before reaching its own `deleteReview()` step, back
    when those tests still had bugs (now fixed — a clean run self-cleans
    these correctly). Harmless (each is a single throwaway review + its
    1:1 itemRecord, no Storage photos attached), just needs a delete pass:
    items `3oukHDHwNbout4AE71Hs`/`T6fme6I6VKEzxoZyUu4D`/`XZpGu1g3xzulRIqup0qb`/
    `XReVQqqln5cfSChcV9Ij`/`uu5N12dS5cMxRfvgFZY9`/`rpf58hEnW3lNc7S4KNtG`/
    `lBxvYkuoWzW4S41Nkkvq`/`U4usowrGynWZF7o48x9c` (names all start with
    `E2E Edit Sliders`/`E2E Share`/`E2E Share Wiring`), each with a matching
    `itemRecords` doc of the same id-relationship (check `item.itemRecordId`
    per doc — don't assume without checking, per `deleteReview()`'s own
    logic, in case a future session's runs left more than one review
    sharing a record).

## E2E tests (Playwright)

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
