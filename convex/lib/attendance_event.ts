import type { Decision } from "../../src/lib/decision";
import type { DeviceState } from "../../src/lib/devices/lifecycle";
import { computeEventHash } from "../../src/lib/ledger/hash";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const SECURITY_ANOMALY_EVENT_TYPES = [
  "challenge_replayed",
  "wrong_session_challenge",
  "malformed_challenge",
] as const;

export const RATE_LIMIT_EVENT_TYPES = [
  "attendance.session_checkin",
  "challenge_expired_use",
  "challenge_replayed",
  "wrong_session_challenge",
  "malformed_challenge",
  "checkin_rate_limited",
] as const;

export const CHECKIN_RATE_LIMIT_WINDOW_MS = 60_000;
export const CHECKIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const ANOMALY_LOOKBACK_MS = 10 * 60_000;

export async function appendAttendanceEvent(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    studentId: Id<"users">;
    sectionId: Id<"sections">;
    sessionId?: Id<"class_sessions">;
    state: "verified" | "step_up" | "flagged" | "rejected";
    decision: Decision;
    capturedAt: number;
    recordedByUserId?: Id<"users">;
    note?: string;
  },
): Promise<Id<"attendance_events">> {
  const last = await ctx.db.query("attendance_events").withIndex("by_seq").order("desc").first();
  const seq = last !== null ? last.seq + 1 : 0;
  const prevEventHash = last?.eventHash;

  const eventHash = await computeEventHash({
    institutionId: args.institutionId,
    category: "attendance",
    type: "attendance.session_checkin",
    subjectUserId: args.studentId,
    payload: {
      studentId: args.studentId,
      ...(args.sessionId !== undefined ? { sessionId: args.sessionId } : {}),
      sectionId: args.sectionId,
      state: args.state,
      origin: "online",
      policyVersion: args.decision.policyVersion,
    },
    seq,
    prevEventHash,
  });

  return ctx.db.insert("attendance_events", {
    institutionId: args.institutionId,
    studentId: args.studentId,
    sectionId: args.sectionId,
    state: args.state,
    origin: "online",
    policyVersion: args.decision.policyVersion,
    seq,
    prevEventHash,
    eventHash,
    decision: args.decision,
    capturedAt: args.capturedAt,
    ...(args.recordedByUserId !== undefined ? { recordedByUserId: args.recordedByUserId } : {}),
    ...(args.note !== undefined ? { note: args.note } : {}),
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
  const rows: Array<Doc<"event_ledger">> = await ctx.db
    .query("event_ledger")
    .withIndex("by_subject", (q) => q.eq("subjectUserId", args.studentId))
    .collect();
  return rows.filter(
    (row) => row.createdAt >= cutoff && row.category === "attendance" && types.includes(row.type),
  ).length;
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
