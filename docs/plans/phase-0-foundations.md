# Phase 0 — Foundations

> Priority: P0 · Depends on: none · Spec: [docs/report.md](../report.md)
> Stack decision: Next.js 15 (App Router, TypeScript) + Convex backend/database + self-managed WebAuthn passkeys with JWT sessions.

## Goal

Establish the web-first application skeleton so every later phase builds on a consistent, CI-verified base: tooling, data model foundations, role-based access skeleton, and the app shell for all four surfaces.

## Deliverables

- Monorepo scaffold: Next.js 15 + Convex + TypeScript strict mode; ESLint/Prettier; Vitest + Playwright wired but minimal.
- GitHub Actions CI: lint, typecheck, test on every PR.
- Core Convex schema (structure only, no business logic):
  - `institutions`
  - `users` with role enum: `student | faculty | department_authority | admin | auditor` (spec §17)
  - `courses`, `sections`, `venues`, `timetable_slots`, `enrollments`
- RBAC middleware guarding `/student`, `/faculty`, `/admin`, `/audit` route groups.
- App shell: role-aware navigation, layout primitives, empty-state components for each surface.
- Demo-data seed script for local development.

## Exit Criteria

- [ ] CI green (lint + typecheck + tests) on the PR
- [ ] All four role route groups resolve and are access-guarded
- [ ] Schema definitions reviewed against spec §17 role model
- [ ] Preview deployment renders the shell for each role

## Out of Scope

Authentication ceremonies, device registration, sessions/QR, any attendance logic (Phases 1–3).
