# Adaptive Trust-Based Attendance Ecosystem

> **Updated Features & System Requirements Report**
> Version 1 | 23 August 2026
> v1.0 (17 August 2026): initial requirements · v1.1 (23 August 2026): added §20 System Architecture — modules & seams

## Design Direction

Use multiple independent trust signals, but escalate verification only when the evidence is insufficient. The goal is a tamper-evident, low-friction attendance system rather than a system that forces every student through every check at every class.

This report intentionally excludes implementation technologies and focuses only on updated product features, security behavior, operational workflows, data handling, and system requirements.

## 1. Executive Summary

The attendance ecosystem replaces manual roll calls with an adaptive verification process that combines identity, device trust, physical presence, and person verification. Instead of requiring all checks for every student, the system evaluates available signals and escalates only when the evidence is weak or suspicious.

The redesigned system is centered around five principles: strong identity, verified device ownership, classroom presence, optional biometric confirmation, and tamper-evident records. An attendance event is treated as a decision with evidence, not simply as a database flag.

> **Core product promise:** A normal student should be able to complete attendance quickly with low friction, while suspicious or anomalous attempts receive stronger verification and, when necessary, faculty review.

## 2. Product Objectives

- Prevent common proxy-attendance methods such as QR sharing, screenshots, device substitution, remote check-in, and replay.
- Keep routine check-in fast enough for large classrooms and avoid making biometric verification mandatory for every session.
- Provide explainable outcomes so students and faculty can understand why an attendance attempt was accepted, challenged, flagged, or rejected.
- Preserve the original attendance history while allowing controlled corrections through append-only correction events.
- Provide resilient operation during network outages, device failures, sensor failures, and legitimate account or device changes.
- Minimize collection and retention of biometric and sensitive attendance information.

## 3. Updated Ecosystem

| Surface | Primary responsibilities |
| --- | --- |
| Student Experience | Enrollment, check-in, attendance history, leave/on-duty requests, correction requests, alerts, attendance projection. |
| Faculty Experience | Session control, live verification board, spot re-checks, manual review, overrides, corrections, offline capture. |
| Administration | Policy configuration, user and academic data management, reporting, audit review, device approvals, analytics. |
| Verification Core | Session validation, signal evaluation, risk scoring, step-up challenges, final attendance decision. |
| Audit & Policy Layer | Append-only events, correction history, access records, retention rules, institutional policies. |

## 4. Enrollment & Identity Management

Enrollment is the root of trust. The system must establish the student identity before any attendance verification is considered valid.

- Institution-backed student account creation and identity verification.
- Passkey-based enrollment as the primary student authentication method.
- Secure registration of an approved personal device for attendance use.
- Optional face enrollment for systems that enable biometric step-up verification.
- Enrollment completion only after the required identity, device, and person checks succeed.
- Explicit consent and clear disclosure for any biometric collection or processing.
- Device lifecycle states: new, enrolled, active, suspended, revoked, and replaced.

> **Device replacement policy:** A lost, replaced, or reset device should not silently become a new trusted device. Replacement requires a controlled recovery flow with identity verification, new-device verification, and an auditable approval decision.

## 5. Adaptive Verification Model

Attendance verification is organized into four independent evidence categories. Each category answers a different trust question.

| Evidence category | Question answered | Typical signals |
| --- | --- | --- |
| Identity | Who is requesting attendance? | Institutional identity, passkey. |
| Device | Is the request coming from a trusted device and legitimate application state? | Device binding, device integrity, enrolled-device status. |
| Presence | Is the requester physically present in the intended class environment? | Rotating session QR, classroom proximity, Wi-Fi/BLE presence, optional location evidence. |
| Person | Is the actual enrolled student present? | Liveness and face match when step-up verification is required. |

### 5.1 Standard verification path

1. Student authenticates using the enrolled identity mechanism.
2. Student joins the active class session using a short-lived rotating session challenge.
3. The system evaluates device trust and classroom proximity.
4. Signals are fused into a trust/risk decision.
5. Low-risk attempts are accepted without unnecessary biometric steps.
6. Suspicious attempts receive one or more step-up challenges.
7. High-risk or unresolved attempts move to faculty review instead of being silently marked absent.

## 6. Risk & Step-Up Decision Engine

The risk engine is the central improvement over a fixed multi-factor pipeline. It should evaluate signals together, record the evidence used for the decision, and choose the minimum verification required.

| Decision state | Meaning | System action |
| --- | --- | --- |
| Accept | Evidence is sufficiently consistent. | Record verified attendance and preserve evidence summary. |
| Step-up | One or more signals are weak or inconsistent. | Request an additional verification challenge. |
| Flag | The attempt is suspicious but not conclusively fraudulent. | Hold for faculty review and retain the evidence trail. |
| Reject | Evidence strongly indicates invalid or replayed attendance. | Do not record verified attendance; show reason and retain security event. |

### 6.1 Explainable decisions

- Every decision must contain an evidence summary rather than only a numeric score.
- The student view should show a simple outcome and actionable guidance, not sensitive security details.
- The faculty view should show the verification factors that caused a challenge or flag.
- Administrative audit views should preserve the complete decision trail and policy version used.

## 7. Anti-Proxy & Anti-Replay Features

| Threat | Updated protection |
| --- | --- |
| QR screenshot or sharing | Short-lived, signed session challenge with one-time nonce and class/session binding. |
| QR replay | Server-side session expiry, nonce consumption, duplicate-use detection, and session-state validation. |
| Remote proxy attendance | Classroom proximity proof plus device and identity checks; suspicious mismatches trigger step-up. |
| Device substitution | Registered device trust with a controlled replacement workflow. |
| Photo/video spoofing | Liveness plus face match only when biometric step-up is required. |
| Mock or manipulated location | Location treated as supporting evidence, with consistency checks rather than sole reliance. |
| Rooted/emulated/tampered app state | Device/application integrity checks and risk escalation. |
| Scan-and-leave behavior | Random faculty-triggered spot re-check during an active class session. |
| Repeated suspicious attempts | Rate limits, anomaly tracking, session-level flags, and review workflow. |

## 8. Session & Rotating QR Features

- Faculty starts an attendance session from the scheduled class.
- The session produces a rotating challenge that changes frequently and cannot be reused indefinitely.
- The challenge is bound to the specific course, section, class session, venue, and validity window.
- A successful attendance attempt consumes the relevant one-time nonce.
- Reusing an expired or already-consumed challenge becomes a security event.
- Faculty can temporarily pause, close, or restart a session without changing historical attendance records.

## 9. Student Experience Features

| Feature area | Updated behavior |
| --- | --- |
| Fast check-in | Simple primary action. Routine sessions should avoid unnecessary biometric steps. |
| Attendance history | Calendar and subject-wise views showing verified, flagged, overridden, and pending records. |
| Attendance projection | Show current percentage plus classes that may be missed or must be attended to stay above the institution threshold. |
| Leave / on-duty | Submit requests with documents, track status, and view decision history. |
| Correction request | Dispute an incorrect attendance mark; request is routed to the faculty who recorded the event. |
| Alerts | Absent notification, threshold warning, verification challenge, correction updates, and session-related notices. |
| Device management | View enrolled-device status and follow controlled replacement/recovery flow. |

## 10. Faculty Experience Features

- One-tap start from the scheduled class with clear session status.
- Live verification board separating verified, pending, challenged, failed, and flagged students.
- Visible reason codes for failed or challenged attempts.
- Random spot re-checks that can be triggered during class to discourage scan-and-leave behavior.
- Manual verification workflow for legitimate failures such as dead battery, camera failure, or sensor problems.
- Manual override only with a mandatory reason and full audit entry.
- Correction-request inbox and decision history.
- Guest and extra-class session creation.
- Offline capture that queues signed events for later synchronization.

## 11. Administration & Policy Features

- Manage students, faculty, courses, sections, venues, timetables, and attendance policies.
- Configure venue-specific presence rules and verification thresholds.
- Approve or revoke device replacements and exceptional access.
- Review flagged verification attempts and proxy-attempt patterns.
- Monitor department, section, subject, tardiness, and attendance trends.
- Generate daily, weekly, and monthly reports and compliance-oriented exports.
- Manage retention, deletion, notification, biometric, and correction policies at the institution level.
- View audit history and verify that historical records remain internally consistent.

## 12. Tamper-Evident Attendance & Correction Model

Attendance records should be treated as immutable events. Corrections should create new events rather than editing or deleting the original event.

| Event | Example |
| --- | --- |
| Original attendance | Student marked absent at 10:32 based on the session decision. |
| Correction request | Student submits a dispute with reason and supporting evidence. |
| Review decision | Authorized faculty reviews the request and records the decision. |
| Correction event | A new event changes the attendance state while preserving the original event. |
| Audit record | Actor, time, reason, previous state, new state, and policy context are retained. |

> **Important security property:** The objective is tamper evidence. Unauthorized alteration should be detectable, while legitimate corrections remain possible through signed, attributable, append-only events.

## 13. Resilience & Failure Handling

| Failure condition | Required behavior |
| --- | --- |
| Network unavailable | Allow controlled offline capture using a pre-authorized class session; synchronize later. |
| GPS unavailable | Continue using classroom proximity and other valid evidence rather than failing solely on location. |
| Bluetooth/Wi-Fi unavailable | Fall back to alternate presence evidence and, where needed, faculty verification. |
| Camera or face verification failure | Allow non-biometric step-up or manual verification when policy permits. |
| Student phone dead | Faculty can record a controlled manual verification event with reason. |
| Service interruption | Do not silently mark students absent. Preserve pending state and reconcile later. |
| Duplicate submission | Detect and ignore replayed event attempts while keeping a security trail. |
| Clock manipulation | Prefer trusted server/session timing and reconciliation rules over device time alone. |

## 14. Attendance State Model

The event lifecycle should be explicit and consistent across the student, faculty, and administrative surfaces.

| State | Description |
| --- | --- |
| Initiated | Attendance attempt started. |
| Authenticated | Student identity successfully established. |
| Session verified | Active class session and challenge are valid. |
| Presence evaluated | Classroom presence evidence evaluated. |
| Risk evaluated | System determines whether normal acceptance is sufficient. |
| Step-up | Additional evidence is requested. |
| Verified | Attendance is accepted. |
| Flagged | Evidence is suspicious or inconclusive and requires review. |
| Rejected | Attempt does not satisfy policy. |
| Corrected | A later authorized event changes the attendance outcome without removing history. |

## 15. Analytics & Intelligent Insights

The intelligent layer should support investigation and early intervention, not automatic punishment.

- Attendance trajectory analysis to identify students approaching institutional thresholds.
- Subject-level and student-level absenteeism trends.
- Late-arrival patterns and unusual attendance timing.
- Proxy-attempt and verification-anomaly analytics across cohorts.
- Repeated device changes, repeated verification failures, and unusual location patterns as investigation signals.
- Explainable risk factors for every anomaly alert.
- Human review before any disciplinary or high-impact action.

## 16. Privacy, Consent & Data Lifecycle

- Collect only information required for attendance, security, audit, and institutional operations.
- Use explicit consent and clear enrollment disclosures for biometric processing.
- Prefer biometric representations over storing raw face images for routine verification.
- Encrypt sensitive information at rest and in transit and tightly restrict access.
- Record access to sensitive biometric and attendance information.
- Define retention periods for attendance records, security evidence, and biometric representations.
- Automatically delete or de-identify information according to the institutional retention policy.
- Do not expose detailed security signals to students when doing so would materially weaken the security model.

## 17. Roles & Authorization

| Role | Core permissions |
| --- | --- |
| Student | Own attendance, requests, corrections, notifications, device status. |
| Faculty | Class sessions, verification review, spot checks, controlled overrides, corrections. |
| Department authority | Policy approval, escalation review, exception decisions, course-level oversight. |
| Administrator | Institution configuration, users, policies, audit access, reports, device administration. |
| Auditor / reviewer | Read-only access to audit and compliance evidence. |

## 18. Feature Delivery Priorities

| Phase | Features | Priority |
| --- | --- | --- |
| Foundation | Identity enrollment, attendance sessions, student/faculty workflows, role controls, attendance history. | P0 |
| Core anti-proxy | Rotating session challenge, device trust, classroom proximity, verification decision engine. | P0 |
| Adaptive security | Step-up liveness, face verification, integrity checks, anomaly flags, spot re-checks. | P1 |
| Audit & resilience | Tamper-evident event history, correction events, offline capture, failure recovery. | P1 |
| Analytics | Attendance trajectories, anomaly analytics, proxy-attempt insights, reporting. | P2 |
| Institution scale | Advanced policy controls, multi-department administration, external system integration, richer compliance workflows. | P3 |

## 19. Success Criteria

- Routine attendance should require minimal interaction from a legitimate student.
- Proxy attempts should be substantially harder than ordinary attendance and should generate observable evidence when suspicious.
- No single signal should be treated as infallible for presence or identity.
- A verification failure should not automatically become an absence when the failure may be caused by a system or device condition.
- Every override and correction must be attributable and auditable.
- Historical attendance events must remain available after corrections.
- Sensitive biometric information must follow explicit consent, access, retention, and deletion policies.
- Faculty must have a practical fallback path for legitimate edge cases.
- Students must have transparent access to their attendance history and correction workflow.

## 20. System Architecture: Modules & Seams

> Added in v1.1 from the pre-code architecture review. These deep modules are the fixed points of the design: every surface consumes their interfaces and never re-implements what they hide.

| Module | Interface surfaces consume | Hidden inside the implementation |
| --- | --- | --- |
| Risk Decision | Signals in → Decision out: outcome (Accept / Step-up / Flag / Reject), structured evidence summary, reason codes. | Thresholds, signal weights, policy version stamping. |
| Session Challenge | `mint(session)` · `redeem(challenge, context)` returning valid / expired / replayed / wrong-session. | Signing keys, rotation window, one-time nonce store, duplicate-use detection. |
| Event Ledger | `append(event)` · `history(student, course)` · `verifyChain()`. | Hash chaining, event sequencing, correction linkage, retention rules. |
| Sync | The same ledger append seam, with each event tagged by origin (`online`, `offline-faculty`, `mobile`). | Reconciliation and duplicate/replay rules shared with the online path. |
| Presence Evidence | One normalized evidence shape consumed by Risk Decision. | Source-specific adapters (Wi-Fi/BLE, location, venue proximity). |

Architectural rules:

- Every attendance state change flows through the Event Ledger's single append seam. Tamper-evidence is verified once at the ledger (§12) rather than re-implemented by each surface.
- All verification paths — student check-in, faculty spot re-check, manual override, offline sync — call the same Risk Decision interface. Fusion logic is never duplicated across surfaces.
- Decisions carry structured evidence summaries; student, faculty, and administrative views (§6.1) are projections of one Decision record, not separately maintained formats.
- Corrections are new ledger events referencing the original event; history is never rewritten.
- Adapter discipline: a presence adapter ships only when a second physical source actually exists — one adapter alone is a hypothetical seam. Until Phase 7 delivers mobile proximity, web phases ship the evidence shape only.

## 21. Final Product Definition

The updated system is best defined as an adaptive, tamper-evident attendance ecosystem. Its distinguishing feature is not the number of verification mechanisms, but how those mechanisms are combined. Strong identity and device trust establish who is making the request. Classroom signals establish probable physical presence. Biometric checks are used as a targeted step-up mechanism when risk is elevated. A decision engine converts those signals into an explainable attendance outcome, while immutable event history preserves accountability.

> **Recommended positioning:** Do not position the product as "verify everything, every time." Position it as "use the minimum verification necessary for a trustworthy attendance decision, and escalate when evidence conflicts."
