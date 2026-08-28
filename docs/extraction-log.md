# Crumbz — extraction log

Detailed write-ups for every completed step of the **carving of
`src/legacy-app.js` into `src/pages/`/`src/components/`** — see `CLAUDE.md`
for the live plan (phase checklist, next step, active deferred items,
standing rules). This file is the per-step history only: commit hashes,
what moved, what was deferred and why, and every lesson found along the
way. Most recent first. Add each new completed step's entry at the top.

- **`src/pages/preorders.js` — step 30** (2026-08-28, commit `048fcc3`).
  The Pre-order *discovery* page (`#page-preorders`) — ~210 lines, 7
  functions (`initPreorderPage`, `onPoCountryChange` [a documented no-op —
  country is locked to the user's home country], `onPoCityChange`,
  `populatePoCityDropdown`, `poDetectNearest`, `renderPreorderPage`,
  `closeBakeryModalIfOpen`) + 4 state vars
  (`poActiveCountry`/`poActiveCity`/`poUserCoords`/`poNearestCity`).
  Re-grepped the section fresh; a clean single cluster, no split.
  **Explicitly distinguished from the two similarly-named clusters** by
  reading, not the header: the "My Pre-orders" burger-menu sheet
  (`loadMyPreorders`/`openMyPreordersSheet`/… — Phase 7 step 31, stays in
  `legacy-app.js`, its own `registerActions({ loadMyPreorders })` at
  legacy-app.js:1412 untouched) and the baker-side "Manage pre-orders"
  modal (`src/components/manageOfferingsModal.js`, step 17). The grep loop
  for every `po*` state var and moved function name across
  `legacy-app.js` outside the cut range confirmed the 4 state vars have
  **no reader anywhere else** (incl. the step-31 sheet range) — all
  module-private, no exports.
  **No `getAction` needed** — a first among the Phase 7 page moves that
  touch the pre-order/bakery area. `renderPreorderPage` is reached from
  `bakeryModal.js`'s `reserveOffering` via
  `getAction('renderPreorderPage')()` (added step 21); that lookup
  resolves through the global registry regardless of which module calls
  `registerActions`, so moving the registration into `preorders.js`
  needed zero change on the `bakeryModal.js` side. Every `open*` action in
  `renderPreorderPage`'s row markup (`openBakeryProfile` via
  `closeBakeryModalIfOpen,openBakeryProfile`; `openReserveModal`;
  `openAuthModal`) is a `data-onclick` string — registry-resolved, no
  imports.
  **Standing lesson 1–2**: grepped `index.html` — the 5 delegated
  discovery actions (`onPoCountryChange`/`onPoCityChange` on the
  country/city `<select>`s, `poDetectNearest` on `#poNearestBtn`,
  `renderPreorderPage` on both `#poBakeryFilter` *and* `#poSortFilter`
  `data-onchange`) all have real static markup → all register from
  `preorders.js` (`closeBakeryModalIfOpen` too, markup-only from the row
  template). `initPreorderPage` + `populatePoCityDropdown` were the only
  two `WINDOW EXPORTS` entries — both stale (no raw handlers, no `tests/`
  refs); `initPreorderPage` is exported the ES way for `showPage()`,
  `populatePoCityDropdown` has no external caller at all → removed both.
  **Standing lesson 4 — grep every call site before trimming an import —
  found 2 more dead `legacy-app.js` imports**: `distKm`'s last consumer
  there was `poDetectNearest` (moving), and `ALL_CITIES`'s was
  `renderPreorderPage`/`poDetectNearest` (moving) — both now dead, removed
  (`distKm` from the `utils/geo.js` import, `ALL_CITIES` from the
  `data/exploreCities.js` import). `extractCity` (still used by
  `buildBakeryIndex`) and `EXPLORE_COUNTRIES` (still used by the Settings
  admin panel's country picker, `openSettingsPage`) stay. 2 breadcrumb
  comments updated.
  **Confirmed-zero prior coverage** (CLAUDE.md already had this
  grep-verified; re-confirmed). Throwaway debug spec
  (`tests/_debug-preorders.spec.js`, deleted before commit) with
  `pageerror`/console-error listeners: nav to Pre-order → `#poCountrySelect`
  is `disabled` and shows "United Kingdom" → `#poCitySelect` populates (65
  UK options) → select a city → `#preorderPageResults` renders
  (empty-state branch for Aberdeen — no active offerings there, which is
  the expected data-dependent outcome and still exercises
  `renderPreorderPage` end to end) → `#poSortFilter` "bakery" then
  "price_asc" both re-render cleanly → `#poNearestBtn` with geolocation
  granted (London) → `poDetectNearest` sets the city to "London". Zero
  console/page errors. The card-rendering branch of `renderPreorderPage`
  is data-dependent (needs a live offering in the picked city) so the
  debug spec couldn't force it, but it's a verbatim move and
  `reservations.spec.js` exercises `reserveOffering` →
  `getAction('renderPreorderPage')()` in the full suite.
  Verified: `check:dead-refs` clean (41 targets, incl. a check confirming
  `preorders.js` passes all five), `npm run build` succeeds (62 modules).
  Full `test:e2e`: **58 passed/13 skipped/0 failed** — one closing run
  (medium risk: clean single cluster, no cross-module coupling beyond the
  already-registry-mediated `getAction`), no flake, skip count in the
  documented 10–14 band. Baseline skipped per the tightened workflow
  (step 29's second closing run still valid — only doc commits since).

- **`src/pages/explore.js` — step 29** (2026-08-28, commit `3235a09`). The
  largest cluster in the plan — ~735 lines: `exploreCache` + 10 `explore*`
  state vars, `setExploreViewMode`, the Leaflet map view + its ~180-line
  temporary iOS-debug diagnostics panel, Nearby-radius mode
  (`toggleExploreNearby`/`runExploreNearbySearch`/`getCrumbBakeriesNearPoint`/
  `fetchGoogleBakeriesNearPoint`), the country/city dropdowns, geo
  detection, `initExplorePage`, and the trending-bakeries logic
  (`getTrendingBakeriesNearCity`/`getCrumbBakeriesNearCity`/
  `selectExploreCity`/`fetchGoogleBakeries`/`renderExploreResults`) — 29
  functions total. Run at the elevated bar per the tightened workflow's
  "scale to risk" (heavy coupling + zero coverage + a regression-prone
  neighbourhood): wide debug spec, full read of every call site, **two**
  full `test:e2e` runs.
  **Two support modules, both forced by the move** (same "necessary side
  effect" shape as `config.js` at step 18, decided by reading not
  assumed):
  - **`src/data/exploreCities.js`** — `EXPLORE_COUNTRIES` (317 lines of
    static city data, 18 countries / 277 cities), `ALL_CITIES`,
    `UK_CITIES`. Grepped every consumer first: Explore (moving), the
    Settings admin panel (`openSettingsPage`, still in `legacy-app.js`
    until step 32), and the Pre-order discovery page (`poDetectNearest`
    etc., still in `legacy-app.js` until step 30). A page module can't own
    data three clusters need, so it went to `src/data/` — exactly the
    `categories.js` (step 1) precedent. `legacy-app.js` imports
    `EXPLORE_COUNTRIES`/`ALL_CITIES` back for the two staying consumers.
  - **`src/services/places.js`** — `geocodeBakeryAddress`, which was
    module-private in `profileModal.js` (its Dining Map tab, since step
    22). `renderExploreMap` needs the same Places text-search helper.
    Options weighed: export it from `profileModal.js` (makes `explore.js`
    depend on that whole heavy module — rejected), duplicate it (rejected,
    step 11 lesson), or a shared home. Read the function first: pure
    network helper, only dep `GOOGLE_MAPS_KEY`, no `profileModal` state —
    so a `src/services/` module (dir already exists for `firebase.js`) is
    clean. `profileModal.js` imports it back and drops its now-unused
    `GOOGLE_MAPS_KEY` import; its header comment updated.
  **What explore.js imports**: `exploreCities` (data), `appState`
  (`allItems`/`currentUser`/`isBookmarked`), `geo` (`distKm`), `dom`
  (`showToast`), `categories` (`getCategoryDisplay`), `config`
  (`GOOGLE_MAPS_KEY`), `services/places` (`geocodeBakeryAddress`),
  `actions` (`registerActions`), `delegate` (`dataArgs`). **No
  `getAction`, no `openBakeryProfile`, no `buildBakeryIndex`** — every one
  of the 7 `openBakeryProfile` references in explore markup is a
  `data-onclick` string, resolved via the global registry (confirmed by
  reading all 7), so unlike steps 21/23/26/27 this leaf needed no
  action-registry workaround at all. The Leaflet map still loads
  `leaflet@1.9.4` from unpkg on demand inside `renderExploreMap`'s own
  loader — moved verbatim.
  **`exploreCache` exported** (`export let`) — `legacy-app.js`'s
  `buildBakeryIndex()` reads it via `Object.values(exploreCache || {})`.
  Confirmed via grep it's only ever `exploreCache[key] = ...`
  (property-mutation), never reassigned, so the live binding works for the
  importer. This is the state whose absence of a home forced the Phase 0
  stage 3b deferral of `loadData()`/`buildBakeryIndex()` — that decision
  is **now unblocked but deliberately NOT acted on here** (CLAUDE.md's
  step-29 ⚠️ callouts updated to "unblocked and pending"). The
  `loadData()` reconcile race is likewise carried forward untouched, per
  the resume instruction.
  **Standing lesson 1–2 (unconditional)**: grepped `index.html` for all 8
  delegated explore names — `onExploreCountryChange`/`onExploreCityChange`/
  `onExploreSortChange` (three `<select>` `data-onchange`),
  `toggleExploreNearby` + `onExploreRadiusChange` (Nearby button + radius
  select), `hideExploreResults` (← All cities), `setExploreViewMode`
  (List/Map toggle, `data-args`) — all real static markup, all now
  register from `explore.js`'s own `registerActions()` call
  (`closeExploreMapPopup` too, markup-only from the map popup template).
  16 `WINDOW EXPORTS` entries were stale (zero raw handlers, zero `tests/`
  refs — checked): `deactivateExploreNearby`, `detectExploreLocation`,
  `exploreMapLog`, `fetchGoogleBakeries`, `fetchGoogleBakeriesNearPoint`,
  `getCrumbBakeriesNearCity`, `getCrumbBakeriesNearPoint`,
  `getTrendingBakeriesNearCity`, `initExplorePage`,
  `populateExploreCityDropdown`, `populateExploreCountryDropdown`,
  `renderExploreCityGrid`, `renderExploreMap`, `renderExploreResults`,
  `runExploreNearbySearch`, `selectExploreCity` — all removed.
  **Standing lesson 4 (unconditional) — grep every call site before
  trimming imports — found 4 now-dead `legacy-app.js` imports**, not one:
  removing the explore code left `GOOGLE_MAPS_KEY` with **zero** consumers
  in `legacy-app.js` (every use was explore's Google fetches / map) — the
  whole `import { GOOGLE_MAPS_KEY } from './config.js'` line went;
  `getCategoryDisplay` (last use was `renderExploreResults`) and
  `isBookmarked` (last use was an explore result row; `renderBakeries`
  had already taken the other at step 26) removed from their import
  lists; `extractCountry` was **already** dead pre-step-29 (stale since an
  earlier step) and removed while there. `distKm`/`extractCity` kept
  (still used by `buildBakeryIndex` and `poDetectNearest`). 4 breadcrumb
  comments updated to match.
  **Confirmed-zero prior coverage** — grepped `tests/` for `explore`
  (case-insensitive) and every explore identifier: zero hits. Throwaway
  debug spec (`tests/_debug-explore.spec.js`, deleted before commit) with
  `pageerror`/console-error listeners drove the full flow: nav to Explore
  → country picker populates (18 options) → pick United Kingdom → city
  picker repopulates (65 options) → pick London → `#exploreResults` shows,
  `#exploreTitle` leaves "Loading…", `#exploreBakeryList` renders 20 rows
  → sort → "trending" and back → List/Map toggle: **the Leaflet map
  actually rendered** (`mapErrored=false`), exercising both the unpkg
  loader and `geocodeBakeryAddress` via `src/services/places.js`
  end-to-end → "← All cities" hides results → Nearby button reveals the
  radius select. Zero console/page errors. (`console.warn` from Google
  Places network hiccups and the `console.error` in `renderExploreMap`'s
  fatal-catch are both tolerated by design — the spec filtered only the
  latter, and it never fired.)
  **Did NOT touch**: the diagnostics panel ("temporary — remove once
  mobile bug is found") moved verbatim — deleting flagged-temporary code
  isn't this extraction's job.
  Verified: `check:dead-refs` clean (40 targets — +3 this step:
  `explore.js`, `exploreCities.js`, `places.js` — including a check
  confirming `explore.js` passes all five), `npm run build` succeeds (61
  modules). `legacy-app.js` dropped from 3066 → ~2009 lines. Full
  `test:e2e` **twice** given the size: **59 passed/12 skipped/0 failed**,
  then **60 passed/11 skipped/0 failed** — both clean, skip variance in
  the documented 10–14 band, no flake. `activity-calendar.spec.js`
  (`profileModal.js`'s Dining Map, the file the `geocodeBakeryAddress`
  move touched) passed in both.

- **`src/pages/home.js` — step 28** (2026-08-28, commit `7b8db6c`). The
  smallest move in the plan: two functions, `updateStats` (the three hero
  stat counters) and `renderRecentGrid` (the recent-bakes grid, `allItems`
  sliced to 9, rendered via `cardHTML`). Both sit in `legacy-app.js`'s
  "DATA" section next to `loadData()`. Re-grepped `index.html` and
  `tests/` for both names first (standing lesson 1–2 / unconditional
  check): **no `data-onclick`/`data-onchange` markup, no `showPage('home')`
  branch, no dedicated spec** — they render purely as a side effect of
  `loadData()` (on auth) and `saveReview()` (after a write), both of which
  stay in `legacy-app.js` (`loadData` deferred to step 29) and now import
  them back one-way. `home.js` imports `cardHTML` one-way from
  `components/reviewCard.js` (step 12); its only other dependency is
  `allItems`. No `getAction()` needed — nothing here touches
  `buildBakeryIndex`/`loadData`.
  **Per the tightened workflow's "scale to risk"**: 16 lines, already
  isolated, verbatim move — ran the checklist once, no elevated bar.
  Written directly rather than `sed`-extracted (lesson 6 is for *sizeable*
  clusters; this isn't one).
  **The unconditional "grep every call site before trimming an import"
  check paid off — three dead imports, not one.** Removing `renderRecentGrid`
  left `cardHTML` with zero callers in `legacy-app.js`, so its import line
  (`import { cardHTML, feedCardHTML } from './components/reviewCard.js'`)
  went entirely — `feedCardHTML` had been dead there since step 13 (its
  only caller, `renderFeed`, moved to `feed.js` then; the import was never
  cleaned up). Same root cause made `buildReactionBarInner`/
  `loadReactionsForItems` (imported from `reactions.js`) dead since step 13
  too — `feedCardHTML` was their only caller — so that import went as well.
  Two stale comments that had asserted "feedCardHTML, still in this file"
  were corrected, and `reviewCard.js`'s own header comment (which still
  said both `renderRecentGrid` *and* `renderFeed` were "still in
  legacy-app.js") was fixed for both. None of this was forced by step 28
  beyond the `cardHTML` line — caught by actually grepping the call sites
  of everything on the import lines being touched, per step 22's lesson.
  2 stale `WINDOW EXPORTS` entries removed (`renderRecentGrid`,
  `updateStats` — no markup, no `tests/` refs). `saveReview`'s deferral
  comment updated: after steps 27–28 its only remaining step-29 blocker is
  `loadData()` itself (`renderLeaderboard`/`lbCurrentTab` from step 27,
  `updateStats`/`renderRecentGrid` from step 28 are all importable now).
  The `// ─── DATA ───`-adjacent home code is replaced with a 4-line
  breadcrumb; the DATA section keeps `loadData` unchanged.
  **Coverage**: `renderRecentGrid` is implicitly but genuinely covered —
  every signed-in spec lands on `#page-home` and `tests/utils/preorders.js`
  asserts `#recentGrid .card` as a load-gate proxy, so a throw there fails
  a large fraction of the suite. `updateStats` (the counters) has no
  assertion anywhere, so a throwaway debug spec covered both explicitly:
  9 cards rendered, `#statItems`/`#statBakeries`/`#statRaters` populate to
  integers (`130`/`83`/`4`), nav away to Bakeries and back to Discover
  leaves the grid intact (no re-render on nav — confirmed no
  `showPage('home')` branch), zero `pageerror`/console errors. Deleted
  before commit.
  Verified: `check:dead-refs` clean (37 targets, `home.js` passes all five
  checks), `npm run build` succeeds (58 modules). Full `test:e2e`: **59
  passed/12 skipped/0 failed** — no flake, skip count mid-range. Baseline
  was skipped per the tightened workflow (step 27's closing run still
  valid — only CLAUDE.md changed since, in commit `5a012ca`).

- **`src/pages/leaderboard.js` — step 27** (2026-08-28, commit `4f01f3`).
  Re-grepped the "LEADERBOARD" section fresh (line numbers had shifted
  since step 26 landed) and confirmed by reading every function's own
  dependencies that this is one clean cluster — matching steps 24/25/26's
  finding, not steps 19-23's "splits" pattern. Moved: `lbCurrentMode`
  (module state), `switchLbMode`, `populateLbLocationFilter`,
  `onLbFilterChange`, `getLbFilters`, `switchLbTab`,
  `renderBakeryLeaderboard`, `closeLbAndOpenBakery`, `renderLeaderboard`.
  **`lbCurrentTab` moved too, from a different place**: it was declared
  up in the file's "STATE" section (line 138), not in "LEADERBOARD" — the
  same "position vs. topic" split this plan keeps finding (cf. step 19's
  `isSavedItem` under "SAVED ITEMS", step 23's ROLES-section functions).
  Confirmed via grep that its only real reassignment site is
  `switchLbTab` (moving), and every read is either inside a moving
  function or `showPage`/`saveReview`/`deleteReview` passing it as an arg
  to `renderLeaderboard()` — so it's genuinely leaderboard state, moved
  with the code that owns it.
  **`buildBakeryIndex()` did not move** — unchanged from steps 21/23/26:
  reads `exploreCache`, owned by the not-yet-extracted Explore page
  (Phase 7 step 29). `renderBakeryLeaderboard` reaches it via
  `getAction('buildBakeryIndex')()` — standing lesson #5, 4th reuse
  (steps 18, 21, 23, 26 before this).
  **`lbCurrentMode`/`lbCurrentTab` exported as plain live `let` bindings,
  no setter** — a fresh grep confirmed neither is ever reassigned outside
  this file (only `switchLbMode`/`switchLbTab`, both moving, write them;
  `showPage` line 214, `saveReview` and `deleteReview` only *read* them).
  Same convention as `people.js`'s `peopleViewMode` (step 15) — and unlike
  step 26's `bakeries.js`, which needed the `setBakeryViewMode` setter
  precisely because `showPage` there *wrote* `bakeryViewMode`. Preserved
  exact prior behavior throughout, deliberately: `switchLbMode`'s
  pre-existing duplicate `document.getElementById('lbModeItems').classList
  .toggle('active', mode === 'items')` line (appears twice, verbatim) and
  `renderLeaderboard`'s unused `const ratingCount = reviewCount` alias
  were both carried across unchanged — not "cleaned up" mid-extraction.
  **Standing lesson #1 + #2 applied**: grepped `index.html` for every
  moved name first. `switchLbMode` (2 mode buttons), `switchLbTab` (8
  category-tab buttons), and `onLbFilterChange` (the location + rating
  filter `<select>`s' `data-onchange`) all have real static delegated
  markup — all three (plus `closeLbAndOpenBakery`, markup-only from
  `renderBakeryLeaderboard`'s own row template) register from
  `leaderboard.js`'s own `registerActions()` call, verified against that
  markup. `renderLeaderboard`/`renderBakeryLeaderboard`/
  `populateLbLocationFilter`/`getLbFilters`/`switchLbTab` all had **stale**
  `WINDOW EXPORTS` entries (zero raw handlers, zero `tests/` refs, checked
  via grep) — all 5 removed.
  **Standing lesson #2 caught a real dead import**: `legacy-app.js`
  imported `openBakeryProfile` from `bakeryModal.js`, but after
  `closeLbAndOpenBakery` (its *only* remaining plain-JS caller in that
  file) moved out, a fresh grep for `openBakeryProfile(` found nothing but
  a comment — every other reference is `data-onclick="…openBakeryProfile"`
  markup, resolved via the registry. Removed `openBakeryProfile` from that
  import (kept `closeBakeryModal`, still used by two real listeners).
  `leaderboard.js` now imports `openBakeryProfile` one-way from
  `bakeryModal.js` for `closeLbAndOpenBakery` — verified `bakeryModal.js`
  imports nothing from here, no cycle.
  **Partial resolution of the step-29 second deferred follow-up** (Phase 2
  step 9): `deleteReview()`/`saveEdit()` (`editReviewModal.js`) stayed in
  `legacy-app.js` partly because `deleteReview` calls `renderLeaderboard()`
  and reads `lbCurrentTab` — both now live in an importable module. That
  half of the blocker is gone; they still call `loadData()` (deferred to
  step 29), so no move happens now — CLAUDE.md's callout updated to note
  it.
  The `// ─── LEADERBOARD ───` section in `legacy-app.js` is replaced with
  an 11-line breadcrumb comment (same convention as FILTER HELPERS / ITEM
  DETAIL); `showPage`'s bakeries-style `renderLeaderboard(lbCurrentTab)`
  call and the `saveReview`/`deleteReview` re-render calls are untouched,
  now resolving via the new import.
  **Confirmed-zero prior coverage** — grepped `tests/` for every
  leaderboard identifier (`lbList`, `lbSubtitle`, `switchLbMode`,
  `switchLbTab`, `renderLeaderboard`, `lbCurrentTab`, `lbLocationFilter`,
  etc.): zero hits anywhere. Verified with a throwaway debug spec
  (`tests/_debug-leaderboard.spec.js`, deleted before commit) with
  `pageerror`/console-error listeners: nav to Top Picks → 20 item rows →
  category tabs (Cake → 3 rows + "Top items — Cake" subtitle, Best value →
  20 + "best value", All → back) → location filter (`All locations` →
  `York`) → rating filter (`4.5+`) → click an item row (opens
  `#detailModal`) → switch to Top Bakeries (`#lbItemTabs` hides, 20 bakery
  rows, subtitle changes) → click a bakery row (opens `#bakeryModal`,
  exercising `closeLbAndOpenBakery` → `openBakeryProfile` →
  `getAction('buildBakeryIndex')()` end-to-end) → back to Top Items. Zero
  console/page errors. (First debug-spec run failed only because the nav
  button is labelled "Top Picks", not "Leaderboard" — fixed the selector,
  not a code issue.)
  Verified: `check:dead-refs` clean (36 targets, including a check
  specifically confirming `leaderboard.js` passes all five checks),
  `npm run build` succeeds (57 modules). Full `test:e2e`: **57 passed/14
  skipped/0 failed**, identical to the pre-change baseline taken at the
  start of this step (no flake this time — the skip count of 14 is
  data-dependent run-to-run variance, matching the baseline exactly).

- **`src/pages/bakeries.js` — step 26** (2026-08-28, commit `465522f`).
  **Opens Phase 7** (the zero/unconfirmed-coverage pages). Re-grepped the
  "BAKERIES" section fresh (line numbers had shifted since the plan was
  drafted) and confirmed by reading every function's own dependencies
  that this is genuinely one clean cluster — matching steps 24/25's
  finding, not steps 19-23's "splits" pattern. Moved: `bakeryViewMode`/
  `userGeoCoords` (module state), `geocodeMissingBakeries`, `setBakeryView`,
  `populateBakeryLocationFilter`, `distKmUser`, `renderBakeries`.
  **`buildBakeryIndex()` did not move** — unchanged from every prior step
  that touched it (`bakeryModal.js` step 21, `adminPanel.js` step 23): it
  reads `exploreCache`, owned by the not-yet-extracted Explore page
  (Phase 7 step 29). It stays in `legacy-app.js`, still registered there
  via the pre-existing `registerActions({ buildBakeryIndex })` call, and
  `setBakeryView`/`renderBakeries` reach it via
  `getAction('buildBakeryIndex')()` — standing lesson #5, third reuse of
  the pattern. The Phase 0 stage 3b deferred follow-up (revisit whether
  `loadData()`/`buildBakeryIndex()` can move into `appState.js` once
  `exploreCache` has a real home) is **unaffected** — that decision still
  belongs to step 29, not this one.
  **`distKm` now imported one-way from `utils/geo.js`** — the Phase 0
  step 2 note predicted exactly this: `distKmUser` reads `userGeoCoords`
  (this page's own local state), so it and its `distKm` dependency were
  deliberately left in `legacy-app.js` then to move here now. `legacy-app.js`
  still imports `distKm` from `geo.js` for its own Explore-page uses
  (confirmed via grep — 8 remaining call sites), so that import line was
  not trimmed.
  **`showPage()`'s bakeries branch** (`legacy-app.js`, Phase 7 step 32)
  was `bakeryViewMode = 'all'; renderBakeries();` — a direct write to
  what is now module-private state. Rather than change behavior, added a
  minimal exported setter `setBakeryViewMode(mode)` and rewrote the branch
  as `setBakeryViewMode('all'); renderBakeries();`. **Exact prior behavior
  preserved, deliberately**: the old inline reset never toggled the
  view-toggle buttons' `.active` classes, and `setBakeryViewMode` doesn't
  either — only `setBakeryView` (reached solely from markup) does. Using
  `setBakeryView('all')` there would have been a (minor, arguably correct)
  behavior change — left for a future dedicated fix, not folded into an
  extraction, matching this plan's "surface bugs, don't fix them while
  moving" stance. `renderBakeries` and `setBakeryViewMode` are the only
  two exports; `setBakeryView` registers via `registerActions()` but is
  never imported by name (minimal-export policy, `bakeryModal.js`
  precedent).
  **Standing lesson #1 + #2 applied**: grepped `index.html` for every
  moved name first. `setBakeryView` (3 view-toggle buttons, `#bakeryViewAll`
  /`#bakeryViewNearest`/`#bakeryViewVisited`) and `renderBakeries` (the
  `#bakeryLocationFilter` `data-onchange`) both have real static
  `data-onclick`/`data-onchange` markup — both correctly included in
  `bakeries.js`'s own `registerActions({ setBakeryView, renderBakeries })`
  call from the first pass, verified against that markup rather than
  assumed. The old `registerActions({ setBakeryView, renderBakeries })` in
  `legacy-app.js` was removed (its comment block rewritten to point here).
  3 stale `WINDOW EXPORTS` entries removed (`distKmUser`,
  `geocodeMissingBakeries`, `populateBakeryLocationFilter`) — zero raw
  handlers in `index.html`, zero `tests/` references, confirmed via grep.
  **Refreshed 5 now-stale "legacy-app.js's still-not-yet-extracted
  `renderBakeries`" comments** in `appState.js` (the `isBookmarked`
  co-location rationale), `bakeryModal.js` (same), and `profileModal.js`
  (×2, the `toggleBookmark` markup-resolution note) — each comment's
  substantive conclusion still holds (`isBookmarked` still has two
  importers; `toggleBookmark` still resolves via the registry from
  `renderBakeries`'s card markup with no import needed), only the file the
  function lives in changed. `nav.js`'s `showPage`-deferral comment
  listing `renderBakeries` among `showPage`'s deps was left as-is — still
  accurate (it *is* a `showPage` dependency, now via a real import).
  **Zero prior test coverage confirmed** — grepped `tests/` for every
  Bakeries-page identifier (`bakeriesGrid`, `bakeryView*`,
  `bakeryLocationFilter`, `setBakeryView`, `renderBakeries`, `distKmUser`,
  etc.): the only hits are `tests/utils/preorders.js`'s
  `openFirstBakeryProfile` helper, which navigates *through* the Bakeries
  page to reach a bakery profile modal but never exercises the view
  toggles or location filter. Verified manually with a throwaway debug
  spec (`tests/_debug-bakeries.spec.js`, deleted before the commit) with
  `pageerror`/console-error listeners attached throughout: nav to Bakeries
  → 77 cards render → location filter (`All locations` → `York` → 9 cards
  → back to 77) → "My visited" toggle (button `.active` flips, grid
  re-renders) → back to All → "📍 Nearest" with geolocation **denied**
  (falls back to All + shows the "Location access denied" toast) → "📍
  Nearest" with geolocation **granted** (London coords — geocodes missing
  bakeries, sorts to 8 with location data) → bookmark button toggles its
  `saved` class and back → click a card opens `#bakeryModal`, exercising
  `openBakeryProfile` → `getAction('buildBakeryIndex')()` end-to-end.
  Zero console/page errors across the whole path.
  Verified: `check:dead-refs` clean (35 targets, including a check
  specifically confirming `bakeries.js` passes all five checks),
  `npm run build` succeeds (56 modules). Full `test:e2e`: the **first**
  run showed 1 failure (`share-and-saved.spec.js:47`, the Share-modal
  following-status test) + 2 extra data-dependent skips — the failing
  test passed cleanly in an isolated re-run (`5 passed/1 skipped`), and a
  second full run came back **59 passed/12 skipped/0 failed**, identical
  to the pre-change baseline. Same flake-confirmation pattern as steps 1
  and 5 (isolated rerun + one clean full rerun gates the commit); the
  failing test touches only `openShareReviewModal`/`renderShareCandidateRows`
  and the mutable follow-graph (which `people-filters.spec.js` modifies
  earlier in the sequential run), nothing this step went near.

- **`src/components/notifications.js` — step 25** (2026-08-26, commit
  `0be56ae`). **Closes out Phase 6.** Re-grepped the "NOTIFICATIONS"
  section fresh and confirmed, by reading every function's own
  dependencies before concluding anything, that this cluster is genuinely
  one clean, self-contained feature — matching step 24's finding, not
  steps 19/20/22/23's "splits" pattern. Moved wholesale: `notifLastSeen`/
  `notifItems` (module-private state), `loadNotifications`,
  `updateBellBadge`, `toggleNotifPanel`, `closeNotifPanel`,
  `renderNotifPanel`, `openNotifItem`, `markAllNotifsRead`.
  Every real (non-markup) call site of `loadNotifications` checked before
  moving, per step 22's own lesson: 4 plain-JS callers, all inside
  `initFirebaseApp()`'s `onAuthStateChanged` handler (one direct call plus
  3 `onSnapshot` real-time-listener callbacks for
  follows/sharedReviews/reactions) — `legacy-app.js` still needs all 4, so
  `loadNotifications` is the only export this file needs, imported back
  one-way (no cycle — nothing here calls back into `legacy-app.js`).
  `updateBellBadge`/`renderNotifPanel` have zero callers outside this file,
  confirmed via grep, despite both having stale `WINDOW EXPORTS` entries —
  removed, along with `loadNotifications`'s own (also stale — its real
  callers are now an ordinary ES import, not `window`-global access).
  `openProfileModal`/`openDetail` (used inside `loadNotifications`'s own
  follow/shared-review notification click closures) import one-way from
  `profileModal.js`/`itemDetailModal.js` respectively — confirmed neither
  file imports anything from here, so no cycle.
  **Applied the new standing checklist item from step 24's own
  `closeBakeryEditModal` bug, this time catching nothing wrong but
  confirming the check is worth doing every time**: grepped `index.html`
  for every moved name before assuming any export/registration was
  correct. `toggleNotifPanel` (`#navBell`) and `closeNotifPanel`
  (`#notifBackdrop`) both have real static `data-onclick` markup in
  `index.html` — both were correctly included in this file's own
  `registerActions()` call from the first pass this time, verified
  explicitly against that markup rather than assumed from their having
  been registered in the original file.
  Two `registerActions()` calls removed entirely from `legacy-app.js`
  (`{ openNotifItem }` and `{ toggleNotifPanel, closeNotifPanel,
  markAllNotifsRead }`, both standalone, not mixed bulk calls) — both now
  register from `notifications.js` itself.
  **A test-environment lesson worth remembering, not a code bug**: the
  fresh `test:e2e` baseline kicked off at the start of this step showed 1
  failure (`ReferenceError: loadNotifications is not defined`, thrown by
  the live Vite dev server) purely because source edits for this same step
  were made *while* that background baseline was still running against the
  same dev server — Vite's HMR picked up the mid-edit state (function
  deleted, import not yet added) and served it to the browser mid-suite.
  Not a real regression — confirmed by finishing the edit, then re-running
  `test:e2e` fresh with no concurrent editing, which came back clean. Don't
  edit source files while a baseline or gating `test:e2e` run is active
  against the dev server.
  Zero prior test coverage for this cluster confirmed (no dedicated spec,
  and grepping `tests/` for every notification-related identifier found
  zero hits anywhere) — matches CLAUDE.md's own Phase 6 checklist
  description ("thin direct coverage, wide fan-in"), though "thin" turned
  out to mean "none," not "some." Verified manually with a throwaway debug
  spec instead: bell open (`toggleNotifPanel`) → panel shows the empty
  state correctly (no notifications for the test account) → close via
  backdrop (`closeNotifPanel`) → reopen and wait out the 1.5s
  `markAllNotifsRead` delay — zero console/page errors throughout. A
  further attempt to write a throwaway `follows` doc directly via
  `window._crumb` to exercise `openNotifItem`'s real dispatch
  (`openProfileModal`) was correctly rejected by Firestore security rules
  (an unprivileged write with a fabricated `followerId`) — expected
  behavior, not a bug, and not worth working around for a debug-only
  check; the open/close/badge-timer path plus a clean `check:dead-refs` +
  build already gave adequate confidence for a verbatim code move.
  Verified: `check:dead-refs` clean (31 targets, including a check
  specifically confirming `notifications.js` itself passes all five
  checks), `npm run build` succeeds (55 modules). Full `test:e2e` (run
  cleanly, after finishing all edits): 58 passed/13 skipped/0 failed,
  within this doc's own documented normal skip-count range.
- **`src/components/businessBakeryManagement.js` — step 24** (2026-08-26,
  commit `a127a52`). Re-grepped the "BUSINESS — BAKERY PAGE MANAGEMENT"
  section fresh and, unlike steps 19/20/22/23's own repeated finding, this
  one's single header actually matched its own code cleanly — confirmed by
  reading every function's own dependencies before concluding that, not
  assumed from the header alone. Moved wholesale: `renderBusinessSection`,
  `editingBakeryName`/`bakeryEditPhotoFile` (module-private state),
  `openBakeryEditModal`, `handleBakeryEditPhoto`, `saveBakeryPage`,
  `closeBakeryEditModal`.
  Every real (non-markup) call site checked before moving, per step 22's
  own lesson: `renderBusinessSection()` is called as plain JS from
  `openSettingsPage()` (stays in `legacy-app.js` — Settings page, Phase 7
  step 32) and `closeBakeryEditModal()` from the modal's own outside-click
  listener and the keydown Escape handler (also stay) — both exported and
  imported back one-way, no cycle (nothing here calls back into
  `legacy-app.js`). Found and removed one more now-genuinely-unused import
  while already touching this exact line: `currentUserBakery` (the raw
  value, not the setter) had zero real uses left in `legacy-app.js` once
  `renderBusinessSection` — its only reader — moved.
  **Explicitly distinguished from adminPanel.js's similarly-named MANAGE
  BAKERY cluster (step 23)**, confirmed by reading rather than assumed from
  the near-identical "Edit page" button labels: this file owns
  `#bakeryEditModal` and the `bakeries` Firestore collection, reached from
  Settings' Business section and (per a fresh grep of `bakeryModal.js`)
  also from the bakery profile modal's own `isOwner`-gated "✏️ Edit page"
  button (line ~316); adminPanel.js's MANAGE BAKERY owns a *different*
  modal (`#manageBakeryModal`) and the `bakeryProfiles` collection, reached
  from the Admin Panel's Bakeries tab and the *same* bakery profile modal's
  *other*, `canManage`-gated "✏️ Edit page" button (line ~337) — two
  genuinely separate features with near-identical names and near-identical
  button labels, a pre-existing naming quirk in the app, not something
  either extraction introduced or was in scope to fix. Noted while already
  reading this: `isOwner` and `canManage` (the two gates behind
  bakeryModal.js's two different "Edit page" buttons) are the literal same
  boolean (`canManage = isOwner`) — both buttons show simultaneously to the
  same owner/admin, a pre-existing UI redundancy, also out of scope.
  Carries forward, unfixed, the pre-existing bug CLAUDE.md's own "Known
  pre-existing issues" section already documents:
  `renderBusinessSection()` never calls `buildBakeryIndex()`, so Settings
  can show "No bakeries assigned yet" for an admin who actually manages
  bakeries, on a fresh session. No `getAction()` workaround needed here
  (unlike adminPanel.js's two blocked calls) — the function simply doesn't
  call `buildBakeryIndex()` at all, so there's no dependency to resolve,
  only to leave alone.
  Two `registerActions()` bulk calls trimmed (the modal-close call, the
  open-modal call) — same pattern as every prior step's bulk-call trims.
  One stale `WINDOW EXPORTS` entry removed (`renderBusinessSection`, zero
  raw call sites confirmed via grep) — `openBakeryEditModal`/
  `handleBakeryEditPhoto`/`saveBakeryPage`/`closeBakeryEditModal` were
  already fully delegated from an earlier session (`#bakeryEditModal`'s own
  static markup in `index.html` uses `data-onclick` throughout, unlike
  adminPanel.js's `#manageBakeryModal`, which still has 2 genuinely raw
  handlers) and were never in that block to begin with.
  **A real bug of this session's own making, caught by `check:dead-refs`
  before build or tests ran, not discovered via a failing E2E click**: the
  first pass exported `closeBakeryEditModal` for `legacy-app.js`'s own
  listeners but never added it to this file's own `registerActions()` call
  — conflating "exported for plain-JS use" with "registered as a delegated
  action," two separate mechanisms. `index.html`'s own static
  `#bakeryEditModal` close (✕) and Cancel buttons both reach it via
  `data-onclick`, so this would have silently no-opped both on a real page
  load, past a clean build. Fixed by adding it to the file's own
  `registerActions()` call alongside `openBakeryEditModal`/
  `handleBakeryEditPhoto`/`saveBakeryPage`. The exact same shape of mistake
  as the `modalNext`/`modalBack` (delegation migration) and
  `editReviewModal.js` (Phase 2 step 9) incidents this doc's own
  `check:dead-refs` section already documents — this time caught by the
  tool itself, at the point this extraction's own workflow runs it, rather
  than by a failing spec afterward.
  Verified: `check:dead-refs` clean (30 targets, including a check
  specifically confirming `businessBakeryManagement.js` itself passes all
  five checks — this is what caught the bug above), `npm run build`
  succeeds (54 modules). Ran a fast targeted check first —
  `bakery-profile-management.spec.js` (3 passed/1 skipped) plus a
  throwaway debug spec exercising the bakery-profile-modal's own
  `isOwner`-gated "Edit page" button end-to-end (a second entry point not
  covered by the existing spec, which only exercises the Settings-page
  path) with a `pageerror`/console-error listener attached — zero errors —
  before the full `test:e2e` gate: 59 passed/12 skipped/0 failed, within
  this doc's own documented normal skip-count range.
- **`src/components/adminPanel.js` — step 23** (2026-08-26, commit
  `b86c34e`). **Opens Phase 6.** Re-grepped fresh and found the plan's own
  "5 headers, one real feature" framing (ADMIN PANEL, ADMIN PANEL
  RENDERERS, MANAGE BAKERY, REVIEW FLAGGING (empty), FLAG REVIEW) was an
  overstatement — verified by reading each function's own dependencies and
  actual DOM reachability, per steps 19-22's own repeated lesson, rather
  than trusting the plan's characterization as-is:
  - **`flagReview`** (the whole reason "FLAG REVIEW" has its own header)
    did **not** move. It's the general-purpose "report a review" action —
    reachable by any signed-in user from the item detail modal's flag
    button, gated only on `currentUser`, not `isAdmin()`. Its only
    relationship to this cluster is writing to the same `flaggedReviews`
    collection `renderAdminFlags` later reads — the same "shares a
    collection, not a feature" shape as `toggleSaveItem`/`removeSavedItem`
    vs. `renderSavedTab` (step 22). Stays in `legacy-app.js`, registered
    from its own existing (untouched) `registerActions()` call.
  - **FEATURE REQUESTS split**, the same shape as step 22's Activity
    Calendar/Dining Map (a real cluster never named as its own plan step):
    `openFeatureRequestModal`/`closeFeatureRequestModal`/
    `submitFeatureRequest` (the general "💡 Request a feature" submit flow,
    reachable by any signed-in user via the avatar dropdown) stayed;
    `renderAdminFeatures`/`toggleFeatureVote`/`updateFeatureStatus`/
    `deleteFeatureRequest` moved — `renderAdminFeatures` only ever renders
    into `#adminTabContent` (confirmed via DOM id, not assumed from
    proximity), and `toggleFeatureVote` isn't itself `isAdmin()`-gated in
    its own body but has zero reachable UI outside this admin-gated panel,
    so by actual current reachability it belongs here.
  - **`refreshAdminUsersPanel`/`promoteUser`/`promptAssignBakery`/
    `removeUserRole`**, plus dead code **`renderAdminUsers`** (found later,
    near NOTIFICATIONS/UTILS), were never under any of the 5 named headers
    at all — they sit under the file's much earlier, otherwise-fully-migrated
    "ROLES" section, yet another "position vs. topic" split this plan keeps
    finding. All 5 moved regardless of heading, confirmed genuinely
    Users-tab admin actions by reading.
  **A real, previously-undocumented bug surfaced while reading, not
  introduced by this move**: both `refreshAdminUsersPanel()` and
  `renderAdminUsers()` target `document.getElementById('adminUsersPanel')`
  — an id that doesn't exist anywhere in `index.html` (confirmed via grep).
  The real Users tab renders into `#adminTabContent`
  (`showAdminTab`'s own target). Both functions' `if (panel) ...` guard
  means this fails silently — after promoting/assigning/removing a role,
  the visible Users list doesn't refresh in place until the tab is
  re-clicked. Left as-is, matching this plan's own established treatment
  of pre-existing bugs found while extracting (e.g.
  `renderBusinessSection()`'s missing `buildBakeryIndex()` call).
  Two genuinely blocked calls resolved via the `getAction()` pattern from
  steps 18/21, not a forbidden direct import back into `legacy-app.js`:
  `renderAdminBakeriesHTML()`'s `buildBakeryIndex()` (already registered as
  an action since step 21 — reused, no new registration needed) and
  `removeReviewAndFlag()`'s `loadData()` (both stay in `legacy-app.js`,
  blocked on Explore's `exploreCache`, Phase 0 step 3b / Phase 7 step 29's
  own already-documented note) — `loadData` had no prior action
  registration, so `legacy-app.js` now registers it via a new
  `registerActions({ loadData })` call for this lookup to resolve, the same
  treatment `saveReview` got at step 18.
  Verified every real (non-markup) call site of each moving name before
  trimming any import, per step 22's own lesson (a function staying behind
  can still call something that's leaving) — found and removed two more
  now-genuinely-unused imports from `legacy-app.js`'s own `appState.js`
  import while already there: `allUserRoles` and `loadAllUserRoles`, both
  left dangling once `promoteUser`/`promptAssignBakery`/`removeUserRole`/
  `showAdminTab` moved (their only real callers). `bakeryProfiles` also
  removed — genuinely zero real (non-comment) uses left in `legacy-app.js`.
  `SUPER_ADMIN_UID`/`isAdmin`/`ownsBakery`/`loadBakeryProfiles` all confirmed
  still needed elsewhere and kept. One incidental stale `WINDOW EXPORTS`
  entry found and removed while already scanning this exact block:
  `openFeatureRequestModal` (zero raw call sites, confirmed via grep,
  reached only via delegated markup — pre-existing staleness, unrelated to
  this step's own moves). 4 functions exported (`showAdminTab` — plain-JS
  call from `openSettingsPage()`; `closeManageBakeryModal` — the modal's own
  outside-click listener; `handleBakeryPhoto`/`saveBakeryProfile` — the two
  raw, undelegated handlers on `#manageBakeryModal` itself, `index.html:988`
  /`:1009`, the admin-only "Manage Bakery assignment modal" already named in
  the handler-delegation migration's own status table as permanently out of
  scope), matching steps 21/22's minimal-export precedent over
  `manageOfferingsModal.js`'s uniform-export approach.
  Verified: `check:dead-refs` clean (29 targets, including a check
  specifically confirming `adminPanel.js` itself passes all five checks),
  `npm run build` succeeds (53 modules). Given the size and the two
  getAction() resolutions, ran a fast targeted check first —
  `admin-panel.spec.js` (5 passed/1 skipped) plus a throwaway debug spec
  exercising the Bakeries tab (71 rows rendered, confirming
  `getAction('buildBakeryIndex')()` resolves), the Features tab (2 rows
  rendered, vote button visible, confirming the split cluster renders
  correctly), and the Flags/Users tabs, with a `pageerror`/console-error
  listener attached throughout — zero errors — before the full `test:e2e`
  gate: 58 passed/13 skipped/0 failed, within this doc's own documented
  normal skip-count range.
- **`src/components/profileModal.js` — step 22** (2026-08-26, commit
  `45b33a3`). **Closes out Phase 5.** Re-grepped legacy-app.js's "FILTER
  HELPERS" section fresh (line numbers had shifted since step 21) and
  confirmed its last remaining code — `profileActiveCatFilter`/
  `profileActiveLocFilter`/`profileModalUid`, `openProfileModal`,
  `closeProfileModal`, `switchProfileTab` — is genuinely the Profile
  modal's own rendering, exactly as step 21's own header comment said it
  would be. Moving these three functions resolved this section down to
  pure historical comments, confirmed by reading before moving, not
  assumed from the plan.
  This step was explicitly framed as resolving the largest deferred-item
  backlog in the plan, and each item was checked individually before
  writing any code, per the resume prompt's own instruction — not assumed
  resolved just because this file now exists:
  - **`closeDetailAndOpenProfile`** (deferred step 19, `itemDetailModal.js`)
    — moved wholesale. Needed `closeDetailModal` imported one-way from
    `itemDetailModal.js` — verified that file imports nothing from here
    first, so no cycle.
  - **`renderSavedTab`/`removeBookmarkAndRefreshSaved`** (deferred step 20,
    `shareReviewModal.js`) — moved wholesale, confirming step 20's own
    header comment that both were genuinely Profile-modal internals that
    only shared a file section with Share Review by position.
  - **`openProfileIfSignedIn`** (deferred step 12, `reviewCard.js`) — moved
    wholesale. Its `data-onclick="openProfileIfSignedIn"` references inside
    `cardHTML`/`feedCardHTML` markup keep resolving via the global
    `registerActions()` registry regardless of which file registers it.
  - **`refreshOpenProfile`** — the narrower half of a pair follows.js's own
    step-14 header comment named as both waiting for this step
    (`followAndRefreshProfile`/`refreshOpenProfile`). Only `refreshOpenProfile`
    actually moved: it needed only the Profile modal's own now-local state
    (`profileModalUid`/`profileActiveCatFilter`/`profileActiveLocFilter`)
    and `openProfileModal` (also now-local) — a clean wholesale move,
    exported since `legacy-app.js`'s own `followAndRefreshProfile` needs it
    imported back. `followAndRefreshProfile` itself could **not** move too,
    despite being the pair's other half — a distinction surfaced by reading
    its own dependency, not by trusting the pair framing: it also calls
    `toggleFollow()`, which stays in `legacy-app.js` (`toggleFollow` calls
    `refreshFollowButtons`, which calls `renderPeople()`, still local to
    `legacy-app.js` — the same reason `follows.js`'s own step 14/15 notes
    already gave for `toggleFollow` staying put). Moving
    `followAndRefreshProfile` here would have meant this file importing
    `toggleFollow` back from `legacy-app.js` — the forbidden direction,
    since `legacy-app.js` already needs `openProfileModal`/
    `closeProfileModal`/`switchProfileTab`/`refreshOpenProfile` imported the
    normal way. `followAndRefreshProfile` stays behind as a genuine
    one-function leftover of that pair, not an oversight.
  **A second new dependency, found only by reading this step's own code,
  not pre-flagged anywhere**: `removeBookmarkAndRefreshSaved` calls
  `toggleBookmark()`, which had never been claimed by any step and was
  still sitting in `legacy-app.js`'s own "BOOKMARKS" section. A fresh grep
  for every real (non-markup) call site of `toggleBookmark` found exactly
  one: `removeBookmarkAndRefreshSaved`, moving this same step — its other
  two "callers" (`bakeryModal.js`'s bookmark button,
  `legacy-app.js`'s own not-yet-extracted `renderBakeries`) are both
  `data-onclick="toggleBookmark"` markup strings, resolved via the global
  registry regardless of which file registers the action, so no import was
  needed for either. `toggleBookmark` moved here too, alongside its sole
  real caller — the same "small self-contained function moves with its
  only caller" reasoning as step 19's `isSavedItem` and step 15's
  `computeUserScore`.
  **Activity Calendar** (`renderActivityTab`/`renderCalendar`/`calNav`/
  `onCalDayClick`/`closeCalDayModal` + `calViewYear`/`calViewMonth`/`calUid`,
  module-private) **and Dining Map** (`renderDiningMapTab`/`switchDmTab`/
  `renderDmStats`/`renderDmStatRows`/`geocodeBakeryAddress`/
  `buildBakeryCoords`/`loadLeafletThenMap` + `diningMapInstance`,
  module-private) were never named as their own steps in this plan's
  32-step list — confirmed by a full-file grep before moving either, not
  assumed from that omission, that both clusters' only caller anywhere in
  the codebase is `switchProfileTab`'s own `'activity'`/`'map'` branches.
  Brought in here rather than left as a future standalone module, matching
  this file's role as the last and largest of Phase 5's composite modals.
  Every dependency this file needs already had a real importable home —
  unlike steps 18/21, nothing here needed the `getAction()` workaround for
  a genuinely blocked cross-cluster call. `buildCategoryFilterBar`/
  `openBakeryProfile` import one-way from `bakeryModal.js`,
  `computeCountryRank` one-way from `pages/people.js`, `followBtnHTML`/
  `getFollowersForUser`/`getFollowingForUser`/`buildFollowUserRowHTML`
  one-way from `follows.js`, `renderOrdersTab` one-way from
  `reservations.js` — all ordinary leaf-to-leaf imports, each verified for
  no cycle before writing any code. Export policy follows `bakeryModal.js`'s
  precedent (minimal — only functions with a real external caller get
  `export`), not `manageOfferingsModal.js`'s uniform-export approach: only
  `openProfileModal`/`closeProfileModal`/`switchProfileTab`/
  `refreshOpenProfile` are exported; everything else (including
  `toggleBookmark`) is markup-only or same-file-internal, registered via
  `registerActions()` but never imported by name elsewhere.
  9 stale `WINDOW EXPORTS` entries removed (`buildBakeryCoords`/
  `geocodeBakeryAddress`/`loadLeafletThenMap`/`renderActivityTab`/
  `renderCalendar`/`renderDiningMapTab`/`renderDmStatRows`/`renderDmStats`/
  `renderSavedTab`) — `closeProfileModal` kept, verified via grep to have a
  real raw call site (`index.html`'s ✏️ edit-profile button, `onclick=
  "closeProfileModal(); showPage('settings');"` — the SETTINGS cluster's
  one raw site, already named in the handler-delegation migration's own
  status table, not staleness). Several `registerActions()` bulk calls
  trimmed across the file (the modal-close bulk call, the
  `switchProfileTab`/`followAndRefreshProfile`/`followAndRefreshPeople`
  bulk call, the `openProfileModal`/`openBakeryEditModal`/
  `openManageBakeryModal`/`openManageShopModal` bulk call, the Bakeries
  page's `setBakeryView`/`toggleBookmark`/`renderBakeries` bulk call) —
  same pattern as every prior step's bulk-call trims. Also removed a
  genuinely dead import discovered while already touching this exact
  import line: `getFollowState` (imported from `follows.js` into
  `legacy-app.js` since step 14, but never actually called anywhere in that
  file — pre-existing staleness, not introduced this step, caught only
  because the whole follows.js import block became empty once
  `getFollowersForUser`/`getFollowingForUser`/`buildFollowUserRowHTML`/
  `followBtnHTML` moved with the code that used them).
  **A real regression, caught by the targeted spec run before the full
  gate, not by `check:dead-refs` or `npm run build`**: the first pass at
  trimming `legacy-app.js`'s `reservations.js` import dropped
  `renderOrdersTab` entirely, on the assumption its only caller was
  `switchProfileTab` (moving). That missed `cancelReservation()` — staying
  in `legacy-app.js`, deferred since step 16 — which also calls
  `renderOrdersTab(content)` directly after a successful cancel, to
  refresh the Orders tab in place. Both `check:dead-refs` and `npm run
  build` passed clean regardless (a bare reference inside an `if (cond)
  await fn(args);` statement isn't the standalone-statement shape
  `checkDeadStatementCalls` recognizes — a narrower variant of the same
  blind-spot class as the `modalNext`/`modalBack` and `editReviewModal.js`
  incidents, not yet fixed here). Only caught because the targeted
  `reservations.spec.js` run (part of this step's own pre-full-suite
  check, given the size and risk) failed deterministically — confirmed
  against the pre-change commit via `git stash` that this was a real
  regression, not pre-existing flakiness, before debugging further. Root
  cause confirmed directly via a throwaway debug spec with a
  `page.on('pageerror', ...)` listener: `ReferenceError: renderOrdersTab is
  not defined, at cancelReservation`, thrown right after the Firestore
  write itself had already succeeded (the status really did change
  server-side) — the reference error was inside `cancelReservation`'s own
  `try` block, so its `catch(e)` swallowed it into a "Could not cancel"
  toast despite the cancel having actually worked, and the Orders tab card
  never got its in-place re-render, staying stuck on stale "Pending" text.
  Fixed by restoring `renderOrdersTab` to the import list alongside
  `parseSlotStartTime`. Worth remembering for any future step
  that trims an import list shared by both a moving and a staying
  function: grep every real call site of the function being removed from
  an import, not just the ones inside the code that's moving.
  Verified: `check:dead-refs` clean (28 targets, including a check
  specifically confirming `profileModal.js` itself passes all five
  checks), `npm run build` succeeds (52 modules). Given the size and the
  number of resolved deferrals, ran a targeted check first —
  `people-filters.spec.js` (Profile modal tabs, Followers/Following rows,
  location filter chips) + `activity-calendar.spec.js` + `share-and-saved.spec.js`
  (Saved tab bookmarks/items) + `reservations.spec.js` (Orders tab) +
  `feed.spec.js` (`openProfileIfSignedIn` reachability) — this first pass
  surfaced the `renderOrdersTab` regression above (1 failed, in
  `reservations.spec.js`); after the fix, the same targeted set came back
  14 passed/8 skipped/0 failed, then the full `test:e2e` gate: 59
  passed/12 skipped/0 failed, within this doc's own documented normal
  skip-count range.
- **`src/components/bakeryModal.js` — step 21** (2026-08-25, commit
  `7b89f37`). Re-grepped legacy-app.js's section headers fresh and found
  the bakery-profile-modal cluster doesn't live under its own heading at
  all — it's inside "FILTER HELPERS", the grab-bag CLAUDE.md's own plan
  already flagged as splitting three ways (People page, already extracted;
  Profile modal; Bakery modal). Confirmed every function's cluster
  membership by reading its actual dependencies rather than trusting the
  heading, per steps 19/20's own lesson — this plan has now three times
  found functions living under the "wrong" apparent heading.
  Moved 8 functions wholesale: `fetchPlaceDetails`, `buildOpeningHoursHTML`,
  `toggleBakeryHours`, `buildBakeryMapHTML`, `openBakeryProfile`,
  `closeBakeryModal`, `switchBakeryTab`, plus `bakeryActiveCatFilter`
  (module-private state, zero external references, no setter needed).
  **`buildCategoryFilterBar` moved here too**, despite `openProfileModal`
  (not moving — Phase 5 step 22) also calling it — verified it's a
  completely pure, stateless UI-string builder (only `CATEGORY_TREE` +
  `dataArgs`, both already available, no reference to any global state at
  all), so it got the same "shared, zero-risk value gets a real home"
  treatment `GOOGLE_MAPS_KEY` got at Phase 4 step 18, rather than being
  duplicated or left blocking this cluster. `legacy-app.js` imports it
  back one-way for `openProfileModal`'s continued use; step 22
  (`profileModal.js`) will need to import it from here too, an ordinary
  leaf-to-leaf import like several others already in this plan (e.g.
  `qrCode.js` importing `markCollected` from `manageOfferingsModal.js`).
  **`isBookmarked` moved to `src/state/appState.js` instead of here** —
  co-located with `userBookmarks`, the same treatment `isAdmin`/
  `isBusiness`/`ownsBakery` already got there. Unlike step 19's
  `isSavedItem` (one external caller, moved with it), `isBookmarked` has
  two post-move callers (this file's `openBakeryProfile`, and
  `legacy-app.js`'s still-unextracted `renderBakeries`) — neither a clean
  "sole caller" home, so co-locating with the state it reads sidesteps
  picking one arbitrarily, with zero cycle risk either way.
  **Explicitly confirmed, per this step's own instruction, that
  `reserveOffering`/`openReserveModal`/`closeReserveModal`/
  `renderPreorderTab` (the "Reserve" flow from a bakery profile's own
  Pre-order tab) belong here** — re-read them fresh rather than trusting
  step 16's note alone, confirmed they're genuinely bakery-profile-modal
  internals with no dependency on anything reservations.js already owns,
  and brought all 4 in as one more part of this same commit.
  **The two-blocked-dependency shape, resolved by extending step 18's
  precedent rather than re-deferring against explicit instruction**:
  `openBakeryProfile` (unavoidably core — deferring it would mean not
  extracting this file at all) calls `buildBakeryIndex()`, which stays in
  `legacy-app.js` (still blocked on Explore's `exploreCache`, per the
  already-documented Phase 0 step 3b / Phase 7 step 29 note).
  `reserveOffering` (core to the Reserve flow this step was explicitly
  asked to bring in) calls `loadMyPreorders()` and `renderPreorderPage()`,
  both distant future clusters (Phase 7 steps 31 and 30). Direct imports
  back into `legacy-app.js` for any of the three would have broken the
  sink invariant confirmed at step 18 (leaf modules never import from
  `legacy-app.js`), so all three now resolve via
  `getAction('name')()` instead — the same action-registry lookup
  `modalNext` used for `saveReview` at Phase 4 step 18, reused here for
  the first time since, exactly as that entry predicted it might be.
  `buildBakeryIndex`/`loadMyPreorders` needed new `registerActions()`
  calls added in `legacy-app.js` (neither was previously a click action);
  `renderPreorderPage` already had one, pre-existing and unrelated to any
  markup call site of its own — discovered, not added, and reused as-is.
  8 stale `WINDOW EXPORTS` entries removed (`buildBakeryMapHTML`/
  `buildCategoryFilterBar`/`buildOpeningHoursHTML`/`closeBakeryModal`/
  `fetchPlaceDetails`/`isBookmarked`/`openBakeryProfile`/
  `renderPreorderTab`), each verified against a fresh `index.html` grep
  per the step 13 lesson — zero raw call sites for any of them.
  `loadMyPreorders`'s own stale entry also removed, now that it has a
  proper `registerActions()` entry instead. 6 `registerActions()` calls
  trimmed across the file (the bulk close-modal call, two different
  FILTER-HELPERS-adjacent bulk calls, the Pre-order discovery page's bulk
  call, and the reserveOffering/cancelReservation pair) — same pattern as
  every prior step's bulk-call trims, plus a handful of now-stale
  historical comments corrected while already touching each block (e.g.
  a "~25 call sites... stays in WINDOW EXPORTS" claim that predated the
  handler delegation migration's own completion).
  Verified: `check:dead-refs` clean across all targets (one informational,
  pre-existing `unusedParameters` note on `buildBakeryMapHTML`'s `name`
  parameter — present in the original code verbatim, not introduced by
  this move, left alone). `npm run build` succeeds (51 modules). Given the
  size and the two getAction() workarounds, ran a fast targeted check
  first — `reservations.spec.js` (whose own setup helper drives the real
  Reserve flow end-to-end: bakery profile → Pre-order tab → Reserve button
  → quantity picker → confirm, exactly the moved cluster) +
  `bakery-profile-management.spec.js` (opening-hours toggle) +
  `activity-calendar.spec.js` (calendar day → bakery profile, a plain-JS
  `openBakeryProfile` call site) + `admin-panel.spec.js` (Bakeries tab
  "View page") — 11/11 passed — before the full `test:e2e` gate: 59
  passed/12 skipped/0 failed, within this doc's own documented normal
  range.
- **`src/components/shareReviewModal.js` — step 20** (2026-08-25, commit
  `49a31db`). Re-grepped the "SHARE REVIEW WITH A FOLLOWED USER" section
  fresh (line numbers had shifted since step 19). Its own header comment
  already flagged, before this session even read it, that the section
  mixed clusters by file position — `renderSavedTab` (Profile modal's own
  Saved tab) and `removeBookmarkAndRefreshSaved` shared the section but
  not the topic. Confirmed by reading rather than trusting the comment
  outright, per step 19's own lesson: both call `switchProfileTab`, still
  local to `legacy-app.js` (future `src/components/profileModal.js`,
  Phase 5 step 22) — genuinely Profile-modal internals, not Share Review.
  Moved the 5 functions that are actually topically "Share Review"
  wholesale: `openShareReviewModal`, `renderShareCandidateRows`,
  `filterShareCandidates`, `closeShareReviewModal`, `sendSharedReview`,
  plus their own `shareModalCandidates`/`shareModalItemId` state (kept
  module-private — no setters needed, since every read/write site moved
  together with them). Explicitly checked for a profileModal.js
  cross-cluster dependency before writing any code, per the resume
  prompt's own instruction (mirroring step 19's `closeDetailAndOpenProfile`
  deferral) — none of the 5 moved functions reference `openProfileModal`,
  `switchProfileTab`, or anything else still local to `legacy-app.js`
  beyond ordinary appState.js/utils imports; only the two functions that
  stayed behind (`renderSavedTab`/`removeBookmarkAndRefreshSaved`) have
  that dependency, and they aren't moving.
  `closeShareReviewModal` is called as plain JS from `legacy-app.js`'s own
  modal outside-click listener — imported back, one-way, no cycle (the
  moved functions don't call anything back into `legacy-app.js`).
  `openShareReviewModal`/`filterShareCandidates`/`sendSharedReview` are
  only ever reached via delegated markup (including from
  `itemDetailModal.js`'s own "📤 Share" button, extracted last step) — no
  import needed, resolved via the global `registerActions()` registry
  regardless of which module registers them.
  Three `registerActions()` calls trimmed: `openShareReviewModal` pulled
  out of the ITEM DETAIL bulk call (`toggleSaveItem`/
  `closeDetailAndOpenProfile`/`flagReview` stay); `closeShareReviewModal`
  pulled out of the bulk close-modal-buttons call (8 other functions
  stay); `filterShareCandidates`/`sendSharedReview` pulled out of the
  section's own trailing call (`removeSavedItem`/
  `removeBookmarkAndRefreshSaved` stay, registered from `legacy-app.js`
  since neither moved) — same pattern as every prior step's bulk-call
  trims. `renderShareCandidateRows` had a stale `WINDOW EXPORTS` entry
  (zero raw call sites in `index.html`, confirmed via grep per the step 13
  lesson) — removed; the other 4 moved functions were never in that block.
  Verified: `check:dead-refs` clean (27 targets, including a check
  specifically confirming `shareReviewModal.js` itself passes all five
  checks), `npm run build` succeeds (50 modules). Ran a fast targeted
  check first — `share-and-saved.spec.js` (Share modal following-status +
  search filter + Send-button wiring + Saved-tab save/remove flows) +
  `feed.spec.js` (item detail's own Share button reachability) — 5/5
  passed — before the full `test:e2e` gate: 58 passed/13 skipped/0
  failed, within this doc's own documented normal skip-count range.
- **`src/components/itemDetailModal.js` — step 19** (2026-08-25, commit
  `2d90c6a`). **Opens Phase 5.** Re-grepped the ITEM DETAIL section fresh
  (line numbers had shifted since step 18) and found it's just 3 functions:
  `openDetail`, `closeDetailModal`, `closeDetailAndOpenProfile`. Moved the
  first two wholesale, plus `isSavedItem` — which turned out not to belong
  to this section at all, despite being needed by `openDetail`'s own
  markup (`${isSavedItem(item.id) ? ...}`): it was actually defined under
  legacy-app.js's separate "SAVED ITEMS (want to try)" header, alongside
  `toggleSaveItem`/`removeSavedItem`. Confirmed via grep that neither of
  those two ever calls `isSavedItem` — its only external caller anywhere
  was `openDetail` — so it moved with its sole caller rather than staying
  behind with same-section siblings that don't use it, the same
  "small self-contained function moves with its only caller" reasoning
  used for `computeUserScore` (step 15) and `openProfileIfSignedIn`'s
  would-be counterpart. Its own dependency, `userSavedItems`, was already
  in `appState.js` since Phase 0 step 3c, so this was a clean move with no
  setter needed.
  **Split, not clean, flagged before writing any code**:
  `closeDetailAndOpenProfile` stayed in `legacy-app.js` — it calls
  `openProfileModal()`, still local to that file (future
  `src/components/profileModal.js`, Phase 5 step 22). Moving it would have
  created a genuine two-file cycle: `legacy-app.js` already needs
  `openDetail`/`closeDetailModal` imported back for real plain-JS call
  sites (not just delegated markup) — a notifications row's
  `onClick: () => openDetail(...)`, the detail-modal outside-click
  listener, and the Escape-key handler — while `itemDetailModal.js` would
  have needed `openProfileModal` imported the other way. Same shape as
  `reviewCard.js`'s `openProfileIfSignedIn` deferral (Phase 3 step 12).
  `closeDetailAndOpenProfile` keeps resolving correctly via its existing
  `data-onclick="closeDetailAndOpenProfile"` markup (now living in
  `itemDetailModal.js`) since the global `registerActions()` registry
  doesn't care which module registers a given action name.
  Two `registerActions()` calls in `legacy-app.js` trimmed: `openDetail`
  pulled out of the leaderboard's bulk call (`switchLbMode`/`switchLbTab`/
  `closeLbAndOpenBakery`/`onLbFilterChange` stay), `closeDetailModal`
  pulled out of the bulk close-modal-buttons call (10 other functions
  stay) — same pattern as every prior step's bulk-call trims.
  `isSavedItem` had a stale `WINDOW EXPORTS` entry (zero raw call sites in
  `index.html`, confirmed via grep per the step 13 lesson) — removed;
  `openDetail`/`closeDetailModal` were never in that block to begin with.
  Verified: `check:dead-refs` clean (26 targets, including a check
  specifically confirming `itemDetailModal.js` itself passes all five
  checks), `npm run build` succeeds (49 modules). Ran a fast targeted
  check first — `feed.spec.js` (clicks a feed card to open item detail) +
  `reactions.spec.js` (confirms reacting does *not* open item detail) +
  `share-and-saved.spec.js` (exercises `isSavedItem`/`toggleSaveItem`
  directly via the Saved tab) — 8/8 passed — before the full `test:e2e`
  gate: 58 passed/13 skipped/0 failed, within this doc's own documented
  normal skip-count range.
- **`src/components/addReviewModal.js` — step 18** (2026-08-25, commit
  `2c827ae`; follow-up commit `d4cfec1` for the handleEditPhoto move).
  **Closes out Phase 4.** The "Rate a Bake!" wizard — modal shell, bakery
  search (BAKERY SEARCH), category picker + tasting-dim sliders + photo
  upload (ADD ITEM MODAL + IMAGE COMPRESSION), item matching (ITEM
  MATCHING), and step navigation (MODAL STEPS, RATING's own slider) — kept
  as **one** module, per the plan. Held to an explicitly elevated
  verification bar throughout, per the user's own instruction: this is the
  exact cluster where `modalNext`/`modalBack` broke and shipped silently
  unregistered during the original handler-delegation migration, caught
  only by a real E2E click timing out, past both `check:dead-refs` and
  `npm run build` at the time. That history doesn't make the extraction
  itself riskier — it means familiarity with "just move one module" isn't
  allowed to shortcut the checks here.
  Moved 32 functions (of the original 33 candidates) + 5 of 11
  module-level state variables (`selectedCategory`/`selectedBakery`/
  `photoFile`/`selectedSubCategory`/`matchedItemRecord`, exported as
  read-only live bindings — `currentStep`/`totalSteps`/`photoDataURL`/
  `userLatLng`/`searchTimeout`/`knownMatchNamesLower` stayed fully private,
  confirmed via a full-file grep that nothing outside ever touches them).
  `openAddModalForBakery` moved in too, despite being called only from
  other not-yet-extracted clusters' own markup — every one of its own
  dependencies belongs to this cluster by nature, not by caller, confirmed
  by reading its body before deciding, not assumed from its name.
  **`saveReview` stays in `legacy-app.js`, deferred** — it depends on
  `updateStats`/`renderRecentGrid`/`renderLeaderboard`/`lbCurrentTab`/
  `loadData`, none extracted before Phase 7 (steps 27-29), same shape as
  `editReviewModal.js`'s already-deferred `saveEdit`/`deleteReview`.
  **The genuinely new situation, confirmed with the user before writing
  any code, not decided unilaterally**: `modalNext` (which must move —
  core to this cluster's own reason for existing) calls `saveReview()`
  directly. Every prior deferral in this plan resolved this shape by
  leaving the dependent function behind in `legacy-app.js`; that doesn't
  work here, because `modalNext` itself is the one moving — deferring
  `saveReview` alone would just flip which file needed the forbidden
  import (confirmed via a fresh grep that zero leaf modules import from
  `legacy-app.js` anywhere in the codebase before concluding this was a
  real problem, not assumed). Resolved by having `modalNext` call
  `getAction('saveReview')()` — the same action-registry lookup
  `delegate.js` already uses to resolve every `data-onclick` by name —
  instead of a direct import. `saveReview` self-registers via
  `registerActions({ saveReview })` in `legacy-app.js`; `addReviewModal.js`
  only imports the neutral `getAction()` helper, never `saveReview` itself
  or anything else from `legacy-app.js`. No ordering risk: `legacy-app.js`
  finishes its own module evaluation (including that `registerActions`
  call) before any user click could reach `modalNext()` — the same
  guarantee `delegate.js`'s own dispatch already relies on everywhere else.
  First use of this pattern outside `delegate.js`'s own internal dispatch
  in the whole plan — sets a precedent later deferred steps (e.g. step 29's
  `saveEdit`/`deleteReview`) could reuse, worth remembering when that step
  comes up.
  `GOOGLE_MAPS_KEY` extracted to a new `src/config.js` — not part of this
  extraction's own scope, but a necessary side-effect: this file needs it
  (`fetchBakeryPlaces`/`selectBakery`), and it's also used by 6+ other
  still-unextracted clusters, so it could no longer stay a
  `legacy-app.js`-local constant without breaking the same sink invariant
  the `getAction()` resolution above was built to preserve. Same treatment
  `src/data/categories.js` got in Phase 0 step 1 — a shared, static,
  zero-risk value gets its own tiny file.
  `compressImage`/`compressToDataURL` turned out to have a much wider
  fan-out than the original step-9 deferral note described: a fresh grep
  found 5 external callers, not just `editReviewModal.js`'s
  `handleEditPhoto` — Settings' own photo upload, Business bakery-edit
  photo, the admin Manage Bakery photo, and Shop Management's product
  photo, all still in `legacy-app.js`, all now importing these two back
  one-way (no cycle — pure, stateless functions, confirmed by reading
  their bodies).
  Explicitly grepped `index.html` for raw handler references to all ~32
  candidate names before assuming any `WINDOW EXPORTS` entry was stale,
  per the step 13 (`switchFeedTab`) lesson — found real, not stale, raw
  call sites for 3 functions, all belonging to clusters CLAUDE.md's own
  migration-status table already named as permanently out of scope for the
  handler-delegation migration: `openAddModal` (nav's "+ Add" button, Home
  page's "Rate a Bake!" trigger — both raw `onclick=`), `showKnownBakeries`
  (`#bakerySearch`'s raw `onfocus=`), `updateOverallRating` (the
  overall-rating slider's raw `oninput=`). All three keep their `WINDOW
  EXPORTS` entry. `selectManualBakery` keeps its entry too, for the
  already-documented test-dependency reason (5 direct `window.
  selectManualBakery()` call sites across 4 spec files, reconfirmed via
  grep). 8 other stale entries removed (`buildCategoryChips`/`buildSummary`/
  `buildTastingDims`/`compressImage`/`compressToDataURL`/`renderParentChips`/
  `resetAddModal`/`saveReview` — the last one only ever needed by
  `modalNext`'s own internal call, now routed through `getAction()`
  instead).
  Three bulk `registerActions()` calls in `legacy-app.js` trimmed —
  `closeAddModal`/`prefillItemForReview`/`openAddModalForBakery` pulled out
  of blocks mixing several other not-yet-extracted clusters' own functions
  (same pattern as `authModal.js`'s `closeAuthModal`, Phase 1 step 6) —
  all three now register from `addReviewModal.js` itself.
  Used `sed` to extract exact source ranges into scratch files rather than
  retyping ~1,090 lines by hand, reusing the `manageOfferingsModal.js`
  step-17 approach (itself reused from the `shop.js` step-11 lesson) —
  verified line/export counts matched expectations before ever writing to
  `src/`.
  **Follow-up commit (`d4cfec1`)**: resolved the tied Phase 2 step 9
  deferral on `handleEditPhoto()` — see the Phase 4 checklist entry above
  and its own commit message for the full reasoning. Also deleted
  `setEditPhotoFile`/`setEditPhotoDataURL`, genuinely dead once
  `handleEditPhoto` landed in the same file as the state they set.
  Verified: `check:dead-refs` clean across all targets, including
  `[dead registerActions() reference] none found` specifically for
  `addReviewModal.js` — the exact `checkDeadRegisterActionsRefs` check
  built after the step-9 `editReviewModal.js` incident, run here
  deliberately rather than trusting `check:dead-refs` in general. `npm run
  build` succeeds (48 modules). Given the elevated risk, ran a fast
  targeted check first — `add-review-flow.spec.js` + `bakery-search.spec.js`
  + `image-compression.spec.js` + `edit-review.spec.js` (18/18 passed) —
  before the full `test:e2e` gate (59 passed/12 skipped/0 failed).
  Specifically confirmed (not assumed) that `tests/utils/reviews.js`'s
  `addReview()` helper — the shared setup helper used by ~6 different spec
  files — clicks the raw `#addBtn`, dispatches a real `input` event on the
  raw overall-rating slider, and drives all 4 wizard steps through to
  Save, exercising every one of this step's raw-handler paths and the new
  `getAction('saveReview')` mechanism repeatedly across the full suite, not
  just once. A second full `test:e2e` run after the `handleEditPhoto`
  follow-up: 58 passed/13 skipped/0 failed — clean, skip-count variance
  within this doc's own documented normal range.
- **`src/components/manageOfferingsModal.js` — step 17** (2026-08-25,
  commit `ebeec4e`). **Opens Phase 4 — the "does this scale" milestone.**
  Re-grepped the whole "PRE-ORDER / RESERVATIONS" section fresh (line
  numbers had shifted since step 16) and catalogued all 38 top-level
  functions in it before touching anything. Confirmed the cluster boundary
  by reading `tests/reservations.spec.js` and `tests/manage-offerings.spec.js`
  rather than assuming from file position: the baker-side "Manage
  pre-orders" modal (31 functions: `openManagePreordersModal` through
  `markCollected`, plus `openCatalogueManager`/`closeCatalogueManager`/
  `removeCatalogueItem`) is this file; `renderPreorderTab`/
  `openReserveModal`/`closeReserveModal`/`reserveOffering` (the "Reserve"
  flow from a bakery profile's own Pre-order tab) and `cancelReservation`
  are different clusters that happen to live in the same original file
  section — both scope boundaries were already decided at step 16, not
  revisited here.
  **Sub-staging explicitly considered and rejected, flagged before writing
  any code**: unlike `appState.js` (Phase 0 step 3, 3 commits across 3
  genuinely independent state domains with different dependency-resolution
  profiles), this cluster has zero shared module-level state (only 2
  static constants, `COLLECTION_TIMES`/`COLLECTION_SLOTS`) and a dense
  internal call graph all belonging to one feature (`renderMpUpcoming`
  alone is called from `saveOffering`/`saveEditOffering`/`deleteOffering`/
  `markCollected`). There's no fault line splitting it into commits
  wouldn't manufacture — moving a subset first would force one-way-back
  imports in both directions simultaneously for functions that don't
  actually need them in the finished module. Landed as one commit instead,
  matching how every other single-feature cluster has moved in this plan
  (`reviewCard.js`, `feed.js`, `people.js`), just much larger. Used `sed`
  to extract exact source line ranges into scratch files rather than
  retyping ~1,080 lines by hand — the `shop.js` step-11 lesson (an
  `escJS()` call silently dropped while retyping) made this worth avoiding
  entirely for a cluster this size, not just double-checking after the
  fact; verified line counts and function-boundary matches before ever
  writing to `src/`.
  **Zero imports back into `legacy-app.js`** — a first for a cluster this
  size, confirmed by grepping the full file for all 31 function names plus
  the two constants and checking every hit outside the moved ranges: each
  was either a `data-onclick` markup string (resolved via the delegated-
  actions registry at click time, no import needed) or a `registerActions()`
  call being moved/trimmed. `openManagePreordersModal`/
  `closeManagePreordersModal` pulled out of two bulk `registerActions()`
  calls that mix several other not-yet-extracted clusters' own open/close-
  modal functions (same pattern as `authModal.js`'s `closeAuthModal`,
  Phase 1 step 6) — the other 18-function `registerActions()` call moved
  wholesale, now living in this file instead. All 31 functions exported
  uniformly (matching `reactions.js`'s precedent) even though only
  `markCollected` has an external importer (`qrCode.js`, see below).
  11 stale `WINDOW EXPORTS` entries removed (`getEditSlotValue`/
  `getSlotValue`/`loadBakeryCatalogue`/`mpItemBreakdownHTML`/
  `renderMpForecast`/`renderMpHistoric`/`renderMpMonth`/`renderMpTab`/
  `renderMpUpcoming`/`saveToCatalogue`/`uploadItemPhoto`) — `index.html`
  explicitly grepped for all 31 candidate names first, per the step 13
  (`switchFeedTab`) lesson: only `closeManagePreordersModal` had a static
  markup call site, already correctly `data-onclick`-delegated, not raw.
  Also found and fixed a stale comment (not caught by any tooling, just
  read carefully): the "Reservations flow" `registerActions()` comment
  above `reserveOffering`/`cancelReservation` said `markCollected`/
  `openEditOffering`/`deleteOffering` were "converted separately below" —
  no longer true once this cluster moved out from under it.
  **Resolves Phase 2 step 10's deferral, decided explicitly rather than
  automatically**: `confirmCollected`/`closeQrConfirmOverlay` moved into
  `qrCode.js`, importing `markCollected` back from this file — verified
  one-way before moving, not assumed: `manageOfferingsModal.js`'s only
  reference to anything in `qrCode.js` is a markup
  `data-onclick="openQRScanner"` string, never a real import, so no cycle.
  Also found and fixed, while already touching `qrCode.js`'s header
  comment: its claim that `generateOrderQRCodes()` was "called from inside
  manageOfferingsModal.js's own not-yet-extracted code" was already stale
  as of step 16 — it's actually called from `reservations.js` now, and
  nobody updated the comment then. Corrected, and the now-genuinely-dead
  `generateOrderQRCodes` import removed from `legacy-app.js` (a leftover
  from step 16, not this step, but caught and fixed here).
  Verified: `check:dead-refs` clean (14 targets), `npm run build` succeeds
  (46 modules). Given the size, ran a fast targeted check first —
  `manage-offerings.spec.js` + `qr-scanner-baker.spec.js` in isolation
  (15/15 passed, including the "marking a reservation collected" test,
  which directly exercises the new `qrCode.js`↔`manageOfferingsModal.js`
  boundary) — before the full `test:e2e` gate (61 passed/10 skipped/0
  failed). One more full run after the dead-import cleanup: 59 passed/12
  skipped/0 failed — clean, skip-count variance within this doc's own
  documented normal range.
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
