import {
  SESSION_CHALLENGE_RETENTION_MS,
  SESSION_WINDOW_GRACE_MS,
} from "../src/lib/session-challenge/config";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { parseTtlMs } from "./lib/attendance_event";

const MAX_CHALLENGE_PRUNES_PER_RUN = 200;
const MAX_SESSION_AUTOCLOSES_PER_RUN = 100;
const MAX_AUDIT_PRUNES_PER_RUN = 200;
const BATCH_SIZE = 50;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Audit history horizon in days; unit is days even though the parser tolerates any positive number. */
export const AUDIT_RETENTION_DAYS = parseTtlMs(process.env.SANNIDHI_RETENTION_DAYS, 730);

export const expireStaleChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - SESSION_CHALLENGE_RETENTION_MS;

    let prunedChallenges = 0;
    pruneLoop: for (;;) {
      const batch = await ctx.db
        .query("session_challenges")
        .withIndex("by_expiresAt", (q) => q.lt("expiresAt", cutoff))
        .take(BATCH_SIZE);
      if (batch.length === 0) break;
      for (const challenge of batch) {
        await ctx.db.delete(challenge._id);
        prunedChallenges += 1;
        if (prunedChallenges >= MAX_CHALLENGE_PRUNES_PER_RUN) break pruneLoop;
      }
    }

    let autoClosedSessions = 0;
    const graceCutoff = now - SESSION_WINDOW_GRACE_MS;
    closeLoop: for (;;) {
      const batch = await ctx.db
        .query("class_sessions")
        .withIndex("by_status_windowEndsAt", (q) =>
          q.eq("status", "active").lt("windowEndsAt", graceCutoff),
        )
        .take(Math.min(BATCH_SIZE, MAX_SESSION_AUTOCLOSES_PER_RUN - autoClosedSessions));
      if (batch.length === 0) break;
      for (const session of batch) {
        await ctx.db.patch(session._id, { status: "closed", closedAt: now });
        // Auto-close has no actor; every faculty-driven transition carries one.
        await ctx.runMutation(internal.ledger.appendLedgerEvent, {
          institutionId: session.institutionId,
          category: "attendance",
          type: "session.auto_closed",
          payload: { sessionId: session._id, sectionId: session.sectionId },
        });
        autoClosedSessions += 1;
        if (autoClosedSessions >= MAX_SESSION_AUTOCLOSES_PER_RUN) break closeLoop;
      }
    }

    return {
      prunedChallenges,
      autoClosedSessions,
      challengesRemaining: prunedChallenges >= MAX_CHALLENGE_PRUNES_PER_RUN,
      sessionsRemaining: autoClosedSessions >= MAX_SESSION_AUTOCLOSES_PER_RUN,
    };
  },
});

/**
 * Retention sweep for both audit chains (event_ledger + attendance_events).
 * Rows older than AUDIT_RETENTION_DAYS are deleted oldest-first, capped per run
 * so a backlog drains across days without blowing mutation limits. Chain
 * verifiers treat the oldest surviving row as a fresh anchor once history is
 * pruned from underneath it.
 */
export const pruneExpiredAuditEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - AUDIT_RETENTION_DAYS * MS_PER_DAY;

    let prunedLedgerEvents = 0;
    ledgerLoop: for (;;) {
      const batch = await ctx.db
        .query("event_ledger")
        .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
        .take(BATCH_SIZE);
      if (batch.length === 0) break;
      for (const row of batch) {
        await ctx.db.delete(row._id);
        prunedLedgerEvents += 1;
        if (prunedLedgerEvents >= MAX_AUDIT_PRUNES_PER_RUN) break ledgerLoop;
      }
    }

    let prunedAttendanceEvents = 0;
    attendanceLoop: for (;;) {
      const batch = await ctx.db
        .query("attendance_events")
        .withIndex("by_capturedAt", (q) => q.lt("capturedAt", cutoff))
        .take(BATCH_SIZE);
      if (batch.length === 0) break;
      for (const row of batch) {
        await ctx.db.delete(row._id);
        prunedAttendanceEvents += 1;
        if (prunedAttendanceEvents >= MAX_AUDIT_PRUNES_PER_RUN) break attendanceLoop;
      }
    }

    return {
      prunedLedgerEvents,
      prunedAttendanceEvents,
      ledgerRemaining: prunedLedgerEvents >= MAX_AUDIT_PRUNES_PER_RUN,
      attendanceRemaining: prunedAttendanceEvents >= MAX_AUDIT_PRUNES_PER_RUN,
    };
  },
});
