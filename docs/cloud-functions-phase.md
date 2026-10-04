# Cloud Functions phase — running log + outstanding items

The frozen spec is `.claude/contracts/cloud-functions-contract.md` (interface
shapes, emulator story, rules table, hard constraints). This file is the
*running log* of what has actually landed, and the list of items that must be
closed before the phase counts as done — the equivalent of
`docs/extraction-log.md` for the carving plan.

Execution: **single-agent, sequential, one callable per commit**, order
**C5 → C3 → C9 → C8 → C1** (architect's verdict — do not run the team).

## Status

| Item | Commit | State |
|---|---|---|
| Pre-flight: delete `src/firebase.js` | `76cb054` | ✅ done |
| **C5** `setUserRole` | `f4b2148` | ✅ done |
| **C3** `moderateFlaggedReview` | `03845c1` | ✅ done |
| **C9** `markReservationCollected` | `f769d30` | ✅ done |
| **C8 / C8b** `createReservation` / `cancelReservation` | `6b5cc70` | ✅ done |
| **C1 / C1b** `submitReview` / `updateReview` / `deleteReview` | (this commit) | ✅ done — not yet deployed, see "Deployment" |

The C1/C1b server draft (`functions/reviews.js`, `functions/tasting.js`) was
written ahead of the sequential workflow; it had several real bugs, fixed
when C1/C1b landed — see its per-commit note below. The C8/C8b draft (`createReservation` / `cancelReservation` in the original
`functions/reservations.js`) turned out to have two real bugs, both fixed
when C8/C8b landed — see the per-commit note below.

## Outstanding before the phase is "done"

These are deliberately deferred, not forgotten. None may be dropped.

1. **Close `firestore.rules` `flaggedReviews` delete to `false`.** C3 left the
   super-admin-only client delete (`request.auth.uid == 'KTpBS4yJx2h8LpcryCTfJDFCHlr2'`)
   in place — it's already dead in the app, and closing it is a separate
   later commit, mirroring the C5 `userRoles`-fallback approach. Ed confirmed
   this sequencing (2026-08-31) **and** that it must be closed before the
   phase is considered complete.
2. **Stop hardcoding `KTpBS4yJx2h8LpcryCTfJDFCHlr2`** in `firestore.rules` +
   `src/state/appState.js` + `functions/shared.js`. Per the contract's C5
   section this is the *goal* of C5, reached one commit after every current
   role-holder has been re-granted through `setUserRole` and confirmed — not
   part of C5's own diff. Still open.
3. ✅ **CLOSED by C8b.** `reservations` `create` and `update` are now both
   `if false` (C8/C8b/C9 all server-side); `delete` stays super-admin-only
   for the E2E cleanup net. `preorderOfferings` lost its
   `hasOnly(['remaining'])` update clause too (that was the "any signed-in
   user can decrement stock" hole).
4. ✅ **CLOSED by C1/C1b (in the repo — see "Deployment" for production).**
   `items` / `itemRecords` `create, update, delete` → `if false`;
   `reviewRateLimits` explicit deny.
5. ✅ **CLOSED by C1/C1b.** `tests/cleanup.teardown.js` +
   `scripts/cleanup-e2e-data.mjs` delete items through the `deleteReview`
   callable (the agreed approach); the `itemRecords` sweep is now report-only
   (`itemRecordsOrphaned`). **The nightly `cleanup-e2e.yml` cron runs this
   script against production — it needs `deleteReview` deployed before this
   lands on `main`.**
6. **Emulator teardown bug (found during C3 verification, 2026-08-31).**
   Playwright's teardown doesn't kill the Firestore emulator's Java child
   process — it reparents to PID 1 and keeps port 8080, breaking the *next*
   `npx playwright test` run in the same session with "port taken". A clean
   `npm run test:e2e` from a fresh shell is unaffected. Fix belongs in
   `playwright.config.js`'s emulator `webServer` teardown. Low priority,
   not a blocker, but should be fixed before the phase closes.

## Deployment (production)

- **Rules** auto-deploy: `.github/workflows/deploy-rules.yml` runs
  `firebase deploy --only firestore:rules,storage` on any push to `main` that
  touches `firestore.rules` / `storage.rules`.
- **Client** auto-deploys: `.github/workflows/deploy.yml` → GitHub Pages on
  every push to `main`.
- **Functions are NOT in any pipeline** — manual
  `npx firebase deploy --only functions --project crumb-ddeb6`.
- As of C1, **none of this phase is on `main`** (C5 → C1 all on
  `feat/cloud-functions`), and the branch both closes rules (C8b/C9/C1) and
  ships a client that calls the callables. Order must be: functions deployed
  + verified live → client (rules unchanged) → rules closures last.

## Contract deviations (accepted)

- **C8 / C8b collection-time checks are client-side only** (Ed's decision,
  2026-08-31). The contract lists `NOT_YET_LIVE` / `PAST_COLLECTION` (C8) and
  `WITHIN_CUTOFF` (C8b) as error codes; the callables do **not** enforce
  them. Rationale: they're not a security boundary (no incentive to
  reserve/cancel a past offering, no no-show penalty), and enforcing them
  server-side pits the Functions emulator's real clock against the E2E
  suite's mocked browser clock (5 specs create UI offerings dated to a fixed
  mock past). The client keeps them as UX guardrails — `renderPreorderTab`
  only shows Reserve for live/upcoming offerings, `renderOrdersTab` hides
  Cancel inside 12h. Revisit if a real threat model appears.
- **C3 `moderationLog` shape** — no `reviewDeleted` field (matches the
  frozen shape; a test over-asserted it and was corrected).

## Per-commit notes

### C5 — `f4b2148`
See commit message. `functions/` scaffold (`package.json`, `shared.js`,
`index.js`, `roles.js`) + emulator wiring (`firebase.json`,
`playwright.config.js`, `package.json`, `.github/workflows/e2e.yml`,
`src/services/firebase.js` + `functions.js`). 3 C5 tests. Suite 83/3/0.

### C3 — `03845c1`
`functions/moderation.js` + `functions/reviewsAgg.js` (shared aggregate
maths, C1/C1b will reuse) + `src/services/moderation.js` +
`src/components/adminPanel.js` wiring. New rule `match /moderationLog`
(`read: isAdmin()`, `write: false`). 2 C3 tests (dismiss / remove). Suite
85/3/0. One test fix during verification: the "remove" test asserted a
`reviewDeleted` field on the `moderationLog` doc that the frozen contract
shape doesn't include — test corrected, function left as-is.

### C9 (suite 88/3/0)
`functions/reservations.js` trimmed to `markReservationCollected` only.
`src/services/reservations.js` (new, C9 wrapper only). `markCollected()` in
`manageOfferingsModal.js` now calls the callable (the QR-scan path via
`qrCode.js confirmCollected()` inherits it unchanged). Rule change:
`reservations` update now blocks any client transition *into*
`status:'collected'` (`request.resource.data.status != 'collected' ||
resource.data.status == 'collected'`), keeping owner update for cancel until
C8b. `src/services/firebase.js` also exposes `httpsCallable` on
`window._crumb` (needed so specs can invoke a callable as a non-admin user).
Tests: the admin happy path is already covered by
`tests/manage-offerings.spec.js:200`; C9's own block in
`tests/cloud-functions.spec.js` covers the closed rule + the callable's
server gate (customer refused, assigned business accepted, wrong-bakery
business refused) using a spec-local business user rather than a global-seed
change.

### C8 / C8b — `createReservation` / `cancelReservation`
`functions/reservations.js` gains both callables (all three reservation
callables now live there). `src/services/reservations.js` grows
`createReservation` / `cancelReservation` wrappers. Client:
`bakeryModal.js reserveOffering()` and `legacy-app.js cancelReservation()`
call the wrappers; the reserve/cancel UI (qty picker, confirm, toasts,
`renderPreorderTab` / `renderOrdersTab` re-render) is unchanged.

**Two real bugs found in the pre-draft and fixed:**
- `slotStartTime` matched `"5:00"` inside `"5:00pm"` before its am/pm branch,
  so any PM slot was read 12h early. (Now moot — the only consumer was the
  server `WITHIN_CUTOFF` check, which was dropped per the deviation above —
  but the helper was corrected before that decision and then removed.)
- **The stock-leak bug the contract flagged**: client cancel did
  `remaining + 1` regardless of `quantity`. The callable returns
  `remaining + reservation.quantity`. Covered by a dedicated test.

Rules: `preorderOfferings` update drops `hasOnly(['remaining'])`;
`reservations` `create, update` → `if false` (see Outstanding #3, now closed).
`tests/cleanup.teardown.js` reservation cleanup guarded against the
now-impossible mark-cancelled fallback.

Tests: C8/C8b block in `tests/cloud-functions.spec.js` — price/stock
transaction, `SOLD_OUT`, `OVER_MAX_PER_PERSON`, `DUPLICATE_RESERVATION`,
cancel real-quantity restock + `ALREADY_CANCELLED`, cancel permission gate,
and the closed client write rules (no direct reservation create, no direct
stock decrement). All offerings seeded via admin SDK (far-future dates, so
no clock dependency).

### C1 / C1b — `submitReview` / `updateReview` / `deleteReview`
`functions/reviews.js` + `functions/tasting.js` (server mirror of the
category → tasting-dim keys; checked against `src/data/categories.js`, and
every category in production `items`/`itemRecords` is valid) +
`src/services/reviews.js`. Client: `legacy-app.js saveReview()`,
`editReviewModal.js saveEdit()` / `deleteReview()`. Photo upload stays
client-side. Every aggregate is recomputed from the full review set inside
the same transaction as the write — old rating out / new rating in on edit is
automatic, and `reviewCount` is a length, so it can't go negative.

**Bugs found in the pre-draft and fixed:**
- **Dim averages zero-filled across mixed keys** (`reviewsAgg.js`): a record
  whose reviews don't all carry the same `dim_*` keys averaged the missing
  ones as 0 — a cake review linked to a bread record dragged `dim_crust` from
  4 to 2. Now each dim averages only over reviews that carry it. Shared with
  C3's remove path.
- **Linked submit accepted a different category** than the record's, mixing
  foreign dims into it. Now `invalid-argument`.
- **Category change on edit left the old 5th dim on the review**
  (`tx.update` merges) → it kept being averaged in. Now deleted.
- **Ghost records**: update/delete of a review whose `itemRecordId` points at
  a missing record merge-set a nameless aggregate-only record into existence.
  Now the record is read in the transaction and left alone if absent. Stale
  `dim_*` keys on a record are removed too.
- **Every edit of a review with a photo not under the caller's uid failed**
  (the form sends back the existing `photoURL`; an admin editing someone's
  review, or any non-`items/{uid}/` photo). An unchanged `photoURL` is now
  always accepted; a new one must be a Storage download URL under
  `items/{caller uid}/` (parsed, not substring-matched).
- **Timestamps leaked through the callable response** (`updateReview`'s
  `item.createdAt`, `submitReview`'s new-record `createdAt` sentinel) →
  now ISO strings; the edit modal keeps its cached `createdAt`.
- Client `deleteReview()` deleted the Storage photo *before* the callable —
  a refused delete left the review pointing at a deleted image. Now after.

**C3 follow-up in the same commit:** `moderateFlaggedReview`'s remove path
read the sibling reviews outside any transaction and wrote the aggregate in
a batch — a concurrent `submitReview` could be dropped from the count. Now a
transaction, matching C1/C1b.

Tests: C1 block in `tests/cloud-functions.spec.js` (10 tests incl. mixed-
category dims, category-change edit, unchanged-photo admin edit, ghost
record). `tests/data-reconcile.spec.js` switched its server-side delete to
the `deleteReview` callable (its direct `deleteDoc` on `items` is now
correctly refused).
