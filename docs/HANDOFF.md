# Sannidhi — handoff

Snapshot: 2026-11-05 (UTC), after the worker restart.
Designated branch `claude/keen-thompson-2zi2ug`, head `01fcff5` (pushed).

## State of the work

| Phase | Result |
| --- | --- |
| 1 — production cutover | Merged as PR #35 (main `6769e78`). Demo seed and persona login removed; gated fixtures; operator bootstrap commands; venue and timetable admin. |
| 2 — adversarial hardening | Merged as PR #36 (main `551bab7`). 40 fixes from audits and multi-role break testing. Local e2e 64/64. |
| 3 round 1 | PR #37 open, head `01fcff5`, 33 commits. CI `verify` green. Local e2e 64/64 on the earlier head; the last commit was checked by the analytics spec only (6/6), so the full suite has not been re-run on `01fcff5`. |
| 3 round 2 | Started; the agents hit the 5-hour rate limit (reset 12:50 UTC) and stopped partway. Not merged. |

## Ratings so far

- QA run on the Phase 1 build: 5/10.
- Rater 1 on the Phase 2 build: 6/10.
- Rater 2 on round 1: never completed (rate limit).

Round 1 addressed most rater items: trust copy and the location rule, the ledger, dark mode, honest error text, invite removal, 375px layouts, and length caps.

## Round 2 — unfinished worktrees

Worktrees live under `scratchpad/`. Each one is a branch that can be inspected and finished.

| Worktree | Branch | Committed | Uncommitted (review before touching) |
| --- | --- | --- | --- |
| wt4-dash | p3r2-dash | 3 commits, last `72f804c` "move the hash-chain walker into src/lib" — mid-refactor | none |
| wt4-history | p3r2-history | 3 commits, through `c23448f` "add a Past sessions page" | `src/lib/attendance/timezone.ts`, `tests/timezone-minutes.test.ts` |
| wt4-scale | p3r2-scale | 3 commits, through `12e62d3` "explain blocked activation…" | `src/app/(admin)/admin/devices/page.tsx` |

Work still to do in round 2, from the rater's list:

1. **Dashboards** (wt4-dash): student at-a-glance numbers, admin stats row, auditor chain status. Confirm the chain-walker refactor builds before using it.
2. **Faculty past sessions** (wt4-history): finish, check that the closed-session roster page works for old sessions, and link it from today's page.
3. **Admin at scale** (wt4-scale): user search, filter and paging; per-student report totals in the CSV and PDF exports; honest device confirmation.

Each branch should go through the same checks before a merge:

```bash
bunx tsc --noEmit && bunx tsc --noEmit -p convex
bunx eslint . && bunx prettier --check .
bunx vitest run
```

## Still open after round 2

- Rater 2 has not scored round 1 yet.
- The 375px layout gaps in folders the layout agent could not edit (faculty, audit, admin users). Their user-text cells still need the `cell-wrap` class.
- Manual-verify and review-note inputs on the faculty pages need `maxLength={1000}`.
- The QR token is about 380 characters, which makes a dense code.
- Department authorities still see institution-wide analytics. Scope it to their departments.
- Sidebar in light mode: the code keeps the dark-green sidebar, deliberately. Decide whether to move light mode onto the `--sidebar` tokens too.
- Tests missing for the new Convex functions (`users.removeInvitedUser`, `ledger.listAttendanceRecords`); the repo has no Convex test harness.
- A removed user still appears by id in old ledger events. The ledger falls back to the stored email.

## Deploy checklist (production)

1. Convex env: set `SANNIDHI_OPERATOR_EMAILS` to the people who review onboarding requests. Never set `SANNIDHI_TEST_FIXTURES` in production.
2. The token-type change signs everyone out once. Deploy Convex together with, or after, the Next app: `bun run build` deploys both.
3. Existing exemption requests filed before round 1 have no session and show only in admin review. Clear any still open.
4. Production setup is in the README, "Production setup".

## Local environment notes

- Nothing is running. The worker restart stopped the Convex dev processes and the dev servers.
- Worktrees need a real `bun install --frozen-lockfile`. A `node_modules` symlink breaks Turbopack.
- Never commit `.next-types/`, `.env.local` or `node_modules`.
- `playwright.local.config.ts` is in `.git/info/exclude`. It points Playwright at `/opt/pw-browsers/chromium`. Recreate it in a fresh environment: copy `playwright.config.ts` and set `use.launchOptions.executablePath`.
- Second backends used during the work: ports 3310/3311 (Phase 2), 3410/3411 (rating). Use `npx convex dev --local-cloud-port <port> --local-site-port <port+1>`. Set `SANNIDHI_TEST_FIXTURES=1` and `SANNIDHI_OPERATOR_EMAILS=ananya.iyer@sit.edu.in` on each.
- Background agents used `CONVEX_DEPLOYMENT` in `.env.local`, which is gitignored.

## Next steps, in order

1. Confirm PR #37 CI is still green on `01fcff5`. Then run the full local e2e on that head, and merge it with a regular merge commit.
2. Re-run round 2 in the three worktrees, one at a time, starting with dashboards.
3. Restart the rater for round 2 from a clean environment.
4. Decide the two open product questions above: light-mode sidebar, and department-scoped analytics.
