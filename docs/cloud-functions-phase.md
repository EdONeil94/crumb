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
| **C1 / C1b** `submitReview` / `updateReview` / `deleteReview` | `32f3c30` (WIP backup) + verification commit; rating fix `7e21e34` | ✅ done, deployed and live (europe-west2); 0.1-step rating fix in PR #19, see its note below |
| **Rules closures** (C9 / C8 / C8b / C1) | `cc3e11b`, shipped as PR #20 (`08b5654`) | ✅ done, live in production since 2026-10-06 (`deploy-rules.yml` run on `08b5654` succeeded) |

Test counts after the rules closures (2026-10-06): full `test:e2e` locally
on `aa5b256` (the PR #20 head) **108 passed, 3 skipped, 0 failed**; CI on
PR #20 **107 passed, 4 skipped, 0 failed**. The usual 3 skips are
`tests/admin-panel.spec.js:129`, `tests/bakery-profile-management.spec.js:33`
and `tests/bakery-search.spec.js:90`. CI's extra skip was
`tests/people-filters.spec.js:132` (its data-dependent "no other members to
follow" skip; it passed locally). The three closed-rule tests (C9
`tests/cloud-functions.spec.js:261`, C8 `:457`, C1 `:830`) ran and passed in
both.

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
4. ✅ **CLOSED by C1/C1b, live in production since PR #20 (2026-10-06).**
   `items` / `itemRecords` `create, update, delete` → `if false`;
   `reviewRateLimits` explicit deny.
5. ✅ **CLOSED by C1/C1b.** `tests/cleanup.teardown.js` +
   `scripts/cleanup-e2e-data.mjs` delete items through the `deleteReview`
   callable (the agreed approach); the `itemRecords` sweep is now report-only
   (`itemRecordsOrphaned`). **The nightly `cleanup-e2e.yml` cron runs this
   script against production — it needs `deleteReview` deployed before this
   lands on `main`.** Satisfied: `deleteReview` was live before the client
   landed, and the nightly cleanup was verified on `main` (it found nothing
   to delete; `reservationsUndeletable: 469` is the known backlog item).
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
- As of 2026-10-06 **the whole phase is on `main` and live**: the 8
  Functions on `crumb-ddeb6` (europe-west2), the client that calls them, and
  the closed rules. The order held: functions deployed and verified live,
  then the client (rules unchanged), then the rules closures last.

### Rollout plan (Ed, 2026-10-04): all three steps done

1. ✅ **Functions**: deployed manually with `firebase deploy --only
   functions`; all 8 are live on `crumb-ddeb6` in europe-west2.
   `submitReview` and `updateReview` were redeployed with the 0.1-step
   rating fix before step 2's re-land.
2. ✅ **Client PR**: `feat/cloud-functions`, merged as PR #17 (`aede278`,
   2026-10-04) and reverted the same day by PR #18 (`a2f7d35`), because
   saving a review at a 0.1-step rating such as 4.9 failed: the server
   accepted only half steps (see the rating-step note below). Re-landed
   on 2026-10-06 as PR #19 (`a673e8c`, branch
   `fix/cloud-functions-rating-steps`): `a76f9f6` reverts the revert (tree
   identical to `fc1fc93`, the head of `feat/cloud-functions`) and
   `7e21e34` adds the 0.1-step rating fix (see its note below).
   `firestore.rules` was identical to main, so `deploy-rules.yml` did not
   fire. Verified live by hand.
3. ✅ **Rules PR**: the rules commit `cc3e11b` (on local
   `feat/cloud-functions-rules`, backed up as
   `origin/feat/cloud-functions-rules-wip`), with `origin/main` merged in
   (`aa5b256`), pushed as `feat/rules-closure` and merged as PR #20
   (`08b5654`, 2026-10-06). It removed the `RULES_CLOSED` gate from
   `tests/cloud-functions.spec.js`, so the three closed-rule tests now run
   (C9 mark-collected, C8 direct create/decrement, C1 direct
   items/itemRecords writes). `deploy-rules.yml` published it and succeeded.
   The shipped branch is `feat/rules-closure` (`aa5b256`).
   `origin/feat/cloud-functions-rules` (`cc3e11b`) is stale: it holds only
   the rules commit and lacks the merge of `main`, so do not use it.

Then, separately: the role re-grant + dropping the hardcoded super-admin
UID (Outstanding #1/#2) — Ed's go-ahead required; re-grant Ed's own account
and a break-glass second admin first.

## Contract deviations (accepted)

- **Region is `europe-west2`, not `us-central1`** (Ed's decision,
  2026-10-04). The contract said "us-central1 (Firebase default), set no
  region". But production Firestore is in `europe-west2` (confirmed via
  `firestore:databases:get`), so default-region callables would make every
  transaction read/write cross the Atlantic. Pinned before the first deploy
  (nothing was ever deployed to us-central1): server once in
  `functions/shared.js` (`REGION` + the `onCall` export every callable uses),
  client in `src/services/firebase.js` (`getFunctions(app, 'europe-west2')`),
  and `scripts/cleanup-e2e-data.mjs` (the nightly cron's own client).
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
- **Rating step**: contract line 255 says `0.5..5, multiple of 0.5`; the
  shipped validator accepts 0.1 to 5 in 0.1 steps (`7e21e34`). The contract
  file was deliberately not edited.

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

### Rating step fix: `7e21e34` (PR #19)
The live rating sliders (`index.html` `#overallRating`,
`editReviewModal.js` `#editOverallRating`) move in 0.1 steps, but
`submitReview` / `updateReview` only accepted half steps, so saving at 4.9
failed with a generic toast and editing older reviews would have failed too.
`functions/reviews.js` `validateRating` now accepts 0.1 to 5 in 0.1 steps
(with a float tolerance) and stores the value rounded to one decimal place,
with the message "Overall rating must be between 0.1 and 5, in steps of
0.1." `src/services/functions.js` gains `serverMessage()`, which strips the
` [NNN]` HTTP status the Firebase client SDK appends to callable errors; the
add and edit flows show the server's message for rating errors, and an edit
at 0 is blocked with "Please give an overall rating", like the add flow.
Tests: 0.7, 1.1 and 4.9 accepted and stored exactly, 0, 5.1 and 3.35
rejected (`tests/cloud-functions.spec.js`); a UI save at 4.9
(`tests/add-review-flow.spec.js`); an edit of a 4.2 review without touching
the slider, and an edit at 0 blocked (`tests/edit-review.spec.js`). A
read-only audit of production `items` found all 56 reviews already on a 0.1
step between 0.1 and 5.
