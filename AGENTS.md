# AGENTS.md

## Deployed Website

- **Live site:** https://sannidhi-six.vercel.app/

## Workflow

- **Push clean code to GitHub after each subphase** — never leave work unpushed across a subphase boundary.
- **Never squash-and-merge** — always merge PRs with a regular merge commit.
- **Trigger Copilot and CodeRabbit reviews only once, just before merging** — do NOT request reviews after every commit or subphase. Only when all planned work for the phase/PR is implemented and locally verified (lint, typecheck, tests, build, e2e all green) and the PR is ready to merge, do both reviewers get called on the open PR:
  - **Copilot** — request via the API (`POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers` with `copilot-pull-request-reviewer[bot]`) or the PR UI.
  - **CodeRabbit needs a manual trigger** — this repo has fewer than 10 stars, so automatic CodeRabbit reviews are skipped; post `@coderabbitai review` as a PR comment.
  - Then wait for both reviews, address every finding in one fix pass, push, and re-request only if substantive changes remain unreviewed.
- **CodeRabbit manual-review caveats**
  - **Do not push while a triggered review is in progress** — a head-commit change aborts it ("Action not completed: Head commit changed"). Push first, then trigger.
  - **Incremental**: it will not re-review commits it already reviewed; only trigger when new commits exist since the last CodeRabbit review.
  - Success signal to look for: bot comment ending "Action performed: Review finished" plus a new review entry from `coderabbitai[bot]` pinned to the latest head commit.

## Available tooling

- **GitHub** — hosting, commits, PRs, and review comments (CodeRabbit + Copilot feedback arrives here).
- **Entire CLI** — enabled in this repo; tracks agent sessions as checkpoints with extra context and timing.
  - Run an `entire` command when you need to know what happened earlier or how much time was spent.
