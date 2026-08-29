import type { LedgerHashInput } from "@/lib/ledger/hash";

/**
 * Full attendance event lifecycle. The first five states are pipeline
 * intermediates a progressive writer may emit while evidence accumulates;
 * the next four are decision states today's single-shot writers produce;
 * "corrected" only ever overwrites an earlier decision event.
 */
export const ATTENDANCE_STATES = [
  "initiated",
  "authenticated",
  "session_verified",
  "presence_evaluated",
  "risk_evaluated",
  "step_up",
  "verified",
  "flagged",
  "rejected",
  "corrected",
] as const;

export type AttendanceEventState = (typeof ATTENDANCE_STATES)[number];

export const ATTENDANCE_ORIGINS = ["online", "offline-faculty", "mobile"] as const;

export type AttendanceOrigin = (typeof ATTENDANCE_ORIGINS)[number];

/** Terminal decision states that a correction may overwrite. */
export const CORRECTIONABLE_STATES = ["verified", "flagged", "rejected"] as const;

export type CorrectionableState = (typeof CORRECTIONABLE_STATES)[number];

/** Intermediates advance one step at a time before landing on a decision state. */
const PIPELINE_PROGRESSION: readonly AttendanceEventState[] = [
  "initiated",
  "authenticated",
  "session_verified",
  "presence_evaluated",
  "risk_evaluated",
];

const DECISION_STATES: readonly AttendanceEventState[] = [
  "step_up",
  "verified",
  "flagged",
  "rejected",
];

/** Every state except "corrected" may begin an attempt entry; corrections overwrite existing ones. */
export function isStartableState(state: AttendanceEventState): boolean {
  return state !== "corrected";
}

/** An entry is state "corrected" iff it carries correctsEventId; regular events must not. */
export function isValidCorrection(
  state: AttendanceEventState,
  correctsEventId: string | undefined,
): boolean {
  if (state === "corrected") return correctsEventId !== undefined;
  return correctsEventId === undefined;
}

/**
 * Whether `next` may follow `prev` in the progressive check-in pipeline.
 * Intermediates move one step forward; any intermediate may jump straight to
 * a decision state (the shape single-shot writers produce). Corrections are
 * overwrites of settled decisions, not pipeline steps, so they never follow.
 */
export function canFollowInPipeline(
  prev: AttendanceEventState,
  next: AttendanceEventState,
): boolean {
  const prevIndex = PIPELINE_PROGRESSION.indexOf(prev);
  if (prevIndex === -1) return false;
  if (next === "corrected") return false;
  if (DECISION_STATES.includes(next)) return true;
  return PIPELINE_PROGRESSION.indexOf(next) === prevIndex + 1;
}

/** event_ledger type stamped onto every per-student attendance chain entry. */
export const ATTENDANCE_CHAIN_EVENT_TYPE = "attendance.session_checkin";

export type AttendanceChainFields = {
  institutionId: string;
  studentId: string;
  sectionId: string;
  sessionId?: string;
  state: AttendanceEventState;
  origin: AttendanceOrigin;
  policyVersion?: string;
  correctsEventId?: string;
};

/** The hashed payload for an attendance_events row; absent optionals stay absent, never undefined. */
export function attendanceChainPayload(event: AttendanceChainFields): Record<string, unknown> {
  return {
    studentId: event.studentId,
    ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
    sectionId: event.sectionId,
    state: event.state,
    origin: event.origin,
    ...(event.policyVersion !== undefined ? { policyVersion: event.policyVersion } : {}),
    ...(event.correctsEventId !== undefined ? { correctsEventId: event.correctsEventId } : {}),
  };
}

/**
 * Single source of truth for how an attendance_events row is hashed: the
 * writer hashes this shape before insert and verifyAttendanceChain recomputes
 * it from the stored row, so the two computations cannot drift apart.
 */
export function attendanceChainHashInput(
  event: AttendanceChainFields & { seq: number; prevEventHash?: string },
): LedgerHashInput {
  return {
    institutionId: event.institutionId,
    category: "attendance",
    type: ATTENDANCE_CHAIN_EVENT_TYPE,
    subjectUserId: event.studentId,
    payload: attendanceChainPayload(event),
    seq: event.seq,
    prevEventHash: event.prevEventHash,
  };
}
