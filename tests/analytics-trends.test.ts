import { describe, expect, it } from "vitest";

import {
  LATE_ARRIVAL_GRACE_MINUTES,
  isLateArrival,
  summarizeSectionTrends,
  type SectionTrendInput,
} from "@/lib/analytics/trends";

const SESSION_START = 1_700_000_000_000;

function sectionInput(overrides?: Partial<SectionTrendInput>): SectionTrendInput {
  return {
    section: {
      sectionId: "sec_1",
      courseCode: "CS101",
      courseTitle: "Intro to Computer Science",
      enrolledCount: 2,
    },
    sessions: [{ sessionId: "s1", startedAt: SESSION_START }],
    events: [],
    ...overrides,
  };
}

describe("isLateArrival", () => {
  it("treats a check-in exactly on the grace boundary as on time", () => {
    const boundary = SESSION_START + LATE_ARRIVAL_GRACE_MINUTES * 60_000;
    expect(isLateArrival(boundary, SESSION_START)).toBe(false);
    expect(isLateArrival(boundary + 1, SESSION_START)).toBe(true);
  });

  it("accepts a custom grace window", () => {
    expect(isLateArrival(SESSION_START + 5 * 60_000, SESSION_START, 5)).toBe(false);
    expect(isLateArrival(SESSION_START + 5 * 60_000 + 1, SESSION_START, 5)).toBe(true);
  });
});

describe("summarizeSectionTrends", () => {
  it("computes the verified rate over enrolled sessions", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          { sessionId: "s1", studentId: "st1", state: "verified", capturedAt: SESSION_START },
          { sessionId: "s1", studentId: "st2", state: "rejected", capturedAt: SESSION_START },
        ],
      }),
    ]);
    expect(rows[0]).toEqual({
      sectionId: "sec_1",
      courseCode: "CS101",
      courseTitle: "Intro to Computer Science",
      sessionsHeld: 1,
      enrolledCount: 2,
      verifiedTotal: 1,
      flaggedTotal: 0,
      rejectedTotal: 1,
      lateArrivals: 0,
      attendanceRatePct: 50,
    });
  });

  it("returns a null rate when no sessions were held or nobody is enrolled", () => {
    const rows = summarizeSectionTrends([
      sectionInput({ sessions: [], events: [] }),
      sectionInput({
        sessions: [{ sessionId: "s1", startedAt: SESSION_START }],
        section: {
          sectionId: "sec_2",
          courseCode: "CS102",
          courseTitle: "Empty Section",
          enrolledCount: 0,
        },
      }),
    ]);
    expect(rows[0].attendanceRatePct).toBeNull();
    expect(rows[1].attendanceRatePct).toBeNull();
  });

  it("resolves a student to their latest event, so flagged then corrected counts as verified", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          { sessionId: "s1", studentId: "st1", state: "flagged", capturedAt: SESSION_START },
          { sessionId: "s1", studentId: "st1", state: "corrected", capturedAt: SESSION_START + 1 },
        ],
      }),
    ]);
    expect(rows[0].verifiedTotal).toBe(1);
    expect(rows[0].flaggedTotal).toBe(0);
  });

  it("prefers later array entries when capturedAt values tie", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          { sessionId: "s1", studentId: "st1", state: "rejected", capturedAt: SESSION_START },
          { sessionId: "s1", studentId: "st1", state: "verified", capturedAt: SESSION_START },
        ],
      }),
    ]);
    expect(rows[0].verifiedTotal).toBe(1);
    expect(rows[0].rejectedTotal).toBe(0);
  });

  it("maps session_verified to the verified bucket", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          {
            sessionId: "s1",
            studentId: "st1",
            state: "session_verified",
            capturedAt: SESSION_START,
          },
        ],
      }),
    ]);
    expect(rows[0].verifiedTotal).toBe(1);
  });

  it("ignores unresolved pipeline states entirely", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          { sessionId: "s1", studentId: "st1", state: "step_up", capturedAt: SESSION_START },
          {
            sessionId: "s1",
            studentId: "st2",
            state: "presence_evaluated",
            capturedAt: SESSION_START,
          },
        ],
      }),
    ]);
    expect(rows[0].verifiedTotal).toBe(0);
    expect(rows[0].flaggedTotal).toBe(0);
    expect(rows[0].rejectedTotal).toBe(0);
    expect(rows[0].attendanceRatePct).toBe(0);
  });

  it("counts late arrivals from the student's earliest capture in the session", () => {
    const grace = LATE_ARRIVAL_GRACE_MINUTES * 60_000;
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          {
            sessionId: "s1",
            studentId: "st1",
            state: "flagged",
            capturedAt: SESSION_START + grace + 5,
          },
          {
            sessionId: "s1",
            studentId: "st1",
            state: "corrected",
            capturedAt: SESSION_START + grace + 10,
          },
          {
            sessionId: "s1",
            studentId: "st2",
            state: "verified",
            capturedAt: SESSION_START + grace,
          },
        ],
      }),
    ]);
    expect(rows[0].verifiedTotal).toBe(2);
    expect(rows[0].lateArrivals).toBe(1);
  });

  it("does not count lateness for non-verified buckets", () => {
    const grace = LATE_ARRIVAL_GRACE_MINUTES * 60_000;
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          {
            sessionId: "s1",
            studentId: "st1",
            state: "rejected",
            capturedAt: SESSION_START + grace + 5,
          },
        ],
      }),
    ]);
    expect(rows[0].lateArrivals).toBe(0);
  });

  it("ignores events for sessions outside the input", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        events: [
          { sessionId: "sX", studentId: "st1", state: "verified", capturedAt: SESSION_START },
        ],
      }),
    ]);
    expect(rows[0].verifiedTotal).toBe(0);
  });

  it("aggregates across multiple sessions and preserves input order", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        section: {
          sectionId: "sec_a",
          courseCode: "A",
          courseTitle: "Course A",
          enrolledCount: 1,
        },
        sessions: [
          { sessionId: "s1", startedAt: SESSION_START },
          { sessionId: "s2", startedAt: SESSION_START + 1000 },
        ],
        events: [
          { sessionId: "s1", studentId: "st1", state: "verified", capturedAt: SESSION_START },
          { sessionId: "s2", studentId: "st1", state: "flagged", capturedAt: SESSION_START + 1000 },
        ],
      }),
      sectionInput({
        section: {
          sectionId: "sec_b",
          courseCode: "B",
          courseTitle: "Course B",
          enrolledCount: 3,
        },
        sessions: [{ sessionId: "s3", startedAt: SESSION_START }],
        events: [
          { sessionId: "s3", studentId: "st1", state: "verified", capturedAt: SESSION_START },
        ],
      }),
    ]);
    expect(rows.map((row) => row.sectionId)).toEqual(["sec_a", "sec_b"]);
    expect(rows[0].verifiedTotal).toBe(1);
    expect(rows[0].flaggedTotal).toBe(1);
    expect(rows[0].attendanceRatePct).toBe(50);
    expect(rows[1].attendanceRatePct).toBeCloseTo(33.3, 5);
  });

  it("rounds the rate to one decimal place", () => {
    const rows = summarizeSectionTrends([
      sectionInput({
        section: {
          sectionId: "sec_1",
          courseCode: "CS101",
          courseTitle: "Intro",
          enrolledCount: 3,
        },
        events: [
          { sessionId: "s1", studentId: "st1", state: "verified", capturedAt: SESSION_START },
        ],
      }),
    ]);
    expect(rows[0].attendanceRatePct).toBe(33.3);
  });
});
