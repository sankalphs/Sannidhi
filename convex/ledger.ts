import { ConvexError, v } from "convex/values";

import { attendanceChainHashInput } from "../src/lib/attendance/lifecycle";
import { computeEventHash, type LedgerEventCategory } from "../src/lib/ledger/hash";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { resolveActorUser } from "./lib/actor";

const categoryValidator = v.union(
  v.literal("device"),
  v.literal("identity"),
  v.literal("attendance"),
);

export const appendLedgerEvent = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    category: categoryValidator,
    type: v.string(),
    actorUserId: v.optional(v.id("users")),
    subjectUserId: v.optional(v.id("users")),
    deviceId: v.optional(v.id("devices")),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .first();

    const seq = last !== null ? last.seq + 1 : 0;
    const prevEventHash = last?.eventHash;
    const eventHash = await computeEventHash({ ...args, seq, prevEventHash });

    return ctx.db.insert("event_ledger", {
      ...args,
      seq,
      prevEventHash,
      eventHash,
      createdAt: Date.now(),
    });
  },
});

const MAX_VERIFY_WINDOW = 2000;
const MAX_LEDGER_PAGE = 200;

async function resolveCaller(ctx: QueryCtx, actorToken: string): Promise<Doc<"users">> {
  const user = await resolveActorUser(ctx, actorToken);
  if (user === null) throw new ConvexError("unauthorized");
  return user;
}

export const history = query({
  args: { actorToken: v.string(), subjectUserId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.actorToken);
    if (caller._id !== args.subjectUserId && caller.role !== "admin" && caller.role !== "auditor") {
      throw new ConvexError("unauthorized");
    }
    if (caller._id !== args.subjectUserId) {
      const subject = await ctx.db.get(args.subjectUserId);
      if (subject === null || subject.institutionId !== caller.institutionId) {
        throw new ConvexError("unauthorized");
      }
    }
    return ctx.db
      .query("event_ledger")
      .withIndex("by_subject", (q) => q.eq("subjectUserId", args.subjectUserId))
      .collect();
  },
});

async function safeGetUser(
  ctx: QueryCtx,
  userId: Id<"users"> | undefined,
): Promise<Doc<"users"> | null> {
  if (userId === undefined) return null;
  try {
    return await ctx.db.get(userId);
  } catch {
    return null;
  }
}

export const listLedgerEvents = query({
  args: {
    actorToken: v.string(),
    limit: v.optional(v.number()),
    cursorSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.actorToken);
    if (caller.role !== "admin" && caller.role !== "auditor") {
      throw new ConvexError("unauthorized");
    }

    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 100)), MAX_LEDGER_PAGE);
    const cursorSeq = args.cursorSeq;

    const rows = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) =>
        cursorSeq !== undefined
          ? q.eq("institutionId", caller.institutionId).lt("seq", cursorSeq)
          : q.eq("institutionId", caller.institutionId),
      )
      .order("desc")
      .take(limit);

    const events = await Promise.all(
      rows.map(async (row) => {
        const [subject, actor] = await Promise.all([
          safeGetUser(ctx, row.subjectUserId),
          safeGetUser(ctx, row.actorUserId),
        ]);
        return {
          _id: row._id,
          seq: row.seq,
          createdAt: row.createdAt,
          category: row.category,
          type: row.type,
          eventHash: row.eventHash,
          payload: row.payload,
          subjectName: subject?.name ?? null,
          subjectEmail: subject?.email ?? null,
          actorName: actor?.name ?? null,
        };
      }),
    );

    return {
      events,
      ...(events.length === limit ? { nextCursor: events[events.length - 1].seq } : {}),
    };
  },
});

/**
 * One link of either hash chain: event_ledger and attendance_events rows both
 * carry this spine, so a single walker verifies both.
 */
type ChainLink = {
  seq: number;
  prevEventHash?: string;
  eventHash: string;
};

type ChainVerdict =
  | {
      valid: true;
      /** Seq where verification anchored (0 for intact genesis, else oldest survivor after retention). */
      anchoredAtSeq: number;
      brokenAtSeq: undefined;
      count: number;
      nextCursor?: number;
    }
  | { valid: false; brokenAtSeq: number; count: number };

/**
 * Verifies one window of either chain. When the window's predecessor is gone
 * because retention pruned it, the window is valid iff it starts at the
 * OLDEST SURVIVING row — that row becomes a fresh anchor (its backward pointer
 * references pruned history and is not checked); a hole anywhere else stays a
 * broken link.
 */
async function verifyChainWindow<T extends ChainLink>(params: {
  window: T[];
  fromSeq: number;
  limit: number;
  predecessorHash: string | undefined;
  predecessorRequired: boolean;
  oldestSurvivingSeq: number | null;
  recomputeHash: (row: T) => Promise<string>;
}): Promise<ChainVerdict> {
  const { window, fromSeq, limit, predecessorHash, predecessorRequired, oldestSurvivingSeq } =
    params;

  if (predecessorRequired && predecessorHash === undefined) {
    const first = window[0];
    if (first === undefined || first.seq !== oldestSurvivingSeq) {
      return { valid: false, brokenAtSeq: (first?.seq ?? fromSeq) - 1, count: 0 };
    }
  }

  if (window.length === 0) {
    return { valid: true, anchoredAtSeq: fromSeq, brokenAtSeq: undefined, count: 0 };
  }

  const first = window[0];
  let expectedSeq = first.seq;
  let expectedPrevEventHash = predecessorHash;

  for (const [index, event] of window.slice(0, limit).entries()) {
    if (event.seq !== expectedSeq) {
      return { valid: false, brokenAtSeq: event.seq, count: event.seq - first.seq };
    }
    // The anchored first row's backward pointer may reference pruned history;
    // every later row must link to the previously verified hash.
    if (
      (index > 0 || predecessorHash !== undefined) &&
      event.prevEventHash !== expectedPrevEventHash
    ) {
      return { valid: false, brokenAtSeq: event.seq, count: event.seq - first.seq };
    }
    if ((await params.recomputeHash(event)) !== event.eventHash) {
      return { valid: false, brokenAtSeq: event.seq, count: event.seq - first.seq };
    }
    expectedSeq += 1;
    expectedPrevEventHash = event.eventHash;
  }

  const verifiedCount = Math.min(window.length, limit);
  return {
    valid: true,
    anchoredAtSeq: first.seq,
    brokenAtSeq: undefined,
    count: verifiedCount,
    ...(window.length > limit ? { nextCursor: window[limit - 1].seq + 1 } : {}),
  };
}

export const verifyChain = query({
  args: {
    actorToken: v.string(),
    fromSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.actorToken);
    if (caller.role !== "admin" && caller.role !== "auditor") {
      throw new ConvexError("unauthorized");
    }

    const fromSeq = Math.max(0, Math.floor(args.fromSeq ?? 0));
    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 500)), MAX_VERIFY_WINDOW);

    let predecessorHash: string | undefined;
    let oldestSurvivingSeq: number | null = null;
    if (fromSeq > 0) {
      const predecessor = await ctx.db
        .query("event_ledger")
        .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
        .filter((q) => q.eq(q.field("seq"), fromSeq - 1))
        .first();
      if (predecessor === null) {
        // Predecessor pruned by retention? Only a window starting at the oldest
        // surviving event can still verify; anything else is a broken link.
        const oldest = await ctx.db
          .query("event_ledger")
          .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
          .order("asc")
          .first();
        oldestSurvivingSeq = oldest?.seq ?? null;
      } else {
        predecessorHash = predecessor.eventHash;
      }
    }

    const events = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
      .filter((q) => q.gte(q.field("seq"), fromSeq))
      .order("asc")
      .take(limit + 1);

    return verifyChainWindow({
      window: events,
      fromSeq,
      limit,
      predecessorHash,
      predecessorRequired: fromSeq > 0,
      oldestSurvivingSeq,
      recomputeHash: async (event) =>
        computeEventHash({
          institutionId: event.institutionId,
          category: event.category as LedgerEventCategory,
          type: event.type,
          actorUserId: event.actorUserId,
          subjectUserId: event.subjectUserId,
          deviceId: event.deviceId,
          payload: event.payload as Record<string, unknown>,
          seq: event.seq,
          prevEventHash: event.prevEventHash,
        }),
    });
  },
});

/**
 * Attendance twin of verifyChain: walks the per-student attendance_events
 * chain, recomputing hashes with the exact helper the writer used so the two
 * computations cannot drift.
 */
export const verifyAttendanceChain = query({
  args: {
    actorToken: v.string(),
    fromSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.actorToken);
    if (caller.role !== "admin" && caller.role !== "auditor") {
      throw new ConvexError("unauthorized");
    }

    const fromSeq = Math.max(0, Math.floor(args.fromSeq ?? 0));
    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 500)), MAX_VERIFY_WINDOW);

    let predecessorHash: string | undefined;
    let oldestSurvivingSeq: number | null = null;
    if (fromSeq > 0) {
      const predecessor = await ctx.db
        .query("attendance_events")
        .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
        .filter((q) => q.eq(q.field("seq"), fromSeq - 1))
        .first();
      if (predecessor === null) {
        const oldest = await ctx.db
          .query("attendance_events")
          .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
          .order("asc")
          .first();
        oldestSurvivingSeq = oldest?.seq ?? null;
      } else {
        predecessorHash = predecessor.eventHash;
      }
    }

    const events = await ctx.db
      .query("attendance_events")
      .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
      .filter((q) => q.gte(q.field("seq"), fromSeq))
      .order("asc")
      .take(limit + 1);

    return verifyChainWindow({
      window: events,
      fromSeq,
      limit,
      predecessorHash,
      predecessorRequired: fromSeq > 0,
      oldestSurvivingSeq,
      recomputeHash: (event) =>
        computeEventHash(
          attendanceChainHashInput({
            institutionId: event.institutionId,
            studentId: event.studentId,
            sectionId: event.sectionId,
            ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
            state: event.state,
            origin: event.origin,
            ...(event.policyVersion !== undefined ? { policyVersion: event.policyVersion } : {}),
            ...(event.correctsEventId !== undefined
              ? { correctsEventId: event.correctsEventId }
              : {}),
            seq: event.seq,
            prevEventHash: event.prevEventHash,
          }),
        ),
    });
  },
});
