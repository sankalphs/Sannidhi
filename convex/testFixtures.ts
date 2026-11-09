import { ConvexError, v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { hashInviteToken } from "../src/lib/invites/token";
import { attendanceChainHashInput } from "../src/lib/attendance/lifecycle";
import {
  institutionDateKey,
  institutionDayOfWeek,
  institutionInstant,
  institutionMinutesOfDay,
} from "../src/lib/attendance/timezone";
import { computeEventHash } from "../src/lib/ledger/hash";
import { RISK_POLICY_VERSION } from "../src/lib/risk/types";
import type { Decision } from "../src/lib/decision";
import { ALL_TABLES, deleteRows } from "./lib/wipe";

/**
 * Deterministic fixtures for local development and the e2e suite — never for
 * a real deployment. Every entry point refuses to run unless the Convex
 * deployment sets SANNIDHI_TEST_FIXTURES=1.
 *
 *   bun run fixtures   # wipe the local deployment and load fixtures
 */

const FIXTURE_INVITE_TOKEN = "fixture-invite-token";
const FIXTURE_PASSWORD_INVITE_TOKEN = "fixture-password-invite-token";

function fixturesEnabled(): boolean {
  return process.env.SANNIDHI_TEST_FIXTURES === "1";
}

const FIXTURE_ROLES = v.union(
  v.literal("student"),
  v.literal("faculty"),
  v.literal("department_authority"),
  v.literal("admin"),
  v.literal("auditor"),
);

const FIXTURE_EMAILS = {
  student: "aarav.patel@sit.edu.in",
  faculty: "priya.menon@sit.edu.in",
  department_authority: "vikram.desai@sit.edu.in",
  admin: "ananya.iyer@sit.edu.in",
  auditor: "rohan.gupta@sit.edu.in",
} as const;

/**
 * Resolves the fixture user behind a dev-login role (see /api/dev-session);
 * `email` picks a specific fixture user of that role, e.g. a second student.
 */
export const getFixtureActor = query({
  args: { role: FIXTURE_ROLES, email: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ userId: string; email: string } | null> => {
    if (!fixturesEnabled()) throw new ConvexError("unauthorized");
    const user: Doc<"users"> | null = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email ?? FIXTURE_EMAILS[args.role]))
      .unique();
    if (user === null || user.status === "suspended" || user.role !== args.role) return null;
    return { userId: user._id, email: user.email };
  },
});

/** Wipes every table, then loads the fixture institution. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!fixturesEnabled()) {
      throw new ConvexError("test fixtures are disabled on this deployment");
    }
    for (const table of ALL_TABLES) {
      while ((await deleteRows(ctx, table, 500)) > 0) {
        // keep deleting
      }
    }
    return loadFixtures(ctx);
  },
});

async function loadFixtures(ctx: MutationCtx) {
  const now = Date.now();

  const institutionId = await ctx.db.insert("institutions", {
    name: "Sannidhi Institute of Technology",
    code: "SIT",
    createdAt: now,
  });

  const userData = [
    {
      email: "aarav.patel@sit.edu.in",
      name: "Aarav Patel",
      role: "student" as const,
    },
    {
      email: "diya.sharma@sit.edu.in",
      name: "Diya Sharma",
      role: "student" as const,
    },
    {
      email: "priya.menon@sit.edu.in",
      name: "Priya Menon",
      role: "faculty" as const,
    },
    {
      email: "vikram.desai@sit.edu.in",
      name: "Vikram Desai",
      role: "department_authority" as const,
    },
    {
      email: "ananya.iyer@sit.edu.in",
      name: "Ananya Iyer",
      role: "admin" as const,
    },
    {
      email: "rohan.gupta@sit.edu.in",
      name: "Rohan Gupta",
      role: "auditor" as const,
    },
  ];

  const studentIds: Id<"users">[] = [];
  let adminId: Id<"users"> | undefined;
  let facultyId: Id<"users"> | undefined;
  for (const user of userData) {
    const userId = await ctx.db.insert("users", {
      institutionId,
      email: user.email,
      name: user.name,
      role: user.role,
      status: "active",
      createdAt: now,
    });
    if (user.role === "student") {
      studentIds.push(userId);
    }
    if (user.role === "admin") {
      adminId = userId;
    }
    if (user.role === "faculty") {
      facultyId = userId;
    }
  }
  if (adminId === undefined) {
    throw new Error("seed data must include an admin user");
  }
  if (facultyId === undefined) {
    throw new Error("seed data must include a faculty user");
  }

  const courseData = [
    {
      code: "CS101",
      title: "Introduction to Computer Science",
      department: "Computer Science",
    },
    {
      code: "MA201",
      title: "Discrete Mathematics",
      department: "Mathematics",
    },
    {
      code: "PH105",
      title: "Engineering Physics",
      department: "Physics",
    },
    {
      code: "EC210",
      title: "Digital Electronics",
      department: "Electronics",
    },
  ];

  const sectionIds: Id<"sections">[] = [];
  const courseIds: Id<"courses">[] = [];
  for (const course of courseData) {
    const courseId = await ctx.db.insert("courses", {
      institutionId,
      code: course.code,
      title: course.title,
      department: course.department,
    });
    const sectionId = await ctx.db.insert("sections", {
      courseId,
      name: `${course.code} - Section A`,
      term: "2026-Autumn",
    });
    courseIds.push(courseId);
    sectionIds.push(sectionId);
  }

  const venueData = [
    {
      name: "Lecture Hall LH-1",
      capacity: 120,
      latitude: 12.9716,
      longitude: 77.5946,
      geofenceRadiusMeters: 250,
    },
    {
      name: "Computing Lab CL-2",
      capacity: 60,
      latitude: 12.9723,
      longitude: 77.5955,
      geofenceRadiusMeters: 250,
    },
    {
      name: "Seminar Room SR-3",
      capacity: 40,
      latitude: 12.9709,
      longitude: 77.5937,
      geofenceRadiusMeters: 250,
    },
  ];

  const venueIds: Id<"venues">[] = [];
  for (const venue of venueData) {
    const venueId = await ctx.db.insert("venues", {
      institutionId,
      name: venue.name,
      capacity: venue.capacity,
      latitude: venue.latitude,
      longitude: venue.longitude,
      geofenceRadiusMeters: venue.geofenceRadiusMeters,
    });
    venueIds.push(venueId);
  }

  const slotData = [
    { sectionIndex: 0, venueIndex: 0, dayOfWeek: 1, startMinutes: 540, endMinutes: 600 },
    { sectionIndex: 0, venueIndex: 0, dayOfWeek: 3, startMinutes: 540, endMinutes: 600 },
    { sectionIndex: 1, venueIndex: 0, dayOfWeek: 2, startMinutes: 600, endMinutes: 660 },
    { sectionIndex: 1, venueIndex: 2, dayOfWeek: 4, startMinutes: 540, endMinutes: 600 },
    { sectionIndex: 2, venueIndex: 1, dayOfWeek: 1, startMinutes: 660, endMinutes: 720 },
    { sectionIndex: 2, venueIndex: 1, dayOfWeek: 5, startMinutes: 540, endMinutes: 600 },
    { sectionIndex: 3, venueIndex: 2, dayOfWeek: 2, startMinutes: 540, endMinutes: 600 },
    { sectionIndex: 3, venueIndex: 2, dayOfWeek: 4, startMinutes: 660, endMinutes: 720 },
  ];

  let slotCount = 0;
  for (const slot of slotData) {
    await ctx.db.insert("timetable_slots", {
      sectionId: sectionIds[slot.sectionIndex],
      venueId: venueIds[slot.venueIndex],
      dayOfWeek: slot.dayOfWeek,
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
    });
    slotCount += 1;
  }

  // "Today" in the institution's timezone — the same clock the faculty
  // schedule reads — so the live slot exists whatever the server's zone.
  const todayDayOfWeek = institutionDayOfWeek(now);
  const tomorrowDayOfWeek = (todayDayOfWeek + 1) % 7;
  const currentMinutes = institutionMinutesOfDay(now);
  const liveStartMinutes = Math.max(0, currentMinutes - 15);
  const liveEndMinutes = Math.min(24 * 60, liveStartMinutes + 90);

  await ctx.db.insert("timetable_slots", {
    sectionId: sectionIds[0],
    venueId: venueIds[0],
    dayOfWeek: todayDayOfWeek,
    startMinutes: liveStartMinutes,
    endMinutes: liveEndMinutes,
    facultyId,
  });
  await ctx.db.insert("timetable_slots", {
    sectionId: sectionIds[1],
    venueId: venueIds[1],
    dayOfWeek: tomorrowDayOfWeek,
    startMinutes: 600,
    endMinutes: 660,
    facultyId,
  });
  slotCount += 2;

  const enrollmentPlan = [
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  ];

  let enrollmentCount = 0;
  const termEnrolledAt = now - TERM_ENROLLED_AT_OFFSET_MS;
  for (const [studentIndex, pairs] of enrollmentPlan.entries()) {
    for (const pair of pairs) {
      await ctx.db.insert("enrollments", {
        studentId: studentIds[studentIndex],
        sectionId: sectionIds[pair[1]],
        enrolledAt: termEnrolledAt,
      });
      enrollmentCount += 1;
    }
  }

  let deviceCount = 0;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  for (const [studentIndex, studentId] of studentIds.entries()) {
    await ctx.db.insert("passkey_credentials", {
      userId: studentId,
      credentialId: `fixture-credential-${studentIndex}`,
      publicKey: "fixture-public-key",
      counter: 0,
      label: "Fixture passkey",
      createdAt: now,
      lastUsedAt: now,
    });
    await ctx.db.insert("devices", {
      institutionId,
      userId: studentId,
      label: "Test phone",
      platform: "iOS 26",
      state: "active",
      registeredAt: weekAgo,
      activatedAt: weekAgo,
      stateChangedAt: weekAgo,
    });
    deviceCount += 1;
    // Only one active device per student — the same invariant the
    // replacement flow enforces in production.
    await ctx.db.insert("devices", {
      institutionId,
      userId: studentId,
      label: `Test laptop ${studentIndex + 1}`,
      platform: "web",
      state: "enrolled",
      registeredAt: now,
      stateChangedAt: now,
    });
    deviceCount += 1;
  }

  const invitedEmail = "meera.nair@sit.edu.in";
  await ctx.db.insert("users", {
    institutionId,
    email: invitedEmail,
    name: "Meera Nair",
    role: "student",
    status: "invited",
    createdAt: now,
  });

  // The passkey-invite flow and the invite-gated password-signup e2e both
  // depend on these fixed tokens.
  await ctx.db.insert("invites", {
    institutionId,
    email: invitedEmail,
    role: "student",
    tokenHash: await hashInviteToken(FIXTURE_INVITE_TOKEN),
    status: "pending",
    invitedByUserId: adminId,
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
  });
  // Password signup: a pending invite for an email with no user row,
  // so the invite-gated signup flow can be exercised end-to-end.
  await ctx.db.insert("invites", {
    institutionId,
    email: "password.signup.fixture@sit.edu.in",
    role: "student",
    tokenHash: await hashInviteToken(FIXTURE_PASSWORD_INVITE_TOKEN),
    status: "pending",
    invitedByUserId: adminId,
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
  });
  const inviteCount = 2;

  const backfill = await backfillTermHistory(ctx, {
    institutionId,
    facultyId,
    studentIds,
    courseIds,
    sectionIds,
    venueIds,
  });

  return {
    institutions: 1,
    users: userData.length + 1,
    invites: inviteCount,
    courses: courseData.length,
    sections: sectionIds.length,
    venues: venueIds.length,
    timetableSlots: slotCount,
    enrollments: enrollmentCount,
    devices: deviceCount,
    sessionsBackfilled: backfill.sessions,
    attendanceEventsBackfilled: backfill.attendanceEvents,
    ledgerEventsBackfilled: backfill.ledgerEvents,
  };
}

/**
 * Deterministic per-student outcome table for the backfilled term, keyed
 * [week][section] with "v" (verified) | "f" (flagged) | "r" (rejected) |
 * "a" (absent). Week 0 is the oldest; the recent weeks drive the analytics
 * analytics fixtures: Diya ends the term below threshold with a trailing absence
 * streak and recent proxy flags, Aarav stays healthy above 85%.
 */
const BACKFILL_OUTCOMES: Array<Array<Array<"v" | "f" | "r" | "a">>> = [
  [
    ["v", "v", "v", "v"],
    ["v", "v", "v", "r"],
    ["v", "v", "f", "v"],
    ["v", "v", "v", "v"],
    ["v", "r", "v", "v"],
    ["v", "v", "v", "f"],
    ["v", "v", "v", "v"],
    ["v", "v", "r", "v"],
    ["v", "v", "v", "v"],
    ["v", "v", "v", "v"],
    ["v", "v", "f", "v"],
    ["v", "v", "v", "v"],
  ],
  [
    ["v", "v", "r", "v"],
    ["v", "f", "v", "r"],
    ["v", "v", "v", "a"],
    ["r", "v", "v", "v"],
    ["v", "v", "f", "v"],
    ["v", "r", "v", "a"],
    ["v", "v", "v", "r"],
    ["f", "v", "a", "v"],
    ["v", "v", "v", "a"],
    ["f", "v", "a", "v"],
    ["a", "a", "f", "a"],
    ["a", "a", "a", "a"],
  ],
];

/** Late check-ins (student, week, section) with minutes past session start. */
const BACKFILL_LATE: Array<{ student: 0 | 1; week: number; section: number; minutes: number }> = [
  { student: 0, week: 9, section: 1, minutes: 22 },
  { student: 0, week: 6, section: 2, minutes: 19 },
  { student: 0, week: 2, section: 1, minutes: 26 },
  { student: 1, week: 10, section: 2, minutes: 31 },
  { student: 1, week: 7, section: 3, minutes: 18 },
  { student: 1, week: 3, section: 0, minutes: 24 },
];

/** Flagged rows carrying proxy reason codes (student, week, section), all in recent weeks. */
const BACKFILL_PROXY_FLAGS: Array<{ student: 0 | 1; week: number; section: number; code: string }> =
  [
    { student: 1, week: 10, section: 2, code: "person_spoof_suspected" },
    { student: 1, week: 9, section: 0, code: "person_face_mismatch" },
  ];

/** Backfilled challenge-anomaly ledger rows (student, week, type), all recent. */
const BACKFILL_LEDGER_ANOMALIES: Array<{ student: 0 | 1; week: number; type: string }> = [
  { student: 1, week: 10, type: "challenge_replayed" },
  { student: 1, week: 10, type: "challenge_replayed" },
  { student: 1, week: 9, type: "wrong_session_challenge" },
  { student: 1, week: 9, type: "malformed_challenge" },
  { student: 1, week: 11, type: "challenge_replayed" },
];

const TERM_WEEKS = 12;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const MS_PER_WEEK = 7 * MS_PER_DAY;
/**
 * Newest backfilled session sits at least 26h in the past so it never lands
 * inside the faculty schedule's 24h recency window — the seeded live slot
 * and e2e resume flows stay untouched.
 */
const BACKFILL_NEWEST_AGE_MS = 26 * 60 * MS_PER_MINUTE;
/** Enrollment start that predates every backfilled session, so term-long absence synthesis stays bounded. */
const TERM_ENROLLED_AT_OFFSET_MS = (TERM_WEEKS + 1) * MS_PER_WEEK;
const SECTION_START_MINUTES = [540, 600, 600, 540];

type BackfillCounts = { sessions: number; attendanceEvents: number; ledgerEvents: number };

function backfillKey(student: number, week: number, section: number): string {
  return `${student}:${week}:${section}`;
}

/**
 * Seeds a full term of closed class sessions with hash-chained attendance
 * events, replicating the exact chain math of the append seams so both
 * institutional chains verify afterwards. Absences are stored as the
 * absence itself — no attendance row — which the trajectory projection
 * synthesizes from closed sessions without a student event.
 */
async function backfillTermHistory(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    facultyId: Id<"users">;
    studentIds: Id<"users">[];
    courseIds: Id<"courses">[];
    sectionIds: Id<"sections">[];
    venueIds: Id<"venues">[];
  },
): Promise<BackfillCounts> {
  const now = Date.now();
  const termEnd = now - BACKFILL_NEWEST_AGE_MS;
  const students = args.studentIds;
  if (students.length !== 2 || args.sectionIds.length !== 4) {
    throw new Error("backfill expects 2 seeded students and 4 sections");
  }

  const lateMinutes = new Map(
    BACKFILL_LATE.map((late) => [backfillKey(late.student, late.week, late.section), late.minutes]),
  );
  const proxyCodes = new Map(
    BACKFILL_PROXY_FLAGS.map((flag) => [
      backfillKey(flag.student, flag.week, flag.section),
      flag.code,
    ]),
  );

  const sessionsByWeekSection = new Map<
    string,
    { sessionId: Id<"class_sessions">; startedAt: number }
  >();

  for (let week = 0; week < TERM_WEEKS; week += 1) {
    for (let sectionIndex = 0; sectionIndex < 4; sectionIndex += 1) {
      // Outcome-table week 0 is the oldest term week; the newest week sits
      // closest to termEnd so recent-week analytics stories land in-window.
      const nominalStart =
        termEnd - (TERM_WEEKS - 1 - week) * MS_PER_WEEK - sectionIndex * MS_PER_DAY;
      // Build the slot on the institution's wall clock, not the host's: a
      // 09:00 IST class must be 09:00 IST even when this script runs on UTC.
      let sessionStart = institutionInstant(
        institutionDateKey(nominalStart),
        SECTION_START_MINUTES[sectionIndex],
      );
      // Normalization can pull a session inside the 26h safety gap; shift
      // whole days until every planned session clears it.
      while (now - sessionStart < BACKFILL_NEWEST_AGE_MS) {
        sessionStart -= MS_PER_DAY;
      }

      const sessionId = await ctx.db.insert("class_sessions", {
        institutionId: args.institutionId,
        courseId: args.courseIds[sectionIndex],
        sectionId: args.sectionIds[sectionIndex],
        venueId: args.venueIds[sectionIndex % args.venueIds.length],
        facultyId: args.facultyId,
        kind: "scheduled",
        status: "closed",
        startedAt: sessionStart,
        windowEndsAt: sessionStart + 50 * MS_PER_MINUTE,
        closedAt: sessionStart + 55 * MS_PER_MINUTE,
      });
      sessionsByWeekSection.set(backfillKey(0, week, sectionIndex), {
        sessionId,
        startedAt: sessionStart,
      });
    }
  }

  type PlannedEvent = {
    studentId: Id<"users">;
    studentIndex: 0 | 1;
    sectionId: Id<"sections">;
    sessionId: Id<"class_sessions">;
    state: "verified" | "flagged" | "rejected";
    decision: Decision;
    capturedAt: number;
  };
  const plannedEvents: PlannedEvent[] = [];

  for (const [studentIndex, table] of BACKFILL_OUTCOMES.entries()) {
    for (let week = 0; week < TERM_WEEKS; week += 1) {
      const row = table[week];
      if (row === undefined) continue;
      for (let sectionIndex = 0; sectionIndex < row.length; sectionIndex += 1) {
        const code = row[sectionIndex];
        if (code === "a") continue;
        const session = sessionsByWeekSection.get(backfillKey(0, week, sectionIndex));
        if (session === undefined) continue;

        const late = lateMinutes.get(backfillKey(studentIndex, week, sectionIndex));
        const minutesIn = late ?? ((week * 3 + sectionIndex * 2 + studentIndex * 5) % 9) + 2;
        const capturedAt = session.startedAt + minutesIn * MS_PER_MINUTE;

        const proxyCode = proxyCodes.get(backfillKey(studentIndex, week, sectionIndex));
        const decision = buildBackfillDecision(code, proxyCode, capturedAt);

        plannedEvents.push({
          studentId: students[studentIndex],
          studentIndex: studentIndex as 0 | 1,
          sectionId: args.sectionIds[sectionIndex],
          sessionId: session.sessionId,
          state: code === "f" ? "flagged" : code === "r" ? "rejected" : "verified",
          decision,
          capturedAt,
        });
      }
    }
  }

  plannedEvents.sort((a, b) => a.capturedAt - b.capturedAt);

  let attendanceSeq = 0;
  let attendancePrevHash: string | undefined;
  for (const event of plannedEvents) {
    const eventHash = await computeEventHash(
      attendanceChainHashInput({
        institutionId: args.institutionId,
        studentId: event.studentId,
        sectionId: event.sectionId,
        sessionId: event.sessionId,
        state: event.state,
        origin: "online",
        policyVersion: event.decision.policyVersion,
        seq: attendanceSeq,
        prevEventHash: attendancePrevHash,
      }),
    );
    await ctx.db.insert("attendance_events", {
      institutionId: args.institutionId,
      studentId: event.studentId,
      sectionId: event.sectionId,
      sessionId: event.sessionId,
      state: event.state,
      origin: "online",
      policyVersion: event.decision.policyVersion,
      seq: attendanceSeq,
      prevEventHash: attendancePrevHash,
      eventHash,
      decision: event.decision,
      capturedAt: event.capturedAt,
    });
    attendanceSeq += 1;
    attendancePrevHash = eventHash;
  }

  const ledgerAnomalies = BACKFILL_LEDGER_ANOMALIES.map((anomaly) => {
    const session = sessionsByWeekSection.get(backfillKey(0, anomaly.week, 0));
    return {
      studentId: students[anomaly.student],
      type: anomaly.type,
      createdAt: (session?.startedAt ?? termEnd) + 40 * MS_PER_MINUTE,
    };
  }).sort((a, b) => a.createdAt - b.createdAt);

  let ledgerSeq = 0;
  let ledgerPrevHash: string | undefined;
  let ledgerEvents = 0;
  for (const anomaly of ledgerAnomalies) {
    const eventHash = await computeEventHash({
      institutionId: args.institutionId,
      category: "attendance" as const,
      type: anomaly.type,
      subjectUserId: anomaly.studentId,
      payload: { reason: "fixture anomaly" },
      seq: ledgerSeq,
      prevEventHash: ledgerPrevHash,
    });
    await ctx.db.insert("event_ledger", {
      institutionId: args.institutionId,
      category: "attendance",
      type: anomaly.type,
      subjectUserId: anomaly.studentId,
      payload: { reason: "fixture anomaly" },
      seq: ledgerSeq,
      prevEventHash: ledgerPrevHash,
      eventHash,
      createdAt: anomaly.createdAt,
    });
    ledgerSeq += 1;
    ledgerPrevHash = eventHash;
    ledgerEvents += 1;
  }

  const attendanceChainOk = await verifyBackfillChain(ctx, args.institutionId);
  if (!attendanceChainOk) {
    throw new Error("seed backfill chain broken");
  }
  const ledgerChainOk = await verifyBackfillLedgerChain(ctx, args.institutionId);
  if (!ledgerChainOk) {
    throw new Error("seed backfill ledger chain broken");
  }

  return {
    sessions: sessionsByWeekSection.size,
    attendanceEvents: plannedEvents.length,
    ledgerEvents,
  };
}

/** Synthetic decision matching the shape the risk engine stamps for each outcome. */
function buildBackfillDecision(
  code: "v" | "f" | "r",
  proxyCode: string | undefined,
  capturedAt: number,
): Decision {
  if (code === "f") {
    return {
      outcome: "flag",
      evidence: {
        signals:
          proxyCode !== undefined
            ? [
                {
                  category: "person",
                  source: "face_match",
                  status: "failed",
                  detail: proxyCode === "person_spoof_suspected" ? "spoof_suspected" : "mismatch",
                },
              ]
            : [
                {
                  category: "device",
                  source: "device_registry",
                  status: "failed",
                  detail: "suspended",
                },
              ],
      },
      reasonCodes: proxyCode !== undefined ? [proxyCode] : ["device_distrusted"],
      policyVersion: RISK_POLICY_VERSION,
      decidedAt: capturedAt,
    };
  }
  if (code === "r") {
    return {
      outcome: "reject",
      evidence: {
        signals: [
          {
            category: "identity",
            source: "passkey_session",
            status: "failed",
            detail: "challenge_expired_use",
          },
        ],
      },
      reasonCodes: ["challenge_expired_use"],
      policyVersion: RISK_POLICY_VERSION,
      decidedAt: capturedAt,
    };
  }
  return {
    outcome: "accept",
    evidence: { signals: [] },
    reasonCodes: [],
    policyVersion: RISK_POLICY_VERSION,
    decidedAt: capturedAt,
  };
}

/** Walks the backfilled attendance chain with the seam's own hash math. */
async function verifyBackfillChain(
  ctx: MutationCtx,
  institutionId: Id<"institutions">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("attendance_events")
    .withIndex("by_institution_seq", (q) => q.eq("institutionId", institutionId))
    .order("asc")
    .collect();

  let expectedSeq = 0;
  let expectedPrevHash: string | undefined;
  for (const row of rows) {
    if (row.seq !== expectedSeq || row.prevEventHash !== expectedPrevHash) return false;
    const recomputed = await computeEventHash(
      attendanceChainHashInput({
        institutionId: row.institutionId,
        studentId: row.studentId,
        sectionId: row.sectionId,
        ...(row.sessionId !== undefined ? { sessionId: row.sessionId } : {}),
        state: row.state,
        origin: row.origin,
        ...(row.policyVersion !== undefined ? { policyVersion: row.policyVersion } : {}),
        seq: row.seq,
        prevEventHash: row.prevEventHash,
      }),
    );
    if (recomputed !== row.eventHash) return false;
    expectedSeq += 1;
    expectedPrevHash = row.eventHash;
  }
  return true;
}

/** Walks the backfilled event_ledger chain with appendLedgerEvent's own hash math. */
async function verifyBackfillLedgerChain(
  ctx: MutationCtx,
  institutionId: Id<"institutions">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("event_ledger")
    .withIndex("by_institution_seq", (q) => q.eq("institutionId", institutionId))
    .order("asc")
    .collect();

  let expectedSeq = 0;
  let expectedPrevHash: string | undefined;
  for (const row of rows) {
    if (row.seq !== expectedSeq || row.prevEventHash !== expectedPrevHash) return false;
    const recomputed = await computeEventHash({
      institutionId: row.institutionId,
      category: row.category,
      type: row.type,
      ...(row.actorUserId !== undefined ? { actorUserId: row.actorUserId } : {}),
      ...(row.subjectUserId !== undefined ? { subjectUserId: row.subjectUserId } : {}),
      ...(row.deviceId !== undefined ? { deviceId: row.deviceId } : {}),
      payload: row.payload as Record<string, unknown>,
      seq: row.seq,
      prevEventHash: row.prevEventHash,
    });
    if (recomputed !== row.eventHash) return false;
    expectedSeq += 1;
    expectedPrevHash = row.eventHash;
  }
  return true;
}
