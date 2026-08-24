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

**Blind spot confirmed in practice (MODAL STEPS, this session):** the
default invocation only scans `src/legacy-app.js` — a `data-onclick` in
`index.html` with no matching `registerActions()` entry passes clean, since
the checker never sees it. `modalNext`/`modalBack` shipped broken (removed
from `WINDOW EXPORTS` but never actually registered) past both
`check:dead-refs` and `npm run build` for exactly this reason, and was only
caught once a real E2E spec clicked the button. Reinforces the same lesson
this doc's conversion workflow already encodes in step 4 (run the full
suite, not just build/lint) — worth being extra deliberate about it for any
cluster whose new call sites live only in `index.html`.

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
