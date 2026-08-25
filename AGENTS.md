# Sannidhi

## Adaptive Trust-Based Attendance Ecosystem

Sannidhi replaces manual classroom roll calls with an adaptive, tamper-evident attendance system. Instead of forcing every student through every verification check, the system combines multiple trust signals — identity, device trust, physical presence, and biometrics — and escalates verification only when evidence is weak or suspicious.

- **Normal students** check in quickly with minimal friction.
- **Suspicious attempts** receive stronger verification or faculty review.
- **Every decision** is recorded with an explainable evidence trail.

## Status

> **🚧 In Development** — Sannidhi is currently in active development. APIs, schemas, and UI are subject to change. Do not treat current behavior as stable or production-ready.

## Multi-surface

Sannidhi will have 3 key app surfaces: **web**, **desktop**, and **mobile**.

## A note from Sankalp

I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

## Deployed Website

- **Live site:** <https://sannidhi-six.vercel.app/>

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

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
