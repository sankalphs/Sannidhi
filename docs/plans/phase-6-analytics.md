> Priority: P2 · Depends on: Phase 5 · Spec: docs/report.md §15

## Goal

Intelligence for investigation and early intervention — never automatic punishment.

## Deliverables

- Analytics read Event Ledger projections only — no direct row access, no side-channel mutations (spec §20)
- Attendance trajectory analysis against institutional thresholds
- Subject-level and student-level absenteeism + tardiness trends
- Proxy-attempt and verification-anomaly dashboards with explainable risk factors drawn from Decision evidence summaries
- Flagged-review inbox for department authority and admin
- Daily/weekly/monthly reports plus CSV/PDF compliance exports

## Exit Criteria

- [x] Early-warning alerts route into a human-review workflow
- [x] Exports render correctly for a full term of demo data
