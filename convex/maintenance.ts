import {
  SESSION_CHALLENGE_RETENTION_MS,
  SESSION_WINDOW_GRACE_MS,
} from "../src/lib/session-challenge/config";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { parseTtlMs } from "./lib/attendance_event";
import type { Id } from "./_generated/dataModel";
import { buildRetentionTable, MS_PER_DAY } from "./lib/retentionSweep";

const MAX_CHALLENGE_PRUNES_PER_RUN = 200;
const MAX_SESSION_AUTOCLOSES_PER_RUN = 100;
const MAX_AUDIT_PRUNES_PER_RUN = 200;
const BATCH_SIZE = 50;

const DEFAULT_AUDIT_RETENTION_DAYS = 730;

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
 * Each institution's effective retention (its institution-scope policy's
 * retentionDays, else the env horizon) sets a per-institution cutoff; rows are
 * deleted oldest-first, capped globally per run so a backlog drains across
 * days without blowing mutation limits. Chain verifiers treat the oldest
 * surviving row as a fresh anchor once history is pruned from underneath it.
 */
export const pruneExpiredAuditEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Env read stays in the handler so runs pick up the current value, not an import-time snapshot.
    const envRetentionDays = parseTtlMs(
      process.env.SANNIDHI_RETENTION_DAYS,
      DEFAULT_AUDIT_RETENTION_DAYS,
    );

    const institutions = await ctx.db.query("institutions").collect();
    const policyRows = await ctx.db.query("policy_rows").collect();
    const retentionTable = buildRetentionTable({
      institutions: institutions.map((institution) => ({ _id: institution._id })),
      policyRows: policyRows.map((row) => ({
        institutionId: row.institutionId,
        scope: row.scope,
        settings: row.settings,
      })),
      envRetentionDays,
    });
    const institutionCutoffs = retentionTable.map((entry) => ({
      institutionId: entry.institutionId,
      retentionDays: entry.retentionDays,
    }));

    // Sweep per institution with that institution's own cutoff. One
    // institution's kept (long-retention) rows can never front-run another
    // institution's prunable rows, so retention can't be starved by table
    // layout. A per-institution quota keeps the walk fair when one
    // institution's backlog alone would eat the whole run budget, and the
    // starting position rotates daily so every institution gets a turn at
    // the front of the line across days.
    const perInstitutionQuota = Math.max(
      1,
      Math.floor(MAX_AUDIT_PRUNES_PER_RUN / Math.max(1, retentionTable.length)),
    );
    const dayTick = Math.floor(now / (24 * 60 * 60 * 1000));
    const startIndex = dayTick % retentionTable.length;

    let prunedLedgerEvents = 0;
    let prunedAttendanceEvents = 0;

    for (let offset = 0; offset < retentionTable.length; offset += 1) {
      const entry = retentionTable[(startIndex + offset) % retentionTable.length];
      const ledgerCutoff = now - entry.retentionDays * MS_PER_DAY;
      const institutionId = entry.institutionId as Id<"institutions">;

      if (prunedLedgerEvents < MAX_AUDIT_PRUNES_PER_RUN) {
        const ledgerQuota = Math.min(
          perInstitutionQuota,
          MAX_AUDIT_PRUNES_PER_RUN - prunedLedgerEvents,
        );
        const range = await ctx.db
          .query("event_ledger")
          .withIndex("by_institution_createdAt", (q) =>
            q.eq("institutionId", institutionId).lt("createdAt", ledgerCutoff),
          )
          .take(ledgerQuota);
        for (const row of range) {
          await ctx.db.delete(row._id);
          prunedLedgerEvents += 1;
        }
      }

      if (prunedAttendanceEvents < MAX_AUDIT_PRUNES_PER_RUN) {
        const attendanceQuota = Math.min(
          perInstitutionQuota,
          MAX_AUDIT_PRUNES_PER_RUN - prunedAttendanceEvents,
        );
        const range = await ctx.db
          .query("attendance_events")
          .withIndex("by_institution_capturedAt", (q) =>
            q.eq("institutionId", institutionId).lt("capturedAt", ledgerCutoff),
          )
          .take(attendanceQuota);
        for (const row of range) {
          await ctx.db.delete(row._id);
          prunedAttendanceEvents += 1;
        }
      }

      if (prunedLedgerEvents >= MAX_AUDIT_PRUNES_PER_RUN && prunedAttendanceEvents >= MAX_AUDIT_PRUNES_PER_RUN) {
        break;
      }
    }

    return {
      prunedLedgerEvents,
      prunedAttendanceEvents,
      ledgerRemaining: prunedLedgerEvents >= MAX_AUDIT_PRUNES_PER_RUN,
      attendanceRemaining: prunedAttendanceEvents >= MAX_AUDIT_PRUNES_PER_RUN,
      institutionCutoffs,
    };
  },
});
