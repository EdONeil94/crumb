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

**Status as of 2026-08-24: ~81% converted** (238 delegated / 294 total
handler sites, raw + delegated, across both files, comments excluded — the
total is 294, not 295, from REACTIONS' one deliberate redundant-handler
removal a couple of clusters back, not a miscount).

| | raw (`onclick=`/`onchange=`/`oninput=`) | delegated (`data-on*=`) |
|---|---|---|
| `index.html` | 26 | 97 |
| `src/legacy-app.js` | 30 | 141 |
| **total** | **56** | **238** |

Converted clusters (fully delegated, 0 raw handlers left): **FOLLOWS**,
**FILTER HELPERS**, Pre-order discovery page + My Pre-orders burger-menu
sheet, **Manage Offerings incl. Pre-orders/Reservations**, **DATA**,
**EDIT REVIEW**, **SHARE REVIEW WITH A FOLLOWED USER**, **IMAGE
COMPRESSION**, **ADMIN PANEL RENDERERS**, **REACTIONS**, **SHOP**, and
everything else converted in earlier sessions per the git log. Notes on the
trickier ones, most recent first:

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
  verify a real Send if that path changes. Noticed, not touched: the "Item
  detail modal" `registerActions` block's own comment (`:8778`) claims 5
  functions still have other raw call sites keeping them in `WINDOW
  EXPORTS` — none of them do (verified) — left for whoever picks up ITEM
  DETAIL.
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

Remaining clusters, by raw-handler count in `src/legacy-app.js` (run
`npm run check:dead-refs` — it doesn't print this breakdown, but a quick
`grep -noE '\son(click|change|input)=' src/legacy-app.js | grep -v data-on`
does; exclude comment lines):

- BAKERY SEARCH — 6
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
- **`loadData()`'s unawaited reconcile can clobber recent state**
  (`src/legacy-app.js`) — a real robustness gap, two manifestations found
  so far, both unrelated to handler delegation and not touched here:
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

  Worth fixing in the app itself eventually (e.g. `loadData()` re-rendering
  whichever page/state is currently active instead of only what called it,
  or the reconcile merging rather than overwriting).
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

**Status as of 2026-08-24: verified green**, dedicated E2E account now
in place (separate from the personal super-admin account used earlier).
`npm run test:e2e` — 46 passed, 6 skipped (data-dependent — no candidates
to test Send against, no location with 2+ bakeries, etc.), 0 failed. This
covers everything converted since the migration started, including DATA,
EDIT REVIEW, SHARE REVIEW WITH A FOLLOWED USER, IMAGE COMPRESSION, ADMIN
PANEL RENDERERS, REACTIONS, and SHOP.

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
