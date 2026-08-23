# AGENTS.md

## Workflow

- **Push clean code to GitHub after each subphase** — never leave work unpushed across a subphase boundary.
- **After every commit, check for reviewer feedback**: CodeRabbit and GitHub Copilot post their reviews as comments on the commit/PR once it lands. Read and address that feedback before starting the next piece of work.
- **CodeRabbit needs a manual trigger** — this repo has fewer than 10 stars, so automatic CodeRabbit reviews are skipped. After pushing to an open PR, post `@coderabbitai review` as a PR comment to request its review, then wait for and address its findings alongside Copilot's. Know the two messages apart:
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
