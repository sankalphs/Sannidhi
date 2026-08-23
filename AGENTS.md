# AGENTS.md

## Workflow

- **Push clean code to GitHub after each subphase** — never leave work unpushed across a subphase boundary.
- **Never squash-and-merge** — always merge PRs with a regular merge commit (`gh pr merge --merge`, or `git merge --no-ff` locally). Squashing collapses the subphase commits into one blob and destroys the per-subphase history this workflow depends on.
- **Trigger reviews once, when implementation is complete** — do NOT request reviews after every commit. Only when all planned work for the phase/PR is implemented and locally verified (lint, typecheck, tests, build, e2e all green) do both reviewers get called on the open PR:
  - **Copilot** — request via the API (`POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers` with `copilot-pull-request-reviewer[bot]`) or the PR UI.
  - **CodeRabbit needs a manual trigger** — this repo has fewer than 10 stars, so automatic CodeRabbit reviews are skipped; post `@coderabbitai review` as a PR comment.
  - Then wait for both reviews, address every finding in one fix pass, push, and re-request only if substantive changes remain unreviewed.
- **Interpreting CodeRabbit's messages**
  - **"Review skipped: manual review required for this OSS repository"** appears on the CodeRabbit *check run* after every push. It refers to the *automatic* pipeline only, is always present for this repo, and is harmless — it does NOT mean a manual review failed.
  - **`@coderabbitai review` (PR comment)** actually triggers the manual review. The bot replies either "Action performed: Review finished" (success — findings land as PR comments) or "Action not completed" with a reason.
- **CodeRabbit manual-review caveats**
  - **Do not push while a triggered review is in progress** — a head-commit change aborts it ("Action not completed: Head commit changed"). Push first, then trigger.
  - **Incremental**: it will not re-review commits it already reviewed; only trigger when new commits exist since the last CodeRabbit review.
  - **Rate limit**: the Pro Plus plan allows roughly 1 included review per hour ("0 remain after this review"). If a fresh trigger is refused or silently skipped shortly after one, wait out the window and re-trigger.
  - Success signal to look for: bot comment ending "Action performed: Review finished" plus a new review entry from `coderabbitai[bot]` pinned to the latest head commit.

## Available tooling

- **GitHub** — hosting, commits, PRs, and review comments (CodeRabbit + Copilot feedback arrives here).
- **Entire CLI** — enabled in this repo; tracks agent sessions as checkpoints with extra context and timing.
  - `entire status` — current repo/session state
  - `entire activity` / `entire recap` — activity overview and recent checkpoint summary
  - `entire checkpoint search` — inspect past checkpoints
  - Run an `entire` command when you need to know what happened earlier or how much time was spent.
