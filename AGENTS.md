# AGENTS.md

## Workflow

- **Push clean code to GitHub after each subphase** — never leave work unpushed across a subphase boundary.
- **Never squash-and-merge** — always merge PRs with a regular merge commit (`gh pr merge --merge`, or `git merge --no-ff` locally). Squashing collapses the subphase commits into one blob and destroys the per-subphase history this workflow depends on.
- **After every commit, check for reviewer feedback**: CodeRabbit and GitHub Copilot post their reviews as comments on the commit/PR once it lands. Read and address that feedback before starting the next piece of work.

## Available tooling

- **GitHub** — hosting, commits, PRs, and review comments (CodeRabbit + Copilot feedback arrives here).
- **Entire CLI** — enabled in this repo; tracks agent sessions as checkpoints with extra context and timing.
  - `entire status` — current repo/session state
  - `entire activity` / `entire recap` — activity overview and recent checkpoint summary
  - `entire checkpoint search` — inspect past checkpoints
  - Run an `entire` command when you need to know what happened earlier or how much time was spent.
