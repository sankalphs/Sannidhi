import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

import {
  analyzeTrajectory,
  canReviewStudentAlert,
  deriveAlerts,
  PROXY_LOOKBACK_DAYS,
  summarizeProxyAttempts,
  VERIFICATION_ANOMALY_TYPES,
  type ProxyAttemptRow,
  type ReviewAlertKind,
} from "../src/lib/analytics";
import { requireAdminUser, requireAnalyticsAuthority } from "./lib/actor";
import { flaggedEventsForStudent, studentTrajectoryRecords } from "./lib/analytics_projection";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_ALERTS_PER_LIST = 200;
/** Ceiling on alerts scanned per status when department scope filters most of them out. */
const MAX_ALERT_SCAN = 500;
const MAX_RESOLUTION_NOTE_LENGTH = 1000;
const ALERT_CREATED_TYPE = "analytics.review_alert_created";
const ALERT_RESOLVED_TYPE = "analytics.review_alert_resolved";

/** Ledger security-event window backing proxy and verification-anomaly alerts. */
export function alertLookbackMs(now: number): number {
  return now - PROXY_LOOKBACK_DAYS * MS_PER_DAY;
}

async function hasOpenAlert(
  ctx: MutationCtx,
  args: { institutionId: Id<"institutions">; kind: ReviewAlertKind; studentId: Id<"users"> },
): Promise<boolean> {
  const rows = await ctx.db
    .query("review_alerts")
    .withIndex("by_institution_kind_status", (q) =>
      q.eq("institutionId", args.institutionId).eq("kind", args.kind).eq("status", "open"),
    )
    .collect();
  return rows.some((row) => row.studentId === args.studentId);
}

async function countVerificationAnomalies(
  ctx: MutationCtx,
  args: { studentId: Id<"users">; sinceMs: number },
): Promise<number> {
  let count = 0;
  for (const type of VERIFICATION_ANOMALY_TYPES) {
    const rows = await ctx.db
      .query("event_ledger")
      .withIndex("by_subject_category_type_created", (q) =>
        q
          .eq("subjectUserId", args.studentId)
          .eq("category", "attendance")
          .eq("type", type)
          .gte("createdAt", args.sinceMs),
      )
      .collect();
    count += rows.length;
  }
  return count;
}

async function proxyRowForStudent(
  ctx: MutationCtx,
  args: { studentId: Id<"users">; sinceMs: number },
): Promise<ProxyAttemptRow | null> {
  const flagged = await flaggedEventsForStudent(ctx, args);
  if (flagged.length === 0) return null;
  return (
    summarizeProxyAttempts(
      flagged.map((event) => ({
        studentId: event.studentId as string,
        reasonCodes: event.decision?.reasonCodes ?? [],
        capturedAt: event.capturedAt,
      })),
      args.sinceMs,
    )[0] ?? null
  );
}

async function loadStudents(ctx: MutationCtx, institutionId: Id<"institutions">) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_institution", (q) => q.eq("institutionId", institutionId))
    .collect();
  return users.filter((user) => user.role === "student" && user.status === "active");
}

/**
 * Early-warning scan over the given institutions (every institution when
 * omitted): derives investigation alerts from ledger projections only.
 * Idempotent — an open alert of the same kind for the same student is never
 * duplicated; resolving one lets the next scan re-raise it only if the
 * evidence persists.
 */
export async function performScan(
  ctx: MutationCtx,
  institutionIds?: Array<Id<"institutions">>,
): Promise<{
  institutionsScanned: number;
  alertsCreated: number;
}> {
  const now = Date.now();
  const sinceMs = alertLookbackMs(now);
  const scope =
    institutionIds ??
    (await ctx.db.query("institutions").collect()).map((institution) => institution._id);

  let alertsCreated = 0;
  for (const institutionId of scope) {
    const students = await loadStudents(ctx, institutionId);
    for (const student of students) {
      const records = await studentTrajectoryRecords(ctx, { studentId: student._id });
      const trajectory = analyzeTrajectory(records);
      const proxy = await proxyRowForStudent(ctx, { studentId: student._id, sinceMs });
      const anomalyCount = await countVerificationAnomalies(ctx, {
        studentId: student._id,
        sinceMs,
      });

      for (const alert of deriveAlerts({
        trajectory,
        proxy,
        verificationAnomalyCount: anomalyCount,
      })) {
        const duplicate = await hasOpenAlert(ctx, {
          institutionId,
          kind: alert.kind,
          studentId: student._id,
        });
        if (duplicate) continue;
        const alertId = await ctx.db.insert("review_alerts", {
          institutionId,
          kind: alert.kind,
          studentId: student._id,
          factors: alert.factors,
          status: "open",
          detectedAt: now,
        });
        await ctx.runMutation(internal.ledger.appendLedgerEvent, {
          institutionId,
          category: "attendance",
          type: ALERT_CREATED_TYPE,
          subjectUserId: student._id,
          payload: { kind: alert.kind, factors: alert.factors, alertId },
        });
        alertsCreated += 1;
      }
    }
  }

  return { institutionsScanned: scope.length, alertsCreated };
}

export const scanReviewAlerts = internalMutation({
  args: {},
  handler: async (ctx) => performScan(ctx),
});

/** Manual trigger scoped to the caller's institution; shares the core with the daily cron. */
export const triggerScan = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);
    return performScan(ctx, [caller.institutionId]);
  },
});

export type ReviewAlertRow = {
  id: Id<"review_alerts">;
  kind: ReviewAlertKind;
  status: Doc<"review_alerts">["status"];
  studentId: Id<"users"> | null;
  studentName: string | null;
  studentEmail: string | null;
  factors: string[];
  detectedAt: number;
  resolvedAt: number | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
};

async function safeUser(ctx: MutationCtx | QueryCtx, userId: Id<"users"> | undefined) {
  if (userId === undefined) return null;
  try {
    return await ctx.db.get(userId);
  } catch {
    return null;
  }
}

/**
 * Inbox for admin and department authority (scoped to their departments' students):
 * open alerts first, resolved history after.
 */
export const listReviewAlerts = query({
  args: {
    actorToken: v.string(),
    status: v.optional(
      v.union(v.literal("open"), v.literal("acknowledged"), v.literal("dismissed")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ReviewAlertRow[]> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);
    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 100)), MAX_ALERTS_PER_LIST);

    // Three scans (one per status) so the inbox gets open alerts plus resolved
    // history without a cross-status range read. Each scan pages newest-first
    // until enough alerts the caller may review are found — a department
    // authority's inbox must not go empty because the newest alerts belong to
    // other departments. The scan is capped so a huge backlog stays bounded.
    const statuses: Array<Doc<"review_alerts">["status"]> = ["open", "acknowledged", "dismissed"];
    const collected: ScopedAlert[] = [];
    for (const status of statuses) {
      if (args.status !== undefined && args.status !== status) continue;
      collected.push(...(await scopedAlerts(ctx, caller, status, limit)));
    }

    const mapped = await Promise.all(
      collected.map(async ({ row, student }): Promise<ReviewAlertRow> => {
        const resolver = await safeUser(ctx, row.resolvedByUserId);
        return {
          id: row._id,
          kind: row.kind,
          status: row.status,
          studentId: row.studentId ?? null,
          studentName: student?.name ?? null,
          studentEmail: student?.email ?? null,
          factors: row.factors,
          detectedAt: row.detectedAt,
          resolvedAt: row.resolvedAt ?? null,
          resolvedByName: resolver?.name ?? null,
          resolutionNote: row.resolutionNote ?? null,
        };
      }),
    );

    return mapped.sort((a, b) => rank(a) - rank(b) || b.detectedAt - a.detectedAt).slice(0, limit);
  },
});

type ScopedAlert = { row: Doc<"review_alerts">; student: Doc<"users"> | null };

/**
 * Newest-first alerts of one status that the caller may review, joined to
 * their student. Scans past alerts outside the caller's departments instead of
 * counting them toward the display limit. Convex allows one paginated scan per
 * query, so this is a bounded take: a department authority reaches authorized
 * alerts behind up to MAX_ALERT_SCAN newer ones from other departments.
 */
async function scopedAlerts(
  ctx: QueryCtx,
  caller: Doc<"users">,
  status: Doc<"review_alerts">["status"],
  wanted: number,
): Promise<ScopedAlert[]> {
  const rows = await ctx.db
    .query("review_alerts")
    .withIndex("by_institution_status_detected", (q) =>
      q.eq("institutionId", caller.institutionId).eq("status", status),
    )
    .order("desc")
    .take(MAX_ALERT_SCAN);

  const found: ScopedAlert[] = [];
  for (const row of rows) {
    const student = await safeUser(ctx, row.studentId);
    if (!canReviewStudentAlert(caller, student)) continue;
    found.push({ row, student });
    if (found.length >= wanted) break;
  }
  return found;
}

function rank(row: ReviewAlertRow): number {
  return row.status === "open" ? 0 : 1;
}

/** Human review outcome for an alert: acknowledge (investigating) or dismiss. */
export const resolveReviewAlert = mutation({
  args: {
    actorToken: v.string(),
    alertId: v.id("review_alerts"),
    decision: v.union(v.literal("acknowledge"), v.literal("dismiss")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);
    if (args.note !== undefined && args.note.trim().length > MAX_RESOLUTION_NOTE_LENGTH) {
      throw new ConvexError(`Notes are limited to ${MAX_RESOLUTION_NOTE_LENGTH} characters`);
    }
    const alert = await ctx.db.get(args.alertId);
    if (alert === null) throw new ConvexError("alert_not_found");
    if (alert.institutionId !== caller.institutionId) throw new ConvexError("unauthorized");
    if (!canReviewStudentAlert(caller, await safeUser(ctx, alert.studentId))) {
      throw new ConvexError("unauthorized");
    }
    if (alert.status !== "open") throw new ConvexError("alert_not_open");

    const trimmed = args.note?.trim();
    await ctx.db.patch(args.alertId, {
      status: args.decision === "acknowledge" ? "acknowledged" : "dismissed",
      resolvedAt: Date.now(),
      resolvedByUserId: caller._id,
      ...(trimmed !== undefined && trimmed.length > 0 ? { resolutionNote: trimmed } : {}),
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: alert.institutionId,
      category: "attendance",
      type: ALERT_RESOLVED_TYPE,
      subjectUserId: alert.studentId ?? undefined,
      payload: { alertId: args.alertId, action: args.decision, note: trimmed ?? null },
    });
    return { ok: true as const };
  },
});
