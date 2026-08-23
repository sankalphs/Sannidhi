# Phase 1 — Identity, Passkeys & Device Enrollment

> Priority: P0 · Depends on: Phase 0 · Spec: [docs/report.md](../report.md) §4 (Enrollment & Identity), §17 (Roles)

## Goal

Establish the root of trust: institution-backed accounts, passkey authentication, approved-device registration with full lifecycle control, and the enrollment gate that must pass before any attendance verification is valid.

## Deliverables

- Admin-initiated account creation: CSV bulk import + single-use invite links.
- Self-managed WebAuthn passkey authentication:
  - Registration and assertion ceremonies via `@simplewebauthn/server` in Convex actions
  - Credential records per user; JWT session issue / refresh / revoke
- Approved personal-device registration tied to each student account.
- Device lifecycle state machine: `new → enrolled → active → suspended | revoked | replaced` (spec §4).
- Controlled device replacement/recovery flow: identity re-verification + new-device verification + auditable approval decision — no silent trust transfer (spec §4 policy note).
- Biometric consent capture UI with clear disclosure; face-enrollment stub storing template references only (no raw images; spec §16).
- Enrollment completion gate: attendance features locked until identity + device checks succeed.

## Exit Criteria

- [ ] Student completes account → passkey → device enrollment end-to-end
- [ ] Passkey login issues a valid session; revocation kills access
- [ ] Device replacement requires verification and produces an audit entry
- [ ] Locked students cannot reach check-in surfaces
