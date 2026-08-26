import { ConvexError } from "convex/values";

import type { Decision } from "../../src/lib/decision";
import type { DeviceState } from "../../src/lib/devices/lifecycle";
import {
  CORRECTIONABLE_STATES,
  attendanceChainHashInput,
  isStartableState,
  isValidCorrection,
  type AttendanceEventState,
  type AttendanceOrigin,
} from "../../src/lib/attendance/lifecycle";
import { computeEventHash } from "../../src/lib/ledger/hash";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const SECURITY_ANOMALY_EVENT_TYPES = [
  "challenge_replayed",
  "wrong_session_challenge",
  "malformed_challenge",
] as const;

export const RATE_LIMIT_EVENT_TYPES = [
  "challenge_expired_use",
  "challenge_replayed",
  "wrong_session_challenge",
  "malformed_challenge",
] as const;

export const CHECKIN_RATE_LIMIT_WINDOW_MS = 60_000;
export const CHECKIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const ANOMALY_LOOKBACK_MS = 10 * 60_000;

/**
 * Appends to the attendance_events chain — the per-student decision record.
 * Distinct from the event_ledger chain (institution-wide audit trail): both
 * are hash-chained and append-only, but each verifies independently through
 * its own per-institution seq/prevEventHash sequence.
 *
 * Server-time authority: this seam stamps capturedAt itself; callers never
 * pass a device clock. Corrections must reference an existing event whose
 * state is correctionable and that has not been corrected before.
 * syncNonceHash is stamped only by offline sync (origin "offline-faculty")
 * as the replay-dedupe key checked against by_nonce_hash.
 */
export async function appendAttendanceEvent(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    studentId: Id<"users">;
    sectionId: Id<"sections">;
    sessionId?: Id<"class_sessions">;
    state: AttendanceEventState;
    origin?: AttendanceOrigin;
    correctsEventId?: Id<"attendance_events">;
    decision?: Decision;
    recordedByUserId?: Id<"users">;
    note?: string;
    syncNonceHash?: string;
  },
): Promise<Id<"attendance_events">> {
  if (!isStartableState(args.state)) {
    throw new ConvexError("corrections_only_overwrite_existing_events");
  }
  if (!isValidCorrection(args.state, args.correctsEventId)) {
    throw new ConvexError(
      args.state === "corrected"
        ? "correction_requires_corrects_event_id"
        : "non_correction_cannot_reference_event",
    );
  }

  if (args.correctsEventId !== undefined) {
    const corrected = await ctx.db.get(args.correctsEventId);
    if (corrected === null) throw new ConvexError("corrected_event_not_found");
    if (!(CORRECTIONABLE_STATES as readonly string[]).includes(corrected.state)) {
      throw new ConvexError("corrected_event_not_correctionable");
    }
    const priorCorrection = await ctx.db
      .query("attendance_events")
      .withIndex("by_corrects_event", (q) => q.eq("correctsEventId", args.correctsEventId))
      .first();
    if (priorCorrection !== null) throw new ConvexError("event_already_corrected");
  }

  const last = await ctx.db
    .query("attendance_events")
    .withIndex("by_institution_seq", (q) => q.eq("institutionId", args.institutionId))
    .order("desc")
    .first();
  const seq = last !== null ? last.seq + 1 : 0;
  const prevEventHash = last?.eventHash;

  const origin = args.origin ?? "online";
  const capturedAt = Date.now();

  const eventHash = await computeEventHash(
    attendanceChainHashInput({
      institutionId: args.institutionId,
      studentId: args.studentId,
      sectionId: args.sectionId,
      ...(args.sessionId !== undefined ? { sessionId: args.sessionId } : {}),
      state: args.state,
      origin,
      ...(args.decision !== undefined ? { policyVersion: args.decision.policyVersion } : {}),
      ...(args.correctsEventId !== undefined ? { correctsEventId: args.correctsEventId } : {}),
      seq,
      prevEventHash,
    }),
  );

  return ctx.db.insert("attendance_events", {
    institutionId: args.institutionId,
    studentId: args.studentId,
    sectionId: args.sectionId,
    state: args.state,
    origin,
    policyVersion: args.decision?.policyVersion,
    seq,
    prevEventHash,
    eventHash,
    decision: args.decision,
    capturedAt,
    ...(args.sessionId !== undefined ? { sessionId: args.sessionId } : {}),
    ...(args.correctsEventId !== undefined ? { correctsEventId: args.correctsEventId } : {}),
    ...(args.recordedByUserId !== undefined ? { recordedByUserId: args.recordedByUserId } : {}),
    ...(args.note !== undefined ? { note: args.note } : {}),
    ...(args.syncNonceHash !== undefined ? { syncNonceHash: args.syncNonceHash } : {}),
  });
}

export async function bestDeviceForStudent(
  ctx: MutationCtx | QueryCtx,
  studentId: Id<"users">,
): Promise<{ state: DeviceState } | null> {
  const devices: Array<Doc<"devices">> = await ctx.db
    .query("devices")
    .withIndex("by_user", (q) => q.eq("userId", studentId))
    .collect();
  if (devices.length === 0) return null;

  const active = devices
    .filter((device) => device.state === "active")
    .sort((a, b) => (b.activatedAt ?? 0) - (a.activatedAt ?? 0));
  if (active.length > 0) return { state: active[0].state };

  const pending = devices
    .filter((device) => device.state === "enrolled" || device.state === "new")
    .sort((a, b) => b.registeredAt - a.registeredAt);
  if (pending.length > 0) return { state: pending[0].state };

  const retired = devices
    .filter(
      (device) =>
        device.state === "suspended" || device.state === "revoked" || device.state === "replaced",
    )
    .sort((a, b) => b.stateChangedAt - a.stateChangedAt);
  if (retired.length > 0) return { state: retired[0].state };

  return null;
}

export async function countRecentSecurityEvents(
  ctx: MutationCtx | QueryCtx,
  args: {
    studentId: Id<"users">;
    sinceMs: number;
    types?: readonly string[];
    now: number;
  },
): Promise<number> {
  const types = args.types ?? RATE_LIMIT_EVENT_TYPES;
  const cutoff = args.now - args.sinceMs;
  let count = 0;
  for (const type of types) {
    const rows = await ctx.db
      .query("event_ledger")
      .withIndex("by_subject_category_type_created", (q) =>
        q
          .eq("subjectUserId", args.studentId)
          .eq("category", "attendance")
          .eq("type", type)
          .gte("createdAt", cutoff),
      )
      .collect();
    count += rows.length;
  }
  return count;
}

export async function countRecentCheckinAttempts(
  ctx: MutationCtx | QueryCtx,
  args: { studentId: Id<"users">; now: number },
): Promise<number> {
  return countRecentSecurityEvents(ctx, {
    studentId: args.studentId,
    sinceMs: CHECKIN_RATE_LIMIT_WINDOW_MS,
    types: RATE_LIMIT_EVENT_TYPES,
    now: args.now,
  });
}

export async function countRecentChallengeAnomalies(
  ctx: MutationCtx | QueryCtx,
  args: { studentId: Id<"users">; now: number },
): Promise<number> {
  return countRecentSecurityEvents(ctx, {
    studentId: args.studentId,
    sinceMs: ANOMALY_LOOKBACK_MS,
    types: SECURITY_ANOMALY_EVENT_TYPES,
    now: args.now,
  });
}

/**
 * Latest attendance event per student for one session since a timestamp
 * (usually that same session's start). Shared by the faculty board and
 * spot-recheck eligibility so both agree on what "latest" means. Scoped to the
 * session, not just the section: late-resolving challenges from an older
 * session otherwise masquerade as this session's latest events.
 */
export async function latestEventsByStudentSince(
  ctx: MutationCtx | QueryCtx,
  args: { sectionId: Id<"sections">; sessionId: Id<"class_sessions">; sinceMs: number },
): Promise<Map<Id<"users">, Doc<"attendance_events">>> {
  const events = await ctx.db
    .query("attendance_events")
    .withIndex("by_section_captured", (q) =>
      q.eq("sectionId", args.sectionId).gte("capturedAt", args.sinceMs),
    )
    .collect();

  const latestByStudent = new Map<Id<"users">, Doc<"attendance_events">>();
  for (const event of events) {
    if (event.sessionId !== args.sessionId) continue;
    const current = latestByStudent.get(event.studentId);
    if (current === undefined || event.capturedAt >= current.capturedAt) {
      latestByStudent.set(event.studentId, event);
    }
  }
  return latestByStudent;
}

/** TTL env vars fall back to their default unless they parse to a positive ms value. */
export function parseTtlMs(raw: string | undefined, fallbackMs: number): number {
  if (raw === undefined) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

/**
 * Index into the eligible-students list for a random spot re-check.
 * `seedMs` is the mutation's wall-clock time: faculty-triggered randomness
 * lives in the timing of the tap, while mutations stay deterministic.
 */
export function spotRecheckPickIndex(eligibleCount: number, seedMs: number): number {
  if (!Number.isInteger(eligibleCount) || eligibleCount <= 0) return 0;
  return seedMs % eligibleCount;
}

export type ChallengeLifecycleState = "active" | "expired_pending" | "resolved";

/** Whether a challenge is actionable, needs its lazy expired transition, or is settled. */
export function challengeLifecycle(
  challenge: { status: Doc<"verification_challenges">["status"]; expiresAt: number },
  now: number,
): ChallengeLifecycleState {
  if (challenge.status !== "pending") return "resolved";
  if (now >= challenge.expiresAt) return "expired_pending";
  return "active";
}
