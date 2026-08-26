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
| 5 | Tamper-evident audit, corrections, offline resilience | Not started |
| 6 | Analytics & insights | Not started |
| 7 | Native mobile applications | Not started |
| 8 | Institution scale: multi-department, integrations | Not started |

## Status

> **Phase 4 merged (PR #20)** — adaptive step-up security is live. When the risk engine's Step-up outcome fires (weak device/location signals), check-in no longer dead-ends: a `verification_challenges`-backed challenge asks the student to confirm with an on-device face scan — frames are read in-browser, reduced to a 576-dim embedding, checked for liveness via inter-frame motion, and only the numbers travel; the server compares against the consented, version-stamped template (`faceembed/v1`) and re-enters the same `decide()` seam with a `person` signal. Static presentations classify as `person_spoof_suspected` and flag for faculty; mismatches flag with `person_face_mismatch`; inconclusive captures consume limited attempts. Camera-unavailable students escalate to faculty review (spec §13). Faculty can also fire targeted or random spot re-checks against verified students (anti scan-and-leave): the student dashboard surfaces the request live, non-responses expire into flagged events through a `missedSpotRecheck` anomaly, and the board gains a Challenged bucket with countdowns. Manual override stays reason-gated and lands as policy-stamped append-only ledger events. Face enrollment replaced its stub: consent + capture flow on the devices page stores only the numeric template, withdrawable anytime.
>
> **Phase 3 merged (PR #15)** — the Risk Decision deep module (`decide(signals) → Decision` behind `src/lib/risk/`) fuses identity passkey sessions, registered-device trust state, the redeemed QR session challenge, and consented geolocation (supporting evidence only, venue-geofence consistency with accuracy margins) into Accept / Step-up / Flag / Reject verdicts. Thresholds, weakness weighting, anomaly escalation (3+ security failures in 10 minutes), and policy-version stamping (`risk-engine/v1`) stay hidden inside the module; student check-in and faculty manual verification both enter through it. Decisions persist through the Event Ledger append seam — including rejected attempts for replay/wrong-session, which now survive the transaction — and power tiered explanations: student guidance, faculty reason codes on the live board, and the admin/auditor event-ledger viewer with full evidence trails plus chain verification. Check-in attempts are rate-limited (5 per minute).

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
