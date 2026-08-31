# Contract: Cloud Functions phase (C1, C3, C5, C8, C9)

Status: **DRAFT — architect recommends AGAINST parallelizing. Not frozen.**
Drafted by: architect, 2026-08-31
Approved by: — (awaiting Ed)

---

## ⛔ READ THIS FIRST — architect's verdict

**Do not run the four-agent team on this phase.** Recommended execution is
**single-agent, sequential, five commits, in the order C5 → C3 → C9 → C8 → C1**,
using the existing per-module workflow from CLAUDE.md (one closing full
`test:e2e` per commit, so a regression bisects to exactly one callable).

Everything below the verdict is still worth having: sections
**"Interface contract"**, **"Emulator story"**, **"Rules changes"** and
**"Hard constraints"** are the frozen spec for that work regardless of who
executes it. Only the *ownership* half of this document assumes a team.

### Why not

**1. There is a file neither owner can have.** `src/legacy-app.js` (1,302
lines) contains `saveReview()` (`:353`–`:502` — the entire client half of C1)
and `cancelReservation()` (`:1031`–`:1057` — C8's inverse, see §C8 note). It is
also the app bootstrap both sides depend on. Give it to frontend-lead and
frontend owns the `loadData({ mergeLocal: true })` reconcile, which is data-layer
logic. Give it to backend-lead and backend owns eight `getElementById()` reads
inside `saveReview()` plus the unrelated shop / feature-request / follows
surface that shares the file. The template says a file with two owners is a bug
in the contract; an *unassignable* file is the same bug one step earlier.

**2. The work is roughly 85 / 15.** Backend: `functions/` from scratch (this
repo has no `functions/` directory and no callable has ever been written here),
seven callables, a `firestore.rules` rewrite, four new `src/services/` modules,
`firebase.json` + `playwright.config.js` + CI emulator wiring. Frontend: delete
~200 lines across five files and replace them with ~11 awaited wrapper calls.
Even the cleanest sliceable subset (C3 + C5, see below) gives frontend-lead
**exactly one file**.

**3. The seam is a dependency, not a boundary.** frontend-lead cannot run,
click, or verify anything until the functions emulator is up and the callables
exist. There is nothing to build against in parallel — only something to wait
for. That is sequencing, not parallelism.

**4. The interface cannot be honestly frozen before the first function is
written.** The shapes in this document are my best judgement, but three of them
are decisions I would rather make *while* holding a working emulator: whether
the review photo upload stays client-side (§C1 says yes, and I am confident, but
it is a call about `httpsCallable` payload economics made on paper); whether the
optimistic-update path still needs `mergeLocal` once `createdAt` comes back from
the server; and whether custom auth claims (§C5) can be rolled out without
locking the existing admin out. Any of those being wrong forces a mid-build
contract amendment — which per `architect.md` is always Ed's decision, and which
stalls both agents while it is made.

**5. C1 is entangled with the exact race the project just spent a cycle
closing.** `saveReview()` → optimistic `allItems.unshift()` → `updateStats()` /
`renderRecentGrid()` → `loadData({ mergeLocal: true })` +
`loadItemRecords({ mergeLocal: true })` → `renderLeaderboard(lbCurrentTab)`.
That chain crosses `legacy-app.js` (unassignable), `src/state/appState.js`
(backend), and `src/pages/home.js` / `src/pages/leaderboard.js` (frontend) inside
one function. Phase 1 residual #3 was a dedicated fix to that race with its own
regression spec (`tests/data-reconcile.spec.js`). Moving the write server-side
changes that race's timing. Two agents editing opposite ends of it concurrently
is the most efficient way to re-open it.

### Two findings that change the scope as briefed

Both were discovered by reading the code, and both mean the task as described is
bigger than it looked. Flagging rather than absorbing, per my instructions.

- **C1 cannot stop at review submission.** `src/components/editReviewModal.js`
  also recomputes and writes `itemRecords` aggregates client-side —
  `updateDoc` at `:259`, `deleteDoc` at `:245`, plus `items` `updateDoc` at
  `:212` / `deleteDoc` at `:236`. If C1 locks `itemRecords` writes to
  functions-only (which is the entire point of C1), **the edit and delete
  review paths break.** So C1 must ship `updateReview` and `deleteReview`
  callables too, or the rules stay open and C1 fixes nothing. Specified below
  as **C1b**. Ed should confirm this expansion.
- **C8 cannot stop at reservation creation.** `cancelReservation()`
  (`legacy-app.js:1050`) writes `preorderOfferings.remaining` from the client.
  Locking `remaining` breaks cancellation. Specified below as **C8b** — which
  also fixes a real existing bug: cancel returns `remaining + 1` regardless of
  the reservation's actual `quantity`, so cancelling a 2× reservation leaks a
  unit of stock.

### If Ed overrules and wants the team run anyway

The only slice I am willing to freeze an ownership table for is **C3 + C5
(the admin operations)** — the only subset with zero `legacy-app.js`
involvement and a genuinely unambiguous file split. That is what
`.claude/contracts/cloud-functions-ownership.json` contains. It is provided for
the overrule case; I do not think it is warranted, because frontend-lead's
entire assignment in it is one file.

---

## What this task is

Move five security-sensitive operations out of the browser and into Firebase
Cloud Functions callables under a new, physically separate `functions/`
directory, then tighten `firestore.rules` so the client can no longer perform
them directly. When it is done nothing looks different to a user — but a review's
aggregate scores, a pre-order's stock count, a QR collection, a flag removal,
and a role grant can no longer be forged by anyone with a browser console.

---

## File ownership (hard boundaries)

### Table A — the full phase (informational; NOT enforced)

This is every file the phase touches, listed so the scope is visible. It is
**not** backed by an ownership.json, because of the unassignable row.

| File / path | Owner | Notes |
|---|---|---|
| `functions/package.json` | backend | new |
| `functions/package-lock.json` | backend | new, generated by `npm install` |
| `functions/.gitignore` | backend | new — must ignore `node_modules` |
| `functions/index.js` | backend | new — exports all seven callables |
| `functions/shared.js` | backend | new — auth/admin gate, validators, error helper |
| `functions/reviews.js` | backend | new — C1, C1b |
| `functions/moderation.js` | backend | new — C3 |
| `functions/roles.js` | backend | new — C5 |
| `functions/reservations.js` | backend | new — C8, C8b, C9 |
| `firestore.rules` | backend | rewrite — see "Rules changes" |
| `firebase.json` | backend | adds `functions` source + emulator port |
| `package.json` | backend | `emulators` script adds `,functions` |
| `playwright.config.js` | backend | emulator `--only` list + startup timeout |
| `.github/workflows/e2e.yml` | backend | adds `npm ci` in `functions/` |
| `.gitignore` | backend | `functions/node_modules` |
| `src/services/firebase.js` | backend | adds `getFunctions` + `connectFunctionsEmulator` |
| `src/services/functions.js` | backend | new — the single `httpsCallable` transport |
| `src/services/reviews.js` | backend | new — C1/C1b wrappers |
| `src/services/moderation.js` | backend | new — C3 wrappers |
| `src/services/roles.js` | backend | new — C5 wrappers |
| `src/services/reservations.js` | backend | new — C8/C8b/C9 wrappers |
| `src/state/appState.js` | backend | `loadData`/`loadItemRecords` `mergeLocal` may become unnecessary once `createdAt` is server-returned; frontend reads, never writes |
| `src/components/adminPanel.js` | frontend | C3 + C5 call sites (`:123`, `:136`, `:147`, `:210`, `:217`) |
| `src/components/bakeryModal.js` | frontend | C8 — `reserveOffering` (`:539`–`:571`) |
| `src/components/manageOfferingsModal.js` | frontend | C9 — `markCollected` (`:1074`) |
| `src/components/qrCode.js` | frontend | C9 — `confirmCollected` (`:205`) |
| `src/components/editReviewModal.js` | frontend | C1b — `saveEdit`/`deleteReview` (`:212`, `:236`, `:245`, `:259`) |
| `src/components/addReviewModal.js` | frontend | C1 — exports the state `saveReview()` reads |
| **`src/legacy-app.js`** | **UNASSIGNABLE** | **holds `saveReview()` (C1) and `cancelReservation()` (C8b). This row is why this table has no enforced twin — see the verdict.** |
| `tests/cloud-functions.spec.js` | qa | new, not touched by builders |
| `tests/seed-emulator.mjs` | qa | needs a seeded `business`-role user for C9 |
| `tests/cleanup.teardown.js` | qa | **must be re-checked** — it deletes `items`/`itemRecords` from the client (`:70`); locking those rules breaks the prod cleanup safety net |
| `scripts/cleanup-e2e-data.mjs` | qa | same problem (`:65`, `:72`) |

### Table B — the C3 + C5 admin slice (enforced; matches `cloud-functions-ownership.json`)

Only used if Ed overrules the verdict. Paths are **literal** —
`scripts/check-contract-conformance.mjs` does exact-string matching, not glob
matching, so a file created outside this list fails conformance even if it
"obviously belongs" to that owner. **If either lead needs a file not listed
here, it stops and flags to the orchestrator; it does not create it.**

| File / path | Owner | Notes |
|---|---|---|
| `functions/package.json` | backend-lead | new |
| `functions/package-lock.json` | backend-lead | new, generated |
| `functions/.gitignore` | backend-lead | new |
| `functions/index.js` | backend-lead | new |
| `functions/shared.js` | backend-lead | new |
| `functions/moderation.js` | backend-lead | new — C3 |
| `functions/roles.js` | backend-lead | new — C5 |
| `firestore.rules` | backend-lead | `flaggedReviews` + `userRoles` + `roleAudit` only |
| `firebase.json` | backend-lead | functions source + emulator port |
| `package.json` | backend-lead | `emulators` script |
| `playwright.config.js` | backend-lead | emulator `--only` + timeout |
| `.gitignore` | backend-lead | `functions/node_modules` |
| `.github/workflows/e2e.yml` | backend-lead | `npm ci` in `functions/` |
| `src/services/firebase.js` | backend-lead | `getFunctions` + emulator connect |
| `src/services/functions.js` | backend-lead | new |
| `src/services/moderation.js` | backend-lead | new |
| `src/services/roles.js` | backend-lead | new |
| `src/components/adminPanel.js` | frontend-lead | the whole frontend assignment |
| `tests/cloud-functions-admin.spec.js` | qa-engineer | new |
| `tests/seed-emulator.mjs` | qa-engineer | seed a second admin + a business user |

**Shared files** (both may read; only the listed owner may write):
- `src/state/appState.js` — owner: backend-lead. frontend-lead reads
  `isAdmin()` / `currentUser` / `SUPER_ADMIN_UID` from it as today. If
  frontend-lead needs a new field here, it requests it via the orchestrator.
- `src/services/*.js` — owner: backend-lead. frontend-lead imports the wrapper
  functions and calls them. It never re-implements the query behind one, and
  never calls `httpsCallable` itself.

---

## Interface contract (the actual frozen shape)

### Ground rules that apply to every callable

- **Region:** `us-central1` (Firebase default). Do not set a region on either
  side; if one side sets it and the other does not, every call 404s.
- **Nothing security-relevant comes from the payload.** Identity
  (`context.auth.uid`), display name, timestamps, prices, aggregate maths, and
  role checks are all derived server-side. If a field can be looked up from a
  document the server already has to read, it is not in the request shape.
- **Admin check is server-side and never trusts the client**: `uid ===
  SUPER_ADMIN_UID` OR `userRoles/{uid}.role === 'admin'`, read with the Admin
  SDK. Never `data.isAdmin`.
- **Timestamps cross the wire as ISO-8601 strings**, never as Firestore
  `Timestamp` objects — `httpsCallable` serializes to JSON and a `Timestamp`
  arrives as an unusable `{_seconds, _nanoseconds}` blob. Server writes
  `FieldValue.serverTimestamp()` to Firestore and returns `.toDate().toISOString()`
  to the client.
- **Errors** are always `functions.https.HttpsError(code, message, details)`.
  `code` is one of the standard set below; `details` carries a machine-readable
  `{ code: 'SCREAMING_SNAKE' }` for the cases the UI branches on. Wrappers
  re-throw as-is; the *calling UI* decides the toast text, not the service
  module.
- **Service wrappers under `src/services/` are pure transport.** They never
  import `appState.js`, never render, never call `showToast()`, never call
  `getAction()`. This keeps them leaves (`madge --circular` stays clean with no
  `getAction()` indirection needed anywhere in this phase) and keeps the "who
  shows the error" question from having two answers.

```js
// src/services/functions.js — the single transport, backend-lead owns it
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
export function callable(name) { /* returns (data) => Promise<result.data> */ }
```

---

### C1 — `submitReview`

Replaces `saveReview()`'s Firestore half (`legacy-app.js:380`–`:487`). The DOM
reads, validation messaging, optimistic update, modal close and toast all stay
client-side.

**Photo upload stays on the client.** The client uploads to Storage first, at
the existing path `items/{uid}/{Date.now()}_photo.jpg`, and passes the resulting
download URL. Reason: `httpsCallable` payloads are JSON — a multi-MB JPEG would
have to be base64'd (+33%) through a function invocation, and `storage.rules`
already scopes `items/{uid}/**` to that uid. **This is the single most likely
thing for two agents to assume differently; it is frozen here.**

```js
// request
{
  itemName: string,          // required, trimmed, 1..120
  bakeryName: string,        // required, trimmed, 1..160
  bakeryAddress: string,     // '' allowed
  bakeryPlaceId: string|null,
  bakeryLat: number|null,
  bakeryLng: number|null,
  category: string,          // required, must be a key of CATEGORY_TREE
  subCategory: string,       // '' allowed
  overallRating: number,     // required, 0.5..5, multiple of 0.5
  dims: { [dimKey: string]: number },  // keys must equal getTastingDims(category); each 0..5
  price: number|null,        // >= 0 when present
  notes: string,             // '' allowed, max 2000 chars
  photoURL: string|null,     // must be a download URL under items/{callerUid}/
  itemRecordId: string|null  // non-null => link to this existing itemRecord
}

// response
{
  itemId: string,
  itemRecordId: string,
  item: {                    // exactly the items/{itemId} doc as written
    itemRecordId, name, category, subCategory,
    bakeryName, bakeryAddress, bakeryPlaceId, bakeryLat, bakeryLng,
    price, overallRating, communityAvg, ratingCount, notes, photoURL,
    userId, userName, userPhoto,
    createdAt: string,       // ISO-8601, the real server value
    ...dims                  // flattened, one key per tasting dimension
  },
  itemRecord: {              // post-write aggregate, for the leaderboard
    id, name, category, subCategory, bakeryName,
    communityAvg: number, reviewCount: number,
    avgPrice: number|null, priceCount: number,
    ...dimAverages
  }
}

// errors
'unauthenticated'      — no context.auth
'invalid-argument'     — details: { field: string }
'not-found'            — itemRecordId given but no such doc
'resource-exhausted'   — details: { code: 'RATE_LIMITED' }, >10 reviews/hour/uid
'internal'
```

Server: the `itemRecords` upsert and the `items` create happen in **one
`runTransaction`**. `userId` / `userName` / `userPhoto` come from
`context.auth` + `profiles/{uid}`. `communityAvg` / `ratingCount` /
`reviewCount` / `avgPrice` / `priceCount` and every dim average are computed
server-side; the client's values for them are ignored if sent.

```js
// src/services/reviews.js — backend-lead exposes; frontend-lead only calls
export async function submitReview(payload)
  -> Promise<{ itemId, itemRecordId, item, itemRecord }>
```

**Reconcile note (the entangled bit).** `item.createdAt` comes back as the real
server timestamp, so `saveReview()`'s optimistic `allItems.unshift({ id: reviewRef.id,
...review, createdAt: new Date() })` becomes
`allItems.unshift(result.item)` — no fabricated date. Whether that removes the
need for `loadData({ mergeLocal: true })` is **an open question this contract
deliberately does not answer**; it must be decided with
`tests/data-reconcile.spec.js` running, not on paper. Until it is decided,
`mergeLocal` stays exactly as-is.

### C1b — `updateReview`, `deleteReview` (forced into scope; see verdict)

```js
// updateReview request
{ itemId: string, category: string, subCategory: string,
  overallRating: number, dims: {...}, price: number|null,
  notes: string, photoURL: string|null }
// response: { itemId, item: {...}, itemRecord: {...} }

// deleteReview request
{ itemId: string }
// response: { itemId, itemRecordId: string|null, itemRecordDeleted: boolean }

// errors (both): 'unauthenticated' | 'permission-denied' (not the review's
// author, and not an admin) | 'not-found' | 'invalid-argument'
```

Server recomputes the parent `itemRecord` aggregate in the same transaction, and
deletes the `itemRecord` when its `reviewCount` reaches 0 (matching what
`editReviewModal.js:245` does today).

```js
export async function updateReview(itemId, payload) -> Promise<{ itemId, item, itemRecord }>
export async function deleteReview(itemId) -> Promise<{ itemId, itemRecordId, itemRecordDeleted }>
```

---

### C3 — `moderateFlaggedReview`

Replaces `adminPanel.js` `removeReviewAndFlag()` (`:210`) and `dismissFlag()`
(`:217`). Currently broken from the client: `firestore.rules:80` only lets
`KTpBS4yJx2h8LpcryCTfJDFCHlr2` delete a `flaggedReviews` doc, and removal also
needs to delete another user's `items` doc, which `:38` forbids.

```js
// request
{ flagId: string, action: 'remove' | 'dismiss' }

// response
{ flagId: string, action: 'remove'|'dismiss', itemId: string|null, reviewDeleted: boolean }

// errors
'unauthenticated' | 'permission-denied' (caller is not an admin)
| 'not-found' (no such flag) | 'invalid-argument' (bad action)
```

Server: admin gate, then a batched write — delete `flaggedReviews/{flagId}`,
and for `'remove'` also delete `items/{flag.itemId}` and recompute that item's
parent `itemRecord` the same way C1b's delete does. Writes a `moderationLog`
audit doc (shape below).

```js
// src/services/moderation.js
export async function removeFlaggedReview(flagId) -> Promise<{ itemId, reviewDeleted }>
export async function dismissFlag(flagId)          -> Promise<{ flagId }>
```

```js
// moderationLog/{autoId} — new collection
{ flagId: string, itemId: string|null, action: 'remove'|'dismiss',
  actorUid: string, actorDisplayName: string, createdAt: Timestamp }
```

---

### C5 — `setUserRole`

Replaces `adminPanel.js` `promoteUser()` (`:123`), `promptAssignBakery()`
(`:136`), `removeUserRole()` (`:147`).

```js
// request
{ targetUid: string,
  role: 'admin' | 'business' | null,   // null = revoke
  bakeryName: string|null }            // required non-empty iff role === 'business';
                                       // must be null otherwise

// response
{ targetUid: string, role: string|null, bakeryName: string|null,
  auditId: string,
  claimsUpdated: boolean }   // true => the TARGET must call getIdToken(true)
                             // before their new role takes effect in rules

// errors
'unauthenticated'
| 'permission-denied'    — caller is not an admin
| 'invalid-argument'     — details: { field }
| 'not-found'            — no auth user with targetUid
| 'failed-precondition'  — details: { code: 'CANNOT_DEMOTE_SUPER_ADMIN' | 'CANNOT_DEMOTE_SELF' }
```

Server: admin gate; write `userRoles/{targetUid}` (or delete it when
`role === null`); write the audit doc; then
`admin.auth().setCustomUserClaims(targetUid, { role, bakeryName })`.

```js
// roleAudit/{autoId} — new collection
{ targetUid: string, targetDisplayName: string,
  previousRole: string|null, previousBakeryName: string|null,
  newRole: string|null,     newBakeryName: string|null,
  actorUid: string, actorDisplayName: string,
  createdAt: Timestamp }
```

```js
// src/services/roles.js
export async function grantAdmin(targetUid)                -> Promise<RoleResult>
export async function assignBakery(targetUid, bakeryName)  -> Promise<RoleResult>
export async function revokeRole(targetUid)                -> Promise<RoleResult>
```

⚠️ **Highest-risk item in this contract — the custom-claims rollout.** Custom
claims only reach a client's ID token on the *next token refresh*, which is why
the response carries `claimsUpdated`. That means:

- `firestore.rules` may **add** `request.auth.token.role == 'admin'` as a fast
  path, but **must keep** both the hardcoded `SUPER_ADMIN_UID` check and the
  existing `get(/userRoles/$(uid))` fallback until every current role-holder has
  been re-granted through this callable and confirmed. Dropping the fallback
  first locks the only admin out of their own admin panel, with no client-side
  way back in.
- Removing the hardcoded UID from `firestore.rules` and `appState.js` is
  therefore **a separate follow-up commit after C5 has been live and
  verified** — not part of C5. Ed should treat "stop hardcoding
  `KTpBS4yJx2h8LpcryCTfJDFCHlr2`" as the *goal* of C5, reached one commit later,
  not as C5's own diff.
- This also interacts with the existing backlog item in CLAUDE.md about never
  calling `getIdToken(true)` — the client has no proactive refresh today, so a
  freshly-granted admin may wait up to an hour. Handling that is out of scope
  here; note it, do not fix it inside C5.

---

### C8 — `createReservation`

Replaces `bakeryModal.js` `reserveOffering()` (`:539`–`:571`), whose
read-then-write on `remaining` (`:545` read, `:551` write) is the race, and
whose `price` / `totalPrice` are client-set.

```js
// request — deliberately just these two fields
{ offeringId: string, quantity: number }   // quantity: integer >= 1

// response
{ reservationId: string,
  reservation: {                 // exactly the reservations/{id} doc as written
    userId, userName, userEmail,
    bakeryName, offeringId, offeringName, slot, collectDate,
    quantity, status: 'pending',
    price: number, totalPrice: number,
    createdAt: string            // ISO-8601
  },
  remaining: number }            // the offering's remaining AFTER the decrement

// errors
'unauthenticated'
| 'invalid-argument'    — quantity not a positive integer
| 'not-found'           — offering missing, or active === false
| 'failed-precondition' — details.code is one of:
      'SOLD_OUT'                — remaining < quantity
      'OVER_MAX_PER_PERSON'     — quantity > offering.maxPerPerson
      'DUPLICATE_RESERVATION'   — caller already has a pending one for this offering
      'NOT_YET_LIVE'            — now < offering.goLiveAt
      'PAST_COLLECTION'         — offering.collectDate is in the past
```

Everything except `offeringId` and `quantity` is read from
`preorderOfferings/{offeringId}` server-side — `bakeryName`, `offeringName`,
`slot`, `collectDate`, and critically `price` (`totalPrice = price * quantity`,
computed on the server). The read of `remaining`, the precondition checks and
the decrement all happen inside **one `runTransaction`**, which is the actual
fix.

**Accepted residual, stated so nobody thinks it was missed:** the
`DUPLICATE_RESERVATION` check is a query, run immediately before the
transaction. Two simultaneous taps could therefore still create two
reservations — but stock stays correct, because the decrement is transactional.
Making the duplicate check race-free needs a deterministic doc id
(`${offeringId}_${uid}`), which breaks cancel-then-rebook. Not doing that.

### C8b — `cancelReservation` (forced into scope; see verdict)

```js
// request
{ reservationId: string }

// response
{ reservationId: string, status: 'cancelled', remaining: number|null }
                                    // null when the offering no longer exists

// errors
'unauthenticated'
| 'permission-denied'   — caller is neither the reservation's userId nor an admin
| 'not-found'
| 'failed-precondition' — details.code: 'WITHIN_CUTOFF' | 'ALREADY_COLLECTED' | 'ALREADY_CANCELLED'
```

Server: transaction — set `status: 'cancelled'`, and return
`reservation.quantity` units to `preorderOfferings.remaining`. The 12-hour
cutoff moves server-side (today it is enforced only in the browser, at
`legacy-app.js:1039`, and can simply be skipped).

🐛 **Fixes a real existing bug.** `legacy-app.js:1050` writes
`remaining: curr + 1` regardless of `reservation.quantity`, so cancelling a 2×
reservation permanently loses a unit of stock. The callable returns
`quantity`. Worth its own line in the commit message.

---

### C9 — `markReservationCollected`

Replaces `manageOfferingsModal.js` `markCollected()` (`:1074`). Today any
signed-in user can set any reservation to `collected` (`firestore.rules:144`
allows the reservation's own `userId` to update it) — so a customer can mark
their own order collected without ever visiting the bakery.

```js
// request
{ reservationId: string }

// response
{ reservationId: string, status: 'collected',
  collectedAt: string,          // ISO-8601, server value
  offeringName: string, bakeryName: string, userName: string }

// errors
'unauthenticated'
| 'permission-denied'   — caller is not an admin, and is not the business user
                          assigned to reservation.bakeryName
| 'not-found'
| 'failed-precondition' — details.code: 'ALREADY_COLLECTED' | 'CANCELLED'
```

Server: reads `userRoles/{callerUid}` and requires `role === 'admin'`, or
`role === 'business' && bakeryName === reservation.bakeryName`. This is the
whole point of C9 — the caller must be the *bakery* side, not the customer.

```js
// src/services/reservations.js
export async function createReservation(offeringId, quantity) -> Promise<CreateReservationResult>
export async function cancelReservation(reservationId)        -> Promise<CancelReservationResult>
export async function markReservationCollected(reservationId) -> Promise<MarkCollectedResult>
```

---

## Rules changes (`firestore.rules`)

Once a write moves behind a callable, the matching client rule must close —
otherwise the callable is a suggestion. The Admin SDK bypasses rules entirely,
so the functions keep working.

| Collection | Today | After | Gated by |
|---|---|---|---|
| `items` | `create: auth != null` | `create: false` | C1 |
| `items` | `update, delete: owner` | `update, delete: false` | C1b |
| `itemRecords` | `create/update/delete: auth != null` | all `false` | C1, C1b |
| `flaggedReviews` | `delete: SUPER_ADMIN_UID` | `delete: false` | C3 |
| `userRoles` | `write: SUPER_ADMIN_UID` | `write: false` | C5 |
| `roleAudit` | — (new) | `read: isAdmin()`, `write: false` | C5 |
| `moderationLog` | — (new) | `read: isAdmin()`, `write: false` | C3 |
| `preorderOfferings` | `update` allows any `hasOnly(['remaining'])` | drop the `remaining` clause; keep `createdBy` + super-admin | C8, C8b |
| `reservations` | `create: auth == request.resource.data.userId` | `create: false` | C8 |
| `reservations` | `update: owner or super-admin` | `update: false` | C8b, C9 |
| `reactions` | `targetUserId` still client-set | **unchanged — explicitly OUT OF SCOPE** | — |

Two things this breaks that must be handled in the same commits, not
discovered later:

1. **The E2E cleanup safety net.** `tests/cleanup.teardown.js:70` and
   `scripts/cleanup-e2e-data.mjs:65`/`:72` delete `items` and `itemRecords`
   from the client. Closing those rules makes both no-ops. Under the default
   emulator run that is harmless (the emulator is wiped by the next
   `globalSetup`), but `npm run test:e2e:prod` and the nightly cleanup cron
   both depend on it. Either route them through `deleteReview` (C1b) or
   accept that prod cleanup now needs the Admin SDK — a decision, not an
   oversight.
2. `firestore.rules:88` carries a `// left for the Cloud Functions phase`
   comment about binding `reactions.targetUserId` to the item's real owner.
   That is **not** one of the five operations Ed scoped. Leave the comment and
   the rule alone; do not opportunistically fix it.

---

## Emulator story

The functions emulator must join the existing Auth / Firestore / Storage set.
backend-lead owns every file below.

- **`firebase.json`** — add `"functions": { "source": "functions" }` at the top
  level and `"functions": { "port": 5001 }` under `"emulators"`.
- **`package.json`** — `emulators` script: `--only auth,firestore,storage`
  becomes `--only auth,firestore,storage,functions`.
- **`playwright.config.js`** — the `emulatorServers[0].command` `--only` list
  gains `,functions`, and its `timeout` goes from `60_000` to `120_000`. The
  functions emulator loads `functions/node_modules` at startup and is
  materially slower than the other three; the existing
  `url: 'http://127.0.0.1:4000'` readiness probe is still correct (the UI comes
  up once all emulators are ready), it just takes longer to get there.
- **`src/services/firebase.js`** — add `getFunctions` to the imports, create
  `const functions = getFunctions(app)`, add
  `connectFunctionsEmulator(functions, '127.0.0.1', 5001)` **inside the
  existing `if (import.meta.env.VITE_USE_EMULATOR)` block**, and export
  `functions` (also add it to `window._crumb` for consistency with the rest of
  that object). The emulator connect must stay inside that guard so Vite keeps
  stripping it from `dist/` — the shipped app must not try to reach localhost.
- **`.github/workflows/e2e.yml`** — add an `npm ci --prefix functions` step
  before the Playwright step. Without it CI's functions emulator starts with no
  dependencies and every callable 500s.
- **`.gitignore`** — `functions/node_modules/`.
- **`tests/seed-emulator.mjs`** (qa-engineer) — the seed needs a
  `business`-role user assigned to one of the three seeded bakeries, so C9's
  permission-denied path is testable rather than assumed.

---

## ⚠️ Pre-flight: delete `src/firebase.js` before this phase starts

`src/firebase.js` (53 lines) is a **dead, stale duplicate** of
`src/services/firebase.js`. Nothing imports it — `src/main.js:3` imports
`./services/firebase.js`, and it has not been touched since the initial
modularization commit (`8ef9dc6`). It is not in the module graph, so Vite never
bundles it.

It matters for *this* phase specifically because it lacks the
`if (import.meta.env.VITE_USE_EMULATOR)` block entirely. An agent that imports
the wrong `firebase.js` gets a client silently pointed at the **production**
project — the exact failure mode the emulator-only rule exists to prevent, in
the exact phase where four new service modules are being created next to it.

Recommend Ed delete it in a separate one-line commit before any work starts.
Not assigned to either lead here, deliberately: it must not land inside a
contract-scoped branch.

---

## Hard constraints (apply to every agent on this task)

- Firebase Emulator Suite only. No agent authenticates against or writes to
  the production Firebase project under any circumstance, including "just to
  check something." This project has a documented incident of E2E tests
  leaking data onto production (87 leaked reviews, 469 stuck reservations) —
  this rule exists because of that, not as a precaution.
- Every new cross-module reference goes through the existing `getAction()`
  delegated-action pattern (see `src/events/actions.js`), never a direct
  import that could create a cycle. Run `madge --circular src/` before
  reporting anything as done — this has been a recurring lesson in this repo.
- `showPage()` is the only way pages become visible. No new code should
  toggle `.page` / `.active` classes directly.
- No agent merges to `main`. Every agent works on its own branch; the
  orchestrator opens a PR from the *integration* branch once QA passes, and
  Ed gives the final merge approval — same as the existing single-agent flow.
- Kill any emulator processes and free any ports you opened before reporting
  done. A stale emulator holding port 8080 has already caused one confusing
  test-suite failure in this project.
- Never commit secrets. Firebase client config values are fine (they're
  public by design); API keys for third-party services (Stadia, Google
  Places, SMTP providers) are not.

### Additional constraints specific to this phase

- **Port 5001 joins the "free it before reporting done" list**, alongside
  9099 / 8080 / 9199 / 4000 / 5174.
- **Do not run `firebase deploy` or `firebase deploy --only functions`.**
  Deploying a callable to the live project is an outward-facing action and is
  Ed's alone. `.github/workflows/deploy-rules.yml` already auto-publishes
  `firestore.rules` / `storage.rules` on change to `main` — meaning the rules
  half of this phase ships the moment the PR merges. Say so in the PR body;
  do not surprise anyone with it.
- **A rules change is a schema change.** Every closed rule in the table above
  must be named explicitly in the reporting agent's summary, with the
  callable that replaces it.
- **`src/services/` modules stay pure transport** — no `appState` import, no
  rendering, no `showToast`. Restated here because it is the rule most likely
  to be eroded for convenience.

---

## What "done" looks like

- [ ] `check:dead-refs` clean
- [ ] `madge --circular src/` clean
- [ ] `npm run build` succeeds
- [ ] Full `test:e2e` green (qa-engineer's new coverage included)
- [ ] Contract's file-ownership table matches what was actually touched —
      if an agent needed to touch a file it didn't own, that's flagged to
      Ed, not silently done.

### Phase-specific additions

- [ ] Functions emulator starts as part of `npm run test:e2e` with no manual step
- [ ] Every closed Firestore rule has a passing negative test — a direct client
      write that is expected to be rejected, asserted as rejected
- [ ] `tests/data-reconcile.spec.js` still green (C1's race)
- [ ] `tests/reservations.spec.js`, `tests/manage-offerings.spec.js`,
      `tests/qr-scanner-baker.spec.js`, `tests/admin-panel.spec.js`,
      `tests/edit-review.spec.js`, `tests/add-review-flow.spec.js` still green
- [ ] `tests/cleanup.teardown.js` + `scripts/cleanup-e2e-data.mjs` re-verified
      against the new rules (see "Rules changes", note 1)
- [ ] Ports 5001 / 9099 / 8080 / 9199 / 4000 / 5174 all free
- [ ] Nothing was deployed
