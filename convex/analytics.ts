import { ConvexError, v } from "convex/values";

import {
  analyzeTrajectory,
  isReportPeriod,
  PROXY_LOOKBACK_DAYS,
  reportWindow,
  summarizeProxyAttempts,
  summarizeSectionTrends,
  summarizeVerificationAnomalies,
  VERIFICATION_ANOMALY_TYPES,
  type ReportPeriod,
  type SectionTrendRow,
  type StudentTrajectory,
} from "../src/lib/analytics";
import { projectAttendanceState } from "../src/lib/attendance/projection";
import { requireAnalyticsAuthority } from "./lib/actor";
import { studentTrajectoryRecords } from "./lib/analytics_projection";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AnalyticsOverview = {
  students: number;
  sections: number;
  sessionsHeld: number;
  openAlerts: number;
};

async function trajectoryFor(
  ctx: QueryCtx,
  studentId: Id<"users">,
): Promise<StudentTrajectory> {
  const records = await studentTrajectoryRecords(ctx, { studentId });
  return analyzeTrajectory(records);
}

/** Cohort counters the analytics landing cards render. */
export const overview = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<AnalyticsOverview> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);

    const [students, courses, openAlerts, activeSessions, pausedSessions, closedSessions] =
      await Promise.all([
        ctx.db
          .query("users")
          .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
          .collect(),
        ctx.db
          .query("courses")
          .withIndex("by_institution_code", (q) => q.eq("institutionId", caller.institutionId))
          .collect(),
        ctx.db
          .query("review_alerts")
          .withIndex("by_institution_status_detected", (q) =>
            q.eq("institutionId", caller.institutionId).eq("status", "open"),
          )
          .collect(),
        ctx.db
          .query("class_sessions")
          .withIndex("by_institution_status", (q) =>
            q.eq("institutionId", caller.institutionId).eq("status", "active"),
          )
          .collect(),
        ctx.db
          .query("class_sessions")
          .withIndex("by_institution_status", (q) =>
            q.eq("institutionId", caller.institutionId).eq("status", "paused"),
          )
          .collect(),
        ctx.db
          .query("class_sessions")
          .withIndex("by_institution_status", (q) =>
            q.eq("institutionId", caller.institutionId).eq("status", "closed"),
          )
          .collect(),
      ]);
    const sessions = [...activeSessions, ...pausedSessions, ...closedSessions];

    let sections = 0;
    for (const course of courses) {
      const rows = await ctx.db
        .query("sections")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect();
      sections += rows.length;
    }

    return {
      students: students.filter((user) => user.role === "student").length,
      sections,
      sessionsHeld: sessions.length,
      openAlerts: openAlerts.length,
    };
  },
});

export type TrajectoryRow = {
  studentId: Id<"users">;
  studentName: string;
  studentEmail: string;
  usn: string | null;
  summary: StudentTrajectory["summary"];
  consecutiveMisses: number;
  trend: StudentTrajectory["trend"];
  atRisk: boolean;
  factors: string[];
};

/** Per-student attendance trajectory against the institutional threshold. */
export const attendanceTrajectories = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<TrajectoryRow[]> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);
    const students = await ctx.db
      .query("users")
      .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
      .collect();

    const rows: TrajectoryRow[] = [];
    for (const student of students) {
      if (student.role !== "student" || student.status !== "active") continue;
      const trajectory = await trajectoryFor(ctx, student._id);
      rows.push({
        studentId: student._id,
        studentName: student.name,
        studentEmail: student.email,
        usn: student.usn ?? null,
        summary: trajectory.summary,
        consecutiveMisses: trajectory.consecutiveMisses,
        trend: trajectory.trend,
        atRisk: trajectory.atRisk,
        factors: trajectory.factors,
      });
    }

    return rows.sort(
      (a, b) =>
        Number(b.atRisk) - Number(a.atRisk) ||
        a.summary.percentage - b.summary.percentage ||
        a.studentName.localeCompare(b.studentName),
    );
  },
});

/** Subject-level trends: attendance rate, flagged/rejected counts, late arrivals. */
export const sectionTrends = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<SectionTrendRow[]> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_institution_code", (q) => q.eq("institutionId", caller.institutionId))
      .collect();

    const inputs = [];
    for (const course of courses) {
      const sections = await ctx.db
        .query("sections")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect();
      for (const section of sections) {
        const [sessions, enrollments, events] = await Promise.all([
          ctx.db
            .query("class_sessions")
            .withIndex("by_section_started", (q) => q.eq("sectionId", section._id))
            .collect(),
          ctx.db
            .query("enrollments")
            .withIndex("by_section", (q) => q.eq("sectionId", section._id))
            .collect(),
          ctx.db
            .query("attendance_events")
            .withIndex("by_section_captured", (q) => q.eq("sectionId", section._id))
            .collect(),
        ]);
        inputs.push({
          section: {
            sectionId: section._id as string,
            courseCode: course.code,
            courseTitle: course.title,
            enrolledCount: enrollments.length,
          },
          sessions: sessions.map((session) => ({
            sessionId: session._id as string,
            startedAt: session.startedAt,
          })),
          events: events
            .filter((event) => event.sessionId !== undefined)
            .map((event) => ({
              sessionId: event.sessionId as string,
              studentId: event.studentId as string,
              state: event.state,
              capturedAt: event.capturedAt,
            })),
        });
      }
    }

    return summarizeSectionTrends(inputs);
  },
});

export type AnomalyDashboardResult = {
  sinceMs: number;
  proxyAttempts: Array<{
    studentId: string;
    studentName: string | null;
    studentEmail: string | null;
    flaggedCount: number;
    reasonCodes: string[];
    latestAt: number;
  }>;
  verification: ReturnType<typeof summarizeVerificationAnomalies>;
};

/** Proxy-attempt and verification-anomaly dashboards over the lookback window. */
export const anomalyDashboard = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<AnomalyDashboardResult> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);
    const now = Date.now();
    const sinceMs = now - PROXY_LOOKBACK_DAYS * MS_PER_DAY;

    const flaggedEvents = (
      await ctx.db
        .query("attendance_events")
        .withIndex("by_capturedAt", (q) => q.gte("capturedAt", sinceMs))
        .collect()
    ).filter(
      (event) =>
        event.institutionId === caller.institutionId &&
        event.state === "flagged" &&
        event.decision !== undefined,
    );

    const proxyRows = summarizeProxyAttempts(
      flaggedEvents.map((event) => ({
        studentId: event.studentId as string,
        reasonCodes: event.decision?.reasonCodes ?? [],
        capturedAt: event.capturedAt,
      })),
      sinceMs,
    );

    const students = await ctx.db
      .query("users")
      .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
      .collect();
    const studentById = new Map(
      students.map((user) => [user._id as string, user] as const),
    );

    const ledgerRows = (
      await ctx.db
        .query("event_ledger")
        .withIndex("by_createdAt", (q) => q.gte("createdAt", sinceMs))
        .collect()
    ).filter(
      (row) =>
        row.institutionId === caller.institutionId &&
        (VERIFICATION_ANOMALY_TYPES as readonly string[]).includes(row.type),
    );

    return {
      sinceMs,
      proxyAttempts: proxyRows.map((row) => ({
        ...row,
        studentName: studentById.get(row.studentId)?.name ?? null,
        studentEmail: studentById.get(row.studentId)?.email ?? null,
      })),
      verification: summarizeVerificationAnomalies(
        ledgerRows.map((row) => ({
          type: row.type,
          subjectUserId: row.subjectUserId !== undefined ? (row.subjectUserId as string) : null,
          createdAt: row.createdAt,
        })),
        sinceMs,
        PROXY_LOOKBACK_DAYS,
      ),
    };
  },
});

export type ReportRow = {
  studentName: string;
  studentEmail: string;
  courseCode: string;
  sectionName: string;
  state: "verified" | "flagged" | "pending" | "rejected" | "corrected";
  reasonCodes: string[];
  capturedAt: number;
};

export type ReportRowsResult = {
  period: ReportPeriod;
  label: string;
  startMs: number;
  endMs: number;
  rows: ReportRow[];
  summary: { total: number; verified: number; flagged: number; rejected: number; pending: number };
};

/** Rolling-window attendance report rows feeding the CSV/PDF exports. */
export const reportRows = query({
  args: { actorToken: v.string(), period: v.string() },
  handler: async (ctx, args): Promise<ReportRowsResult> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);
    if (!isReportPeriod(args.period)) throw new ConvexError("invalid_period");
    const period = args.period as ReportPeriod;

    const window = reportWindow(period, Date.now());

    const events = (
      await ctx.db
        .query("attendance_events")
        .withIndex("by_capturedAt", (q) => q.gte("capturedAt", window.startMs))
        .collect()
    ).filter(
      (event) =>
        event.capturedAt < window.endMs && event.institutionId === caller.institutionId,
    );

    const sectionCache = new Map<Id<"sections">, { sectionName: string; courseCode: string }>();
    const userCache = new Map<Id<"users">, Doc<"users"> | null>();

    const rows: ReportRow[] = [];
    for (const event of [...events].sort((a, b) => a.capturedAt - b.capturedAt)) {
      let section = sectionCache.get(event.sectionId);
      if (section === undefined) {
        const sectionDoc = await ctx.db.get(event.sectionId);
        const course = sectionDoc !== null ? await ctx.db.get(sectionDoc.courseId) : null;
        if (sectionDoc !== null && course !== null) {
          section = { sectionName: sectionDoc.name, courseCode: course.code };
          sectionCache.set(event.sectionId, section);
        } else {
          sectionCache.set(event.sectionId, null as unknown as { sectionName: string; courseCode: string });
          continue;
        }
      }
      if (section === null) continue;

      let student = userCache.get(event.studentId);
      if (student === undefined) {
        student = await ctx.db.get(event.studentId);
        userCache.set(event.studentId, student);
      }
      if (student === null) continue;

      rows.push({
        studentName: student.name,
        studentEmail: student.email,
        courseCode: section.courseCode,
        sectionName: section.sectionName,
        state: projectAttendanceState(event.state),
        reasonCodes: event.decision?.reasonCodes ?? [],
        capturedAt: event.capturedAt,
      });
    }

    const summary = { total: rows.length, verified: 0, flagged: 0, rejected: 0, pending: 0 };
    for (const row of rows) {
      if (row.state === "verified" || row.state === "corrected") summary.verified += 1;
      else if (row.state === "flagged") summary.flagged += 1;
      else if (row.state === "rejected") summary.rejected += 1;
      else summary.pending += 1;
    }

    return {
      period,
      label: window.label,
      startMs: window.startMs,
      endMs: window.endMs,
      rows,
      summary,
    };
  },
});
