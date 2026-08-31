# Contract: <task name>

Status: DRAFT / FROZEN / SUPERSEDED
Frozen by: architect, <date>
Approved by: Ed, <date>

## What this task is
<1-2 sentences. What does the user-visible outcome look like when this is done?>

## File ownership (hard boundaries)
List every file either agent will touch. A file with two owners is a bug in
this contract — fix it before freezing, not after a merge conflict.

**Alongside this table, `architect` must also produce a machine-readable
twin**, `.claude/contracts/<task-slug>-ownership.json`, mapping each path to
its owner exactly as in the table below. This is what
`scripts/check-contract-conformance.mjs` actually reads — the markdown table
is for you to read, the JSON is what gets enforced. They must never disagree;
if you edit one, edit the other.

```json
{
  "src/services/xyz.js": "backend-lead",
  "src/pages/xyz.js": "frontend-lead",
  "index.html": "frontend-lead",
  "src/components/nav.js": "frontend-lead",
  "tests/xyz.spec.js": "qa-engineer"
}
```

| File / path | Owner | Notes |
|---|---|---|
| `src/services/xyz.js` | backend-lead | new file |
| `src/pages/xyz.js` | frontend-lead | new file |
| `index.html` | frontend-lead | adds one `<div id="page-xyz">` block, line range TBD |
| `src/components/nav.js` | frontend-lead | adds one showPage branch |
| `tests/xyz.spec.js` | qa-engineer | new file, not touched by builders |

**Shared files** (both may need to read; only the listed owner may write):
- `src/state/appState.js` — owner: backend-lead. If frontend-lead needs a new
  field exposed here, it requests it from backend-lead via the interface
  below, it does not edit the file itself.

## Interface contract (the actual frozen shape)
Concrete function signatures, Firestore document shapes, or data contracts —
whatever is the seam between the two sides. Be literal. This is the part that
prevents "I assumed the field was called `bakeryId`, you called it `id`."

```js
// example shape — replace with the real one
{
  reviewId: string,
  bakeryId: string,
  rating: number,      // 1-5
  createdAt: Timestamp
}
```

```js
// backend-lead exposes this; frontend-lead only calls it, never re-implements it
export async function submitReview(bakeryId: string, rating: number): Promise<void>
```

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

## What "done" looks like
- [ ] `check:dead-refs` clean
- [ ] `madge --circular src/` clean
- [ ] `npm run build` succeeds
- [ ] Full `test:e2e` green (qa-engineer's new coverage included)
- [ ] Contract's file-ownership table matches what was actually touched —
      if an agent needed to touch a file it didn't own, that's flagged to
      Ed, not silently done.
