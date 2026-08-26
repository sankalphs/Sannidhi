> Priority: P1 · Depends on: Phase 3 · Spec: docs/report.md §7, §20 (System Architecture)

## Goal

Targeted biometric step-up only when risk demands it — requested through Risk Decision
outcomes, never mandatory for every session.

## Deliverables

- Liveness + face-match challenge using on-device embeddings compared against enrolled
  template (no raw images at rest); challenges requested via the Risk Decision interface's
  Step-up outcome, not ad-hoc by surfaces
- Faculty-triggered random spot re-checks during active sessions (anti scan-and-leave) —
  re-enter the same decide() seam instead of bypassing it
- Manual override workflow with mandatory reason + full audit entry recorded through the
  Event Ledger seam
- Non-biometric step-up fallback when camera verification is unavailable

## Exit Criteria

- [x] Step-up fires only on elevated risk (engine weakness ladder unchanged; person signals
      only enter through challenge completion, never the fast path)
- [x] Photo/video spoof simulation flagged (`person_spoof_suspected` → Flag; static-frame
      captures classify below `LIVENESS_MOTION_FLOOR`)
- [x] Overrides land as append-only ledger events with actor, reason, and policy context
      (`attendance.manual_verified` carries reason + decision + policyVersion)
- [x] Spec §7 photo-spoof and scan-and-leave protections live (spot re-checks expire into
      flagged events via `missedSpotRecheck` anomaly)

## Implementation notes

- `src/lib/biometry/` — pure embedding/liveness/matching math (24×24 grayscale grid,
  cosine similarity); capture glue in `src/components/biometry/face-capture.tsx`. Frames
  never leave the device; only a 576-dim vector travels.
- Templates stored server-side in `biometric_records.faceEmbedding` (version-stamped
  `faceembed/v1`), compared server-side so trust decisions stay authoritative.
- `verification_challenges` table drives both `checkin_stepup` and `spot_recheck` flows;
  all attendance state changes still enter through `appendAttendanceEvent`.
- Person signal rules in the engine: failed → Flag (`person_spoof_suspected` /
  `person_face_mismatch`), weak → Step-up contributor, missing/unavailable → ignored
  (consent optional).
- Non-biometric fallback: camera-unavailable students escalate to faculty review
  (spec §13 permits manual verification); passkey-based fallback deferred.
- New ledger types: `attendance.stepup_requested|completed|escalated`,
  `attendance.spot_recheck_requested|result`; embeddings never logged.
