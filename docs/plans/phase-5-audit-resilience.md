> Priority: P1 · Depends on: Phase 3 · Spec: docs/report.md §12–§14, §20 (System Architecture)

## Goal

Tamper-evident history, controlled corrections, and resilient operation under failure — every write through the Event Ledger's single append seam.

## Deliverables

- Append-only attendance_events with hash-chain linking so unauthorized alteration is detectable; integrity exposed once as `verifyChain()`, not re-checked by each reader
- Explicit 10-state attendance lifecycle enforced in mutations (Initiated → Corrected)
- Correction workflow: student dispute → routed to recording faculty → decision → new correction event referencing the original; history is never rewritten
- Offline capture as another writer, not a subsystem (spec §20): pre-authorized session bundle on faculty device, signed queued events entering the same ledger append seam tagged `origin=offline-faculty`; duplicate/replay reconciliation lives inside the ledger/challenge implementations — no parallel sync dialect
- Failure handling per spec §13: pending states, no silent absences, server-time authority over device clocks enforced inside the ledger
- Retention/deletion cron jobs per institutional policy, implemented inside the Event Ledger

## Exit Criteria

- [ ] verifyChain passes across a term of mixed-origin events
- [x] Offline-created events reconcile cleanly through the same seam
- [ ] Original events remain available after corrections
