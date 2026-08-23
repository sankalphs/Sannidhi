# Phase 2 — Attendance Sessions & Rotating QR Check-in

> Priority: P0 · Depends on: Phase 1 · Spec: [docs/report.md](../report.md) §8 (Sessions & Rotating QR), §9 (Student Experience), §20 (System Architecture)

## Goal

Deliver the core attendance loop: faculty starts a session from the timetable, a rotating anti-replay challenge is published, students check in, and everyone sees live results.

## Deliverables

- Faculty one-tap session start from the scheduled class; guest/extra-class session creation (spec §10).
- Session Challenge module behind a two-verb interface (spec §20): `mint(session)` on publish, `redeem(challenge, context)` at check-in — signing keys, rotation window, nonce store, and duplicate-use detection stay inside the module; session and check-in surfaces never touch them directly:
  - Short TTL, refreshed frequently
  - Bound to course + section + class session + venue + validity window
  - One-time nonce consumed by the first successful use
- Convex cron sweep expiring stale challenges; reuse of expired/consumed challenges recorded as security events through the Event Ledger seam (spec §8).
- Session lifecycle controls: pause / close / restart without mutating historical records.
- Student check-in flow: scan → submit → immediate outcome screen with actionable guidance.
- Student attendance history: calendar view + subject-wise view distinguishing verified / flagged / pending; attendance threshold projection (spec §9).
- Live verification board v1 using Convex real-time subscriptions: verified / pending lists updating in place.

## Exit Criteria

- [ ] Simulated classroom-scale check-in completes under 2s p95
- [ ] Screenshot/replay of an old QR is rejected and logged as a security event
- [ ] Nonce cannot be redeemed twice
- [ ] Nonce store, signer, and rotation logic reachable only through mint/redeem — no direct queries from surfaces
- [ ] Pause/close/restart leaves prior records untouched
