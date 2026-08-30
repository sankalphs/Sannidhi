# Sannidhi

**Adaptive Trust-Based Attendance Ecosystem**

## What is this project?

Sannidhi replaces manual classroom roll calls with an adaptive, tamper-evident attendance system. Instead of forcing every student through every verification check, the system combines multiple trust signals — identity, device trust, physical presence, and optional biometrics — and escalates verification only when evidence is weak or suspicious.

- **Normal students** check in quickly with minimal friction.
- **Suspicious attempts** receive stronger verification or faculty review.
- **Every decision** is recorded with an explainable evidence trail.

Full specification: [docs/report.md](docs/report.md)

## Planned Features

### Student
- Passkey-based enrollment and fast check-in
- Attendance history (calendar & subject-wise) with attendance projection
- Leave/on-duty requests and correction requests
- Alerts: absences, threshold warnings, verification challenges
- Device management with controlled replacement flow

### Faculty
- One-tap session start from scheduled class
- Rotating QR session challenges (anti-screenshot, anti-replay)
- Live verification board with reason codes
- Random spot re-checks and manual verification/override with audit
- Correction-request inbox; offline capture with later sync

### Administration
- User, course, timetable, venue, and policy management
- Flagged-attempt review, proxy-pattern analytics, reports & exports
- Device approval/replacement administration
- Retention, biometric-consent, and correction policy controls

### Verification Core
- Risk engine fusing identity + device + presence signals into **Accept / Step-up / Flag / Reject** decisions
- Step-up liveness & face match only when risk demands it
- Tamper-evident append-only event history with auditable corrections

## Architecture

Five deep modules anchor the design. Surfaces build on these interfaces only — thresholds, signing, hash-chaining, and reconciliation stay hidden inside the implementations. Rationale and seam rules: [docs/report.md](docs/report.md) §20.

| Module | Interface surfaces consume | Hidden inside |
| --- | --- | --- |
| Risk Decision | signals → Decision: Accept / Step-up / Flag / Reject + evidence summary + reason codes | thresholds, signal weights, policy versioning |
| Session Challenge | `mint(session)` · `redeem(challenge, context)` | signing keys, rotation window, nonce store, replay detection |
| Event Ledger | `append(event)` · `history()` · `verifyChain()` | hash chain, correction linkage, retention |
| Sync | same ledger append seam, events tagged by origin | offline/mobile reconciliation rules |
| Presence Evidence | normalized evidence shape fed to Risk Decision | Wi-Fi/BLE/location adapters (added when a second source lands) |

Guiding rule: every attendance state change enters through the Event Ledger's single append seam, and no surface re-fuses trust signals — decision logic exists once, behind the Risk Decision interface.

## Delivery Plan

Web app first (students, faculty, admin), native mobile apps in a later phase reusing the same APIs.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Foundations: repo, CI/CD, data model, auth skeleton | Merged |
| 1 | Identity enrollment, passkeys, device registration, RBAC | Merged (PR #11) |
| 2 | Sessions & rotating QR check-in | Merged (PR #12) |
| 3 | Device trust, presence signals, risk decision engine | Merged (PR #15) |
| 4 | Adaptive step-up security (liveness, face match, spot checks) | Merged (PR #20) |
| 5 | Tamper-evident audit, corrections, offline resilience | Merged (PR #23) |
| 6 | Analytics & insights | Merged (PR #24) |
| 7 | Native mobile applications | Not started |
| 8 | Institution scale: multi-department, integrations | In review |

## Status

> **Phase 8 in review** — institution-scale operations. Multi-department administration is real: a `departments` table scopes `users` (authorities cover one or more departments) and `courses`, and the department console (`/admin/policies`) creates, renames, and links them. The risk engine's policy layer is now configurable per institution → department → venue (sparse `policy_rows` with a per-institution revision counter): anomaly flag threshold, step-up-on-weak-device, strict presence (location mismatch escalates to faculty review), geofence radius/margins, and audit retention days — resolved by one pure seam (`src/lib/risk/policy.ts` + `resolvePolicySettings`) and consumed inside `decide()`/`evaluateLocationConsistency()`, never scattered across surfaces. Decisions stamp their policy revision into `policyVersion` (`risk-engine/v1+policy:N`). Every decision path — check-in, manual verify, step-up, spot re-check, offline sync — resolves the session's policy before deciding. Retention is enforced inside the Event Ledger's daily sweep with per-institution cutoffs (`resolveRetentionDays`, env `SANNIDHI_RETENTION_DAYS` fallback). SIS/LMS roster sync: a pure core (`src/lib/roster/`) parses CSV, computes a create/update/invite diff against the catalog snapshot, and `applyRosterSync` materializes departments, courses, sections, enrollments, and invites in one idempotent pass — validated against `docs/samples/roster-sample.csv` from `/admin/courses` (preview → apply → re-preview shows zero creates). Department authorities get read-only policy views scoped to their departments. SSO federation is deferred to a real IdP integration in a later pass.

## Previous milestones

## Previous milestones

> **Phase 6 merged (PR #24)** — analytics & insights for investigation and early intervention. A pure analytics core (`src/lib/analytics/`) projects the Event Ledger's own records into attendance trajectories (percentage, trend, must-attend math reusing `summarizeAttendance`), subject-level trends with late-arrival counting, proxy-attempt summaries over reason codes, and rolling daily/weekly/monthly report windows — no direct row access anywhere, and every anomaly alert carries explainable factors. A daily `scanReviewAlerts` cron (plus an admin-triggered `triggerScan`) derives `low_attendance`, `proxy_attempt`, and `verification_anomaly` alerts into a `review_alerts` inbox served to admins and department authority; resolving an alert is acknowledge-or-dismiss with a ledger-stamped trail, and nothing ever acts on a student automatically. Surfaces: `/admin/analytics` (stat cards, trajectory table, subject trends, proxy/verification-anomaly panels), `/admin/review` (the inbox with live convex sync), and `/admin/reports` (rolling windows with hand-rolled CSV/PDF exports — zero new dependencies). The demo seed now backfills a full 12-week term — 48 closed sessions with 84 hash-chained attendance events replicating the exact seam math, self-verified at seed time — so trajectories, tardiness, proxy dashboards, and exports all render against realistic history without touching the seeded live slot or e2e resume flows.
>

## Local development

Prerequisites: [bun](https://bun.sh) 1.2+.

```sh
bun install
```

Start the Convex backend once to generate `convex/_generated` and create `.env.local` with the anonymous local backend URL:

```sh
bunx convex dev --once
```

Add a session signing secret to `.env.local` (at least 16 characters locally):

```sh
SESSION_SECRET=<random string of at least 16 bytes>
```

Rotating `SESSION_SECRET` signs out every user and invalidates any unscanned QR
challenge tokens — do it deliberately, never casually.

Run the app:

```sh
bun run dev
```

Setting `ENABLE_DEV_LOGIN=1` in `.env.local` enables the role switcher on `/login`.

For public demo deployments (including production), `ENABLE_DEMO_LOGIN=1` exposes the same
persona picker to visitors with seeded data. Keep it off for real institutional deployments —
demo sessions carry full role authority. The Convex deployment also needs `SANNIDHI_DEMO_MODE=1`
plus seeded demo data (`bun run seed`) for student and faculty personas to resolve.

Seed demo data against a running Convex backend:

```sh
bun run seed
```

### Scripts

| Script | Purpose |
| --- | --- |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript, no emit |
| `bun run test` | Vitest unit tests |
| `bun run test:e2e` | Playwright end-to-end tests |
| `bun run format` | Prettier write |
| `bun run format:check` | Prettier check |
| `bun run build` | Production build |
