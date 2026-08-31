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
| **C9** `markReservationCollected` | (this commit) | ✅ done |
| **C8 / C8b** `createReservation` / `cancelReservation` | — | ⬜ not started (server draft exists, unwired) |
| **C1 / C1b** `submitReview` / `updateReview` / `deleteReview` | — | ⬜ not started (server draft exists, unwired) |

Server drafts for C8/C8b/C1/C1b were written ahead of the sequential
workflow and sit untracked in the tree (`functions/reviews.js`,
`functions/reservations.js` had all three reservation callables, `functions/tasting.js`).
Treat them as unverified starting points, not finished work — read critically
at each item's turn. `functions/reservations.js` was trimmed to C9-only when
C9 landed; C8/C8b get re-added there.

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
3. **Fully close the `reservations` update rule to `false`.** C9 only blocked
   the `status:'collected'` transition; the owner keeps update access for
   client-side cancellation until C8b moves that server-side. C8b closes it.
4. **Close `items` / `itemRecords` write rules.** Gated by C1 / C1b — not yet
   started.
5. **Re-verify `tests/cleanup.teardown.js` + `scripts/cleanup-e2e-data.mjs`**
   against the closed `items` / `itemRecords` rules (contract "Rules changes"
   note 1) — they delete those collections from the client. Do this with C1/C1b.
6. **Emulator teardown bug (found during C3 verification, 2026-08-31).**
   Playwright's teardown doesn't kill the Firestore emulator's Java child
   process — it reparents to PID 1 and keeps port 8080, breaking the *next*
   `npx playwright test` run in the same session with "port taken". A clean
   `npm run test:e2e` from a fresh shell is unaffected. Fix belongs in
   `playwright.config.js`'s emulator `webServer` teardown. Low priority,
   not a blocker, but should be fixed before the phase closes.

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
