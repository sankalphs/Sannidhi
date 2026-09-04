> Priority: P3 · Depends on: Phases 1–5 · Spec: docs/report.md §3, §7, §20

## Goal

Native apps unlock trust signals the web cannot provide — and make the Presence Evidence seam real.

## Deliverables

- React Native (Expo) client reusing Convex APIs and shared TypeScript types
- BLE/Wi-Fi classroom proximity proof — fills the Phase 3 web gap and supplies the second presence adapter, turning the Presence Evidence seam from hypothetical to real (spec §20)
- Device integrity attestation: Play Integrity (Android) / App Attest (iOS)
- Push notifications: absences, threshold warnings, challenges, correction updates
- Platform biometrics integration; passkey portability across platforms
- Mobile-originated events enter the same ledger append seam tagged `origin=mobile` — no native-side write pathway or reconciliation dialect

## Exit Criteria

- [ ] Check-in parity with web flows
- [ ] Proximity evidence consumed by the same Risk Decision interface as web attempts
