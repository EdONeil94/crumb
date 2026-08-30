# Residual #3 — `loadData()` unawaited reconcile race: diagnosis & proposed fix

Status: **IMPLEMENTED 2026-08-30 (commit `04e504f`).** All four §7 questions
resolved as recommended: Leaderboard folded into Part B; Part C's opt-in
`mergeLocal` merge (not the alternative); `loadItemRecords` sibling race
fixed the same way; test workarounds kept with updated comments. See
`docs/extraction-log.md` for the implementation write-up and
`tests/data-reconcile.spec.js` for the regression coverage. This document
is kept as the decision record.

Context: the 32-step carving plan plus residuals #1 (`showPage` → `nav.js`)
and #2 (`loadData`/`loadProfiles`/`buildBakeryIndex` + `exploreCache` →
`appState.js`) are done. This is the last open item from CLAUDE.md's
"Known pre-existing issues" — the only one that is a genuine **behavior
change**, not a relocation, so it gets more scrutiny, not the
"verify-identical-behavior" bar.

---

## 1. The reconcile logic, exactly

`loadData()` lives in `src/state/appState.js:101‑119`:

```js
export async function loadData() {
  if (!fb) return;
  const { db, collection, getDocs, query, orderBy, limit } = fb;
  try {
    const q = query(collection(db, 'items'));
    const snap = await getDocs(q);
    allItems = snap.docs                          // ← wholesale reassignment
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => { /* createdAt desc */ });
    getAction('renderRecentGrid')();
    getAction('updateStats')();
  } catch (e) { console.log('Data load error …', e.message); }
}
```

Two structural facts drive the bug:

- **It replaces, never merges.** `allItems = snap.docs.map(…)` throws away
  whatever was in `allItems` and substitutes the server snapshot verbatim.
- **It re-renders only two things** — `renderRecentGrid` (the home grid) and
  `updateStats` (the hero counters). It does **not** rebuild `allBakeries`
  (`buildBakeryIndex()`), and it does **not** touch the Bakeries page, the
  Leaderboard, or the Settings → Business section.

### The six call sites

| # | Caller | Form | Awaited? |
|---|---|---|---|
| 1 | `legacy-app.js:192` `initFirebaseApp()` auth listener | `loadData();` | **no** |
| 2 | `legacy-app.js:442` `saveReview()` reconcile | `loadData();` | **no** |
| 3 | `legacy-app.js:662` `runCategoryMigration()` | `await loadData();` | yes |
| 4 | `adminPanel.js:221` `removeReviewAndFlag()` | `await loadData();` | yes |
| 5 | `editReviewModal.js:215` `saveEdit()` | `await loadData();` | yes |
| 6 | `editReviewModal.js:272` `deleteReview()` | `await loadData();` | yes |

Only **#1 (startup)** and **#2 (`saveReview`)** are unawaited — and those
are exactly the two race manifestations. #3–#6 are awaited modal-close
flows and are not implicated.

---

## 2. What "unawaited" means, concretely

### Site #1 — `initFirebaseApp` (`legacy-app.js:160‑199`)

```js
onAuthStateChanged(auth, async (user) => {
  setCurrentUser(user); …
  if (user) { await ensureProfileExists(user); await loadUserRole(); await loadFollows(); … }
  updateNav();          // ← #navAvatar becomes visible here
  loadData();           // ← line 192: bare call, no await, nothing chained
  loadProfiles();
  loadItemRecords();
  loadBakeryProfiles();
  loadProducts();
});
```

`loadData()` returns a promise that nobody holds. The callback resolves;
`updateNav()` has already made `#navAvatar` visible. There is **no signal
anywhere that "initial data is ready"** — the test suite has had to invent
one (`#recentGrid .card`, `loadData`'s first post-await side effect via
`renderRecentGrid`).

### Site #2 — `saveReview` (`legacy-app.js:425‑443`)

```js
const reviewRef = await addDoc(collection(db, 'items'), review);   // write confirmed, real id
allItems.unshift({ id: reviewRef.id, ...review, createdAt: new Date() });  // optimistic
updateStats(); renderRecentGrid();          // card appears at front of #recentGrid
…
loadData();                                  // ← line 442: fire-and-forget reconcile
loadItemRecords().then(() => renderLeaderboard(lbCurrentTab));   // separate chain
```

---

## 3. The three manifestations — exact sequences

### Manifestation 1 — Bakeries page permanently empty (startup race)

*(CLAUDE.md "Known pre-existing issues" → first bullet)*

1. Auth resolves → `updateNav()` shows `#navAvatar`.
2. `loadData()` fires (site #1), kicks off `getDocs(items)` — a network
   round-trip, `allItems` still `[]`.
3. User (or a fast test) clicks **Bakeries**. `nav.js:206` →
   `renderBakeries()` → `buildBakeryIndex()` iterates `allItems` —
   **empty** — so `allBakeries = {}`.
4. `renderBakeries()` renders the **`"No bakeries found"` empty-state
   HTML** into `#bakeriesGrid`.
5. `loadData()`'s `getDocs` resolves → `allItems = [...]` → it calls
   `renderRecentGrid()` + `updateStats()`. **It does not call
   `renderBakeries()`.**
6. `#bakeriesGrid` keeps the empty state **forever** — until a reload or a
   fresh `showPage('bakeries')`. `renderBakeries()` runs exactly once per
   nav; nothing re-triggers it.

Root cause: `loadData()` under-renders (refreshes only `#recentGrid`, not
the currently-visible page) **and** `allBakeries` is a derived view of
`allItems` that nothing keeps in sync with it.

### Manifestation 2 — just-saved review vanishes from the home page (write reconcile race)

*(CLAUDE.md → second bullet; `tests/utils/reviews.js:57‑74`)*

1. `saveReview`: `addDoc` succeeds, returns `reviewRef.id`.
2. Optimistic `allItems.unshift({ id: reviewRef.id, … })` +
   `renderRecentGrid()` → **card visible at front.**
3. `loadData()` fires (site #2). Its `getDocs(items)` hits the server.
4. **Firestore eventual consistency:** a server `getDocs` issued
   microseconds after the client's own `addDoc` can momentarily return a
   snapshot that doesn't include the new doc yet (documented as "seen once
   in practice — not guaranteed-impossible even for the writer's own
   client").
5. `loadData()` does `allItems = snap.docs.map(…)` — **replaces** the array
   with the server's version, **missing the just-saved review**.
6. `loadData()` calls `renderRecentGrid()` → repaints `#recentGrid` from
   the stale list → **the card disappears.**
7. Nothing re-fires. Gone until a reload (which lets wall-clock time pass so
   consistency catches up). `tests/utils/reviews.js` compensates with a
   reload-and-retry.

Root cause: **`loadData()` blindly overwrites `allItems`, discarding local
state the server read hasn't caught up to.** Note the identical shape one
line down at `loadData` sibling `loadItemRecords()` (`saveReview:443`),
which can drop the optimistically-`push`ed new `itemRecord` the same way.

### Manifestation 3 — Settings → Business shows "No bakeries assigned yet" for an admin

*(CLAUDE.md → third bullet)* — CLAUDE.md flags this as a **different root
cause: "not a timing race, a genuinely missing call."**

`businessBakeryManagement.js` `renderBusinessSection()` does
`isAdmin() ? Object.keys(allBakeries) : …`. `allBakeries` is only ever
populated by `buildBakeryIndex()`, which is only called as a **side
effect** of visiting Bakeries / a bakery profile / the leaderboard / the
admin bakeries tab. Go straight to Settings on a fresh session →
`allBakeries` is `{}` → empty section, regardless of how much data exists.
No waiting fixes it.

It's the **same underlying gap as M1** — `allBakeries` derived-state is
never maintained centrally — just with no race component.

---

## 4. Blast radius

### UI / state that would visibly change once fixed

| Change | Visible effect |
|---|---|
| `loadData()` rebuilds `allBakeries` | Bakeries page fills in after startup even on fast nav; Settings → Business populates for admins on a cold session; bakery leaderboard / admin bakeries tab never show a transient empty state |
| `loadData()` re-renders the active data page | Bakeries (and, if extended, Leaderboard) page repaints itself when the startup fetch lands, instead of staying empty |
| `saveReview`'s reconcile stops dropping the optimistic entry | Just-saved card never flickers out |

All three are strictly *more correct*. No feature loses behavior.

### Does anything rely on the buggy (race-losing) behavior?

- **No production code.** Every reader of `allBakeries` (`renderBakeries`,
  `renderBakeryLeaderboard`, `openBakeryProfile`, `renderAdminBakeriesHTML`)
  already calls `buildBakeryIndex()` itself first — adding a call inside
  `loadData()` is redundant-but-harmless for them, not a conflict.
- **`deleteReview` / `removeReviewAndFlag` depend on the full-replace
  behavior** to *drop* a deleted item. The merge fix must be **opt-in**
  (default = today's replace) so these are untouched. `edit-review.spec.js:130`
  (`toHaveCount(0)` after delete) is the canary that proves this.

### Specs that pass *despite* / *around* the bug

| Spec / helper | Current workaround | After fix |
|---|---|---|
| `tests/utils/reviews.js` `addReview()` (`:67‑74`) | reload-and-retry if the just-saved card doesn't appear | The `try` succeeds first time; the `catch`/reload becomes **dormant dead code**. Harmless as a safety net; optionally remove. |
| `tests/utils/preorders.js` `openFirstBakeryProfile()` (`:16‑37`) | waits for `#recentGrid .card` before navigating to Bakeries | Still a valid "app ready" gate; the *reason* (permanent empty state) is gone. Leave it; update the comment. |
| `tests/bakery-profile-management.spec.js:57` | calls `openFirstBakeryProfile()` purely to populate `allBakeries` before checking Settings → Business | Becomes unnecessary (startup `loadData` populates it). Leave it (also serves as app-ready wait); update the `:50‑56` comment. |
| `tests/bakery-search.spec.js:20‑25` | same `#recentGrid .card` wait, commented | same as above |

**No spec breaks.** No spec *asserts* the buggy outcome (empty Bakeries
page, missing card, empty Business section) — they all either wait past it
or work around it. One spec (`bakery-profile-management.spec.js:49`)
currently *runs* only because its explicit workaround populates
`allBakeries`; after the fix it runs for the same reason plus the fix — no
skip/run change.

### Non-obvious safety checks (all clear)

- **Mid-test re-render:** every Bakeries-page spec waits for
  `#recentGrid .card` (= `loadData` done) *before* navigating to Bakeries,
  so `loadData`'s re-render fires before the test is on that page.
  `loadData` doesn't re-fire on navigation — only on auth/write/admin
  actions.
- **Cost of `buildBakeryIndex()` in `loadData()`:** O(items +
  bakeries·exploreCacheCities), sub-millisecond for this app's data volume;
  `loadData` is not a hot path.
- **`appState.js` stays a leaf:** re-rendering the active page goes through
  `getAction('renderBakeries')()` (already registered, `bakeries.js:201`) —
  no import of a page module, no cycle. `madge --circular` will confirm.

---

## 5. Proposed fix

Three parts. Parts A+B together are CLAUDE.md's own three suggested
directions combined; Part C is the merge.

### Part A — `loadData()` maintains the `allItems → allBakeries` invariant

Inside `loadData()`, immediately after `allItems = …`, call
`buildBakeryIndex()`.

**Why correct, not cosmetic:** `allBakeries` is a *pure derived
projection* of `allItems` (group by `bakeryName`, sum scores, backfill
coords). The bug is that this projection is recomputed lazily and
incidentally by whichever page happens to need it. Making the one function
that mutates `allItems` also refresh its projection establishes the
invariant "`allBakeries` is never stale w.r.t. `allItems`" at the single
source of truth. This alone **fully fixes Manifestation 3** (no timing
involved — `renderBusinessSection` just needs `allBakeries` non-empty after
startup) and is the prerequisite for B's page re-render.

### Part B — `loadData()` re-renders whichever data page is active

Add a small helper called at the end of `loadData()`:

```
active = the #page-* element with .active
  page-bakeries    → getAction('renderBakeries')()
  page-leaderboard → getAction('refreshLeaderboard')()   // same-bug extension, see below
```

This mirrors the pattern `loadProfiles()` **already uses**
(`appState.js:129‑130`: "re-render People page if visible"). **Fixes
Manifestation 1**: when the startup fetch lands, the page the user is
looking at repaints with real data instead of staying frozen on the empty
state.

- `renderBakeries` is already a registered action — no new plumbing.
- **Leaderboard is the identical bug, not separately documented**
  (fast-nav to Leaderboard at startup → same permanent empty). Covering it
  needs a 4-line zero-arg `refreshLeaderboard()` export in `leaderboard.js`
  (it already has the exact
  `lbCurrentMode === 'bakeries' ? renderBakeryLeaderboard() : renderLeaderboard(lbCurrentTab)`
  logic duplicated in two places) + registering it. Recommend including it
  for consistency; can leave it out to keep the change to the documented
  case.
- People/rankings has a *related* smaller gap (`loadProfiles` re-renders
  the members view but not rankings, which reads `allItems`). Leave that
  out of this fix and note it — it's `loadProfiles`, not `loadData`, and
  lower impact.

### Part C — an opt-in merge so the `saveReview` reconcile can't drop the optimistic entry

```
loadData({ mergeLocal = false } = {})
  … fetch `fresh` (sorted) …
  if (mergeLocal) {
    pending  = allItems.filter(i => !fresh has i.id)   // local rows the snapshot lacks
    allItems = [...pending, ...fresh]                  // pending = just-written = newest, goes first
  } else {
    allItems = fresh                                   // ← unchanged: today's exact behavior
  }
```

`saveReview` calls `loadData({ mergeLocal: true })`; **nothing else
changes** (default `false`).

**Why this is correct, not "an await somewhere":**

1. **`mergeLocal` has exactly one caller** — `saveReview`, running
   synchronously after a *confirmed* `addDoc` (we hold `reviewRef.id`). In
   that window the only "local row absent from the server snapshot" is the
   review just written. It genuinely exists on the server; keeping it is
   correct.
2. **The classic merge hazard — resurrecting a row another client just
   deleted — cannot arise here.** The pending row is brand-new, owned by
   the current user, confirmed microseconds ago. `saveReview` and
   `deleteReview` are sequential modal flows, not concurrent.
3. **Every other call path keeps today's semantics exactly.**
   `deleteReview` / `removeReviewAndFlag` *must* full-replace to drop the
   deleted row — a merge would keep it forever. Default `false` preserves
   that. (`edit-review.spec.js:130` is the regression canary.)
4. **Converges:** the next plain `loadData()` (next auth event, admin
   action, edit, delete, or reload) runs with `mergeLocal:false` once the
   server has caught up and `pending` is empty — no permanent divergence.
5. **Sort stays correct** without touching `saveReview`'s optimistic
   `new Date()` value: `pending` rows are the newest thing that exists, so
   prepending them to the already-sorted `fresh` array is right — and it
   sidesteps the existing latent quirk that a raw `Date` sorts to `0` under
   `loadData`'s `toMillis?.() || seconds || 0` comparator.

**Alternative to Part C** (simpler, slightly more behavior change): drop
`loadData()` from `saveReview` entirely — the optimistic `unshift` +
`updateStats` + `renderRecentGrid` already fully cover `allItems`/stats for
the writer, and aggregates come from the separate
`loadItemRecords().then(renderLeaderboard)` chain. Cost: no passive pickup
of *other* users' reviews on save (but nothing refreshes `allItems` on
navigation today either, so this is consistent with existing behavior).
Lean toward **Part C** — it keeps the intended passive-refresh benefit
while removing the race — but the drop-it option is defensible and
lower-surface.

**Sibling issue:** `loadItemRecords()` at `saveReview:443` has the
identical replace-race shape for the new `itemRecord` optimistically
`push`ed at `saveReview:398`. Same 5-line `mergeLocal` treatment applies
with the same correctness argument. Recommend including it; it's one line
down from the bug in scope.

---

## 6. What would NOT change

- The awaited call sites (#3–#6) — not implicated, and `deleteReview`
  specifically needs the replace.
- The scattered `buildBakeryIndex()` calls in `renderBakeries` /
  `renderBakeryLeaderboard` / `openBakeryProfile` / `renderAdminBakeriesHTML`
  — idempotent, cheap, harmless defense-in-depth. Removing them is a
  separate refactor with its own risk surface.
- `saveEdit`'s lack of an optimistic `allItems` patch (a
  *stale-field-until-next-load* possibility, distinct from the vanish bug)
  — out of scope for "the reconcile race."

---

## 7. Open questions

1. **Leaderboard extension** — fold the identical-shape Leaderboard fix
   into Part B (recommended), or keep this change strictly to the
   documented Bakeries case?
2. **Part C vs. its alternative** — opt-in `mergeLocal` merge
   (recommended), or just remove `loadData()` from `saveReview`
   altogether?
3. **`loadItemRecords` sibling race** at `saveReview:443` — fix it in the
   same pass (same mechanism), or leave it as a separately-tracked item?
4. **Test workarounds** — leave the now-dormant `reviews.js` retry /
   `preorders.js` wait / `bakery-profile-management.js` pre-visit in place
   with updated comments (recommended), or strip them?
