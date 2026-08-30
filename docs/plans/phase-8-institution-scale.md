> Priority: P3 · Depends on: Phase 6 · Spec: docs/report.md §11, §18, §20

## Goal

Institution-scale operations and integrations.

## Deliverables

- Multi-department administration with delegated policy scopes
- Venue-specific presence-rule configuration UI and verification thresholds — applied inside the Risk Decision implementation's policy layer, not scattered across surfaces (spec §20)
- SIS/LMS roster sync; SSO federation
- Richer compliance workflows, archival, multi-institution tenancy — retention policies enforced inside the Event Ledger

## Exit Criteria

- [x] Advanced policy controls per spec §11 live — sparse policy rows per institution/department/venue (anomaly threshold, step-up-on-weak-device, strict presence, geofence radius/margins, retention days), resolved through one pure policy seam and consumed inside `decide()` / `evaluateLocationConsistency()`; decisions stamp `risk-engine/v1+policy:N`
- [x] External roster sync validated against a sample dataset — `docs/samples/roster-sample.csv` applied through `/admin/courses` (preview → apply → idempotent re-preview), covering new departments, course updates, new sections, enrollments, and invites for unknown students

## Notes

- SSO federation is deferred until there is a real institutional IdP to integrate against; the roster-sync seam (pure parse/diff + one apply mutation) is the integration surface SSO would join.
- Retention now resolves per institution (policy `retentionDays`, clamped 30–3650) with the `SANNIDHI_RETENTION_DAYS` env fallback, enforced inside the ledger prune sweep.
