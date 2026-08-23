# AGENTS.md

## Workflow

- **Push clean code to GitHub after each subphase** — never leave work unpushed across a subphase boundary.
- **After every commit, check for reviewer feedback**: CodeRabbit and GitHub Copilot post their reviews as comments on the commit/PR once it lands. Read and address that feedback before starting the next piece of work.
- **CodeRabbit needs a manual trigger** — this repo has fewer than 10 stars, so automatic CodeRabbit reviews are skipped ("Review skipped: manual review required for this OSS repository"). After pushing to an open PR, post `@coderabbitai review` as a PR comment to request its review, then wait for and address its findings alongside Copilot's.

## Available tooling

- **GitHub** — hosting, commits, PRs, and review comments (CodeRabbit + Copilot feedback arrives here).
- **Entire CLI** — enabled in this repo; tracks agent sessions as checkpoints with extra context and timing.
  - `entire status` — current repo/session state
  - `entire activity` / `entire recap` — activity overview and recent checkpoint summary
  - `entire checkpoint search` — inspect past checkpoints
  - Run an `entire` command when you need to know what happened earlier or how much time was spent.
