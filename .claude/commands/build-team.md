Read `CLAUDE.md` and check whether `.claude/contracts/` contains an existing
contract for the task the user just described. If not, spawn the `architect`
subagent alone to draft one at `.claude/contracts/<task-slug>-contract.md`,
using `.claude/CONTRACT_TEMPLATE.md` as the base.

Present the drafted contract to the user in full. **Do not proceed past this
point without an explicit approval message from the user.** A contract that
hasn't been read and approved is not frozen, no matter what its status field
says.

Once approved, set up isolation before spawning anyone:
1. Create two worktrees off the current branch:
   `git worktree add ../crumb-<task-slug>-backend -b <task-slug>-backend` and
   the frontend equivalent.
2. Place the `settings.local.json` architect drafted into each worktree's
   `.claude/` directory — backend's worktree gets the deny list for
   frontend's paths, and vice versa.
3. Sanity-check layer 2 actually works: attempt one throwaway edit from
   inside a worktree to a path in its own deny list and confirm it's
   rejected, not just discouraged. If it isn't, note that layer 2 is not
   providing real protection this run and rely on layer 3 alone.

Spawn `backend-lead` and `frontend-lead` in parallel, each running inside its
own worktree directory, each with the approved contract as required reading
before it does anything else.

Once both report done, before merging anything: run
`node scripts/check-contract-conformance.mjs <ownership.json> backend-lead main <task-slug>-backend`
and the equivalent for frontend-lead. **A conformance failure here is a hard
stop** — report the specific out-of-scope files to Ed rather than merging
around the problem or asking the offending agent to "just fix it," since a
contract violation is exactly the situation the architect's mid-build
tie-breaking process (see `architect.md`) exists for.

Once both branches pass conformance, merge them locally into an integration
branch (`<task-slug>-integration`), remove the two worktrees
(`git worktree remove`), and spawn `qa-engineer` against that integration
branch.

Once `qa-engineer` reports full pass, open a PR from the integration branch
following the project's normal PR conventions (the same verification-then-PR
pattern used for single-agent work), and report back to the user for final
review and merge approval. Do not merge anything yourself under any
circumstance — merge approval is always the user's, whether the work was
done by one agent or four.

If at any point `architect` recommends against parallelizing the task, or a
lead flags that the contract's file ownership doesn't match reality, stop and
surface that to the user rather than pushing forward.
