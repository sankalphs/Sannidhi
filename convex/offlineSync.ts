import { ConvexError, v } from "convex/values";

import {
  RISK_REASON_CODES,
  decide,
  deviceTrustSignal,
  manualAttestationSignals,
  outcomeToAttendanceState,
} from "../src/lib/risk";
import { mintBundleKey, nonceHash, verifySignature } from "../src/lib/offline/bundle";
import type { Decision, DecisionOutcome } from "../src/lib/decision";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireActorUserWithActiveSession } from "./lib/actor";
import { appendAttendanceEvent, bestDeviceForStudent } from "./lib/attendance_event";

/**
 * Phase 5 offline capture writer seam (spec §13+§20).
 *
 * Flow: `mintOfflineBundle` pre-authorizes an ACTIVE session by storing a raw
 * bundle key on the session row; the faculty device holds the same key while
 * disconnected. Queued records are signed client-side (see
 * src/lib/offline/bundle.ts). `syncOfflineBatch` re-verifies each HMAC against
 * the stored key, dedupes replays via attendance_events.syncNonceHash
 * (by_nonce_hash), and appends survivors through appendAttendanceEvent — the
 * same seam online check-in uses — tagged origin "offline-faculty". There is
 * deliberately no parallel sync dialect: reconciliation is replay detection at
 * this one seam. Device capturedAt is display-only note evidence; server time
 * stays authoritative.
 */

const MAX_SYNC_BATCH = 200;

type SyncStatus =
  "accepted" | "step_up" | "flagged" | "rejected" | "duplicate" | "invalid_signature";

const syncStatusValidator = v.union(
  v.literal("accepted"),
  v.literal("step_up"),
  v.literal("flagged"),
  v.literal("rejected"),
  v.literal("duplicate"),
  v.literal("invalid_signature"),
);

const signedRecordValidator = v.object({
  sessionId: v.id("class_sessions"),
  sectionId: v.id("sections"),
  studentId: v.id("users"),
  capturedAt: v.number(),
  nonce: v.string(),
  note: v.optional(v.string()),
  signature: v.string(),
});

async function requireFaculty(ctx: MutationCtx, actorToken: string): Promise<Doc<"users">> {
  const user = await requireActorUserWithActiveSession(ctx, actorToken).catch(() => null);
  if (user === null || user.role !== "faculty") throw new ConvexError("unauthorized");
  return user;
}

function statusForOutcome(outcome: DecisionOutcome): SyncStatus {
  switch (outcome) {
    case "accept":
      return "accepted";
    case "step_up":
      return "step_up";
    case "flag":
      return "flagged";
    case "reject":
      return "rejected";
  }
}

export const mintOfflineBundle = mutation({
  args: {
    actorToken: v.string(),
    sessionId: v.id("class_sessions"),
  },
  returns: v.object({
    sessionId: v.id("class_sessions"),
    key: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const faculty = await requireFaculty(ctx, args.actorToken);
    const session = await ctx.db.get(args.sessionId);
    if (session === null) throw new ConvexError("session not found");
    if (session.facultyId !== faculty._id || session.institutionId !== faculty.institutionId) {
      throw new ConvexError("unauthorized");
    }
    if (session.status !== "active") throw new ConvexError("session_not_active");

    // Raw key on the row so sync can recompute HMACs; re-minting rotates it,
    // invalidating any keys still held by stale device copies.
    const key = mintBundleKey();
    await ctx.db.patch(session._id, { offlineKey: key });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: session.institutionId,
      category: "attendance",
      type: "session.offline_bundle_issued",
      actorUserId: faculty._id,
      payload: { sessionId: session._id, sectionId: session.sectionId },
    });

    return { sessionId: session._id, key, expiresAt: session.windowEndsAt };
  },
});

export const syncOfflineBatch = mutation({
  args: {
    actorToken: v.string(),
    records: v.array(signedRecordValidator),
  },
  returns: v.object({
    results: v.array(
      v.object({
        studentId: v.id("users"),
        status: syncStatusValidator,
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const faculty = await requireFaculty(ctx, args.actorToken);
    if (args.records.length > MAX_SYNC_BATCH) throw new ConvexError("batch_too_large");

    // Session authorization is batch-level and fails closed: every record's
    // trust anchors in the caller owning that session's bundle key, and the
    // per-item status vocabulary has no slot for authorization failures.
    const sessions = new Map<Id<"class_sessions">, Doc<"class_sessions">>();
    for (const record of args.records) {
      if (sessions.has(record.sessionId)) continue;
      const session = await ctx.db.get(record.sessionId);
      if (
        session === null ||
        session.institutionId !== faculty.institutionId ||
        session.facultyId !== faculty._id
      ) {
        throw new ConvexError("unauthorized");
      }
      sessions.set(record.sessionId, session);
    }

    const results: Array<{ studentId: Id<"users">; status: SyncStatus }> = [];

    for (const record of args.records) {
      const session = sessions.get(record.sessionId);
      if (session === undefined) throw new ConvexError("unauthorized");

      // Structurally inconsistent records fail closed as invalid_signature:
      // the signature may be genuine but the claim is not about this session.
      const valid =
        record.sectionId === session.sectionId &&
        session.offlineKey !== undefined &&
        (await verifySignature(session.offlineKey, record));
      if (!valid) {
        results.push({ studentId: record.studentId, status: "invalid_signature" });
        continue;
      }

      const digest = await nonceHash(record.sessionId, record.nonce);
      const replayed = await ctx.db
        .query("attendance_events")
        .withIndex("by_nonce_hash", (q) => q.eq("syncNonceHash", digest))
        .first();
      if (replayed !== null) {
        // §13: detect and ignore replayed attempts while keeping a trail.
        await ctx.runMutation(internal.ledger.appendLedgerEvent, {
          institutionId: session.institutionId,
          category: "attendance",
          type: "attendance.offline_duplicate",
          actorUserId: faculty._id,
          subjectUserId: record.studentId,
          payload: { sessionId: session._id, studentId: record.studentId, nonceHash: digest },
        });
        results.push({ studentId: record.studentId, status: "duplicate" });
        continue;
      }

      // Mirror verifyManually's signal building, plus a marker that presence
      // was attested offline; the claimed capture time rides along as detail.
      const device = await bestDeviceForStudent(ctx, record.studentId);
      const offlineDecision = decide({
        signals: [
          ...manualAttestationSignals(record.note?.trim() || "offline roster attestation"),
          deviceTrustSignal(device),
          {
            category: "presence",
            source: "offline_capture",
            status: "verified",
            detail: `captured_at:${record.capturedAt}`,
          },
        ],
        anomalies: { recentSecurityFailures: 0 },
        now: Date.now(),
      });
      const decision: Decision = {
        ...offlineDecision,
        reasonCodes: [...offlineDecision.reasonCodes, RISK_REASON_CODES.offlineCapture],
      };

      const claimedCapturedAtIso = new Date(record.capturedAt).toISOString();
      const noteParts = [`offline capture ${claimedCapturedAtIso} (device clock)`];
      if (record.note !== undefined && record.note.trim().length > 0) {
        noteParts.push(record.note.trim());
      }

      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: session.institutionId,
        category: "attendance",
        type: "attendance.offline_synced",
        actorUserId: faculty._id,
        subjectUserId: record.studentId,
        payload: {
          sessionId: session._id,
          studentId: record.studentId,
          nonceHash: digest,
          decision,
        },
      });

      await appendAttendanceEvent(ctx, {
        institutionId: session.institutionId,
        studentId: record.studentId,
        sectionId: session.sectionId,
        sessionId: session._id,
        state: outcomeToAttendanceState(decision.outcome),
        origin: "offline-faculty",
        decision,
        recordedByUserId: faculty._id,
        note: noteParts.join("; "),
        syncNonceHash: digest,
      });

      results.push({ studentId: record.studentId, status: statusForOutcome(decision.outcome) });
    }

    return { results };
  },
});
