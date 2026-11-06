import { ConvexError, v } from "convex/values";

import { attendanceChainHashInput } from "../src/lib/attendance/lifecycle";
import { ledgerDisplayCategory } from "../src/lib/format/ledger";
import { computeEventHash, type LedgerEventCategory } from "../src/lib/ledger/hash";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { requireActorUser } from "./lib/actor";

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

export const history = query({
  args: { actorToken: v.string(), subjectUserId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
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

/** Per-query memo so a page of rows reads each user, section and course once. */
function createLookup(ctx: QueryCtx) {
  const users = new Map<string, Promise<Doc<"users"> | null>>();
  const sections = new Map<string, Promise<{ courseCode: string; sectionName: string } | null>>();
  return {
    user(userId: Id<"users"> | undefined): Promise<Doc<"users"> | null> {
      if (userId === undefined) return Promise.resolve(null);
      if (!users.has(userId)) users.set(userId, safeGetUser(ctx, userId));
      return users.get(userId)!;
    },
    section(sectionId: Id<"sections">) {
      if (!sections.has(sectionId)) {
        sections.set(
          sectionId,
          (async () => {
            const section = await ctx.db.get(sectionId);
            if (section === null) return null;
            const course = await ctx.db.get(section.courseId);
            return { courseCode: course?.code ?? "—", sectionName: section.name };
          })(),
        );
      }
      return sections.get(sectionId)!;
    },
  };
}

function matchesPerson(needle: string, ...people: (Doc<"users"> | null)[]): boolean {
  return people.some(
    (person) =>
      person !== null &&
      (person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle)),
  );
}

/** Rows read per page request before handing back a cursor, so sparse filters stay bounded. */
const MAX_SCAN = 1000;

/**
 * Walks an index newest-first, keeping rows `keep` accepts until `limit` are
 * kept or MAX_SCAN are read. `nextCursor` (pass back as `cursorSeq`) is set
 * whenever older rows remain unread.
 */
async function scanNewestFirst<T extends { seq: number }>(
  rows: AsyncIterable<T>,
  limit: number,
  keep: (row: T) => Promise<boolean>,
): Promise<{ kept: T[]; nextCursor?: number }> {
  const kept: T[] = [];
  let scanned = 0;
  for await (const row of rows) {
    scanned += 1;
    if (await keep(row)) kept.push(row);
    if (kept.length >= limit || scanned >= MAX_SCAN) return { kept, nextCursor: row.seq };
  }
  return { kept };
}

const pageArgs = {
  actorToken: v.string(),
  limit: v.optional(v.number()),
  cursorSeq: v.optional(v.number()),
  /** Case-insensitive substring of a subject/actor (or student) name or email. */
  person: v.optional(v.string()),
  fromMs: v.optional(v.number()),
  toMs: v.optional(v.number()),
};

async function requireLedgerReader(ctx: QueryCtx, actorToken: string): Promise<Doc<"users">> {
  const caller = await requireActorUser(ctx, actorToken);
  if (caller.role !== "admin" && caller.role !== "auditor") {
    throw new ConvexError("unauthorized");
  }
  return caller;
}

function pageLimit(limit: number | undefined): number {
  return Math.min(Math.max(1, Math.floor(limit ?? 100)), MAX_LEDGER_PAGE);
}

function inRange(at: number, fromMs: number | undefined, toMs: number | undefined): boolean {
  return (fromMs === undefined || at >= fromMs) && (toMs === undefined || at < toMs);
}

/**
 * One newest-first page of the institution's event ledger, optionally
 * filtered by display category (incl. the derived "schedule"), type
 * substring, person and createdAt range.
 */
export const listLedgerEvents = query({
  args: {
    ...pageArgs,
    category: v.optional(
      v.union(
        v.literal("identity"),
        v.literal("device"),
        v.literal("attendance"),
        v.literal("schedule"),
      ),
    ),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireLedgerReader(ctx, args.actorToken);
    const lookup = createLookup(ctx);
    const cursorSeq = args.cursorSeq;
    const typeNeedle = args.type?.trim().toLowerCase() ?? "";
    const personNeedle = args.person?.trim().toLowerCase() ?? "";

    const { kept, nextCursor } = await scanNewestFirst(
      ctx.db
        .query("event_ledger")
        .withIndex("by_institution_seq", (q) =>
          cursorSeq !== undefined
            ? q.eq("institutionId", caller.institutionId).lt("seq", cursorSeq)
            : q.eq("institutionId", caller.institutionId),
        )
        .order("desc"),
      pageLimit(args.limit),
      async (row) => {
        if (!inRange(row.createdAt, args.fromMs, args.toMs)) return false;
        if (
          args.category !== undefined &&
          ledgerDisplayCategory(row.category, row.type) !== args.category
        ) {
          return false;
        }
        if (typeNeedle.length > 0 && !row.type.toLowerCase().includes(typeNeedle)) return false;
        if (personNeedle.length === 0) return true;
        const [subject, actor] = await Promise.all([
          lookup.user(row.subjectUserId),
          lookup.user(row.actorUserId),
        ]);
        return matchesPerson(personNeedle, subject, actor);
      },
    );

    const events = await Promise.all(
      kept.map(async (row) => {
        const [subject, actor] = await Promise.all([
          lookup.user(row.subjectUserId),
          lookup.user(row.actorUserId),
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

    return { events, ...(nextCursor !== undefined ? { nextCursor } : {}) };
  },
});

const attendanceStateValidator = v.union(
  v.literal("verified"),
  v.literal("flagged"),
  v.literal("rejected"),
  v.literal("step_up"),
  v.literal("corrected"),
);

/**
 * One newest-first page of attendance_events — every check-in decision,
 * including accepted ones that never reach the event ledger — with the
 * student, course and decision reasons resolved for display.
 */
export const listAttendanceRecords = query({
  args: { ...pageArgs, state: v.optional(attendanceStateValidator) },
  handler: async (ctx, args) => {
    const caller = await requireLedgerReader(ctx, args.actorToken);
    const lookup = createLookup(ctx);
    const cursorSeq = args.cursorSeq;
    const personNeedle = args.person?.trim().toLowerCase() ?? "";

    const { kept, nextCursor } = await scanNewestFirst(
      ctx.db
        .query("attendance_events")
        .withIndex("by_institution_seq", (q) =>
          cursorSeq !== undefined
            ? q.eq("institutionId", caller.institutionId).lt("seq", cursorSeq)
            : q.eq("institutionId", caller.institutionId),
        )
        .order("desc"),
      pageLimit(args.limit),
      async (row) => {
        if (!inRange(row.capturedAt, args.fromMs, args.toMs)) return false;
        if (args.state !== undefined && row.state !== args.state) return false;
        if (personNeedle.length === 0) return true;
        const [student, recorder] = await Promise.all([
          lookup.user(row.studentId),
          lookup.user(row.recordedByUserId),
        ]);
        return matchesPerson(personNeedle, student, recorder);
      },
    );

    const records = await Promise.all(
      kept.map(async (row) => {
        const [student, recorder, section] = await Promise.all([
          lookup.user(row.studentId),
          lookup.user(row.recordedByUserId),
          lookup.section(row.sectionId),
        ]);
        return {
          _id: row._id,
          seq: row.seq,
          capturedAt: row.capturedAt,
          state: row.state,
          origin: row.origin,
          studentName: student?.name ?? null,
          studentEmail: student?.email ?? null,
          recordedByName: recorder?.name ?? null,
          courseCode: section?.courseCode ?? null,
          sectionName: section?.sectionName ?? null,
          note: row.note ?? null,
          eventHash: row.eventHash,
          decision: row.decision ?? null,
        };
      }),
    );

    return { records, ...(nextCursor !== undefined ? { nextCursor } : {}) };
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
    const caller = await requireActorUser(ctx, args.actorToken);
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
    const caller = await requireActorUser(ctx, args.actorToken);
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
