export const LATE_ARRIVAL_GRACE_MINUTES = 15;

export type SectionTrendRow = {
  sectionId: string;
  courseCode: string;
  courseTitle: string;
  sessionsHeld: number;
  enrolledCount: number;
  /** Distinct student-session check-ins resolved verified or corrected. */
  verifiedTotal: number;
  flaggedTotal: number;
  rejectedTotal: number;
  lateArrivals: number;
  /** Verified share of enrolled * sessions, 0-100 rounded to 1dp; null when no sessions held. */
  attendanceRatePct: number | null;
};

export type SectionTrendInput = {
  section: { sectionId: string; courseCode: string; courseTitle: string; enrolledCount: number };
  sessions: Array<{ sessionId: string; startedAt: number }>;
  /** Decision-lifecycle attendance events for this section's sessions. */
  events: Array<{ sessionId: string; studentId: string; state: string; capturedAt: number }>;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Late when a check-in lands strictly after the grace window; exactly on the boundary is on time. */
export function isLateArrival(
  capturedAt: number,
  sessionStartedAt: number,
  graceMinutes: number = LATE_ARRIVAL_GRACE_MINUTES,
): boolean {
  return capturedAt > sessionStartedAt + graceMinutes * 60_000;
}

type ResolvedBucket = "verified" | "flagged" | "rejected";

/** Maps a raw lifecycle state to its trend bucket, or null when the session is still unresolved. */
function resolveBucket(state: string): ResolvedBucket | null {
  if (state === "corrected" || state === "verified" || state === "session_verified")
    return "verified";
  if (state === "flagged") return "flagged";
  if (state === "rejected") return "rejected";
  return null;
}

type StudentSession = {
  /** Latest event's capturedAt; later array entries win ties. */
  latestCapturedAt: number;
  latestState: string;
  /** Earliest event capturedAt, used for lateness. */
  earliestCapturedAt: number;
};

/**
 * Per-section trend rollup: resolves each student-session to its latest event,
 * buckets it, and measures late arrivals among resolved-verified check-ins by
 * each student's earliest capture in the session.
 */
export function summarizeSectionTrends(inputs: SectionTrendInput[]): SectionTrendRow[] {
  return inputs.map((input) => {
    const startedAtBySession = new Map(
      input.sessions.map((session) => [session.sessionId, session.startedAt]),
    );

    const byStudentSession = new Map<string, StudentSession>();
    for (const event of input.events) {
      if (!startedAtBySession.has(event.sessionId)) continue;
      const key = `${event.sessionId}:${event.studentId}`;
      const existing = byStudentSession.get(key);
      if (existing === undefined) {
        byStudentSession.set(key, {
          latestCapturedAt: event.capturedAt,
          latestState: event.state,
          earliestCapturedAt: event.capturedAt,
        });
        continue;
      }
      if (event.capturedAt >= existing.latestCapturedAt) {
        existing.latestCapturedAt = event.capturedAt;
        existing.latestState = event.state;
      }
      if (event.capturedAt < existing.earliestCapturedAt) {
        existing.earliestCapturedAt = event.capturedAt;
      }
    }

    let verifiedTotal = 0;
    let flaggedTotal = 0;
    let rejectedTotal = 0;
    let lateArrivals = 0;

    for (const [key, studentSession] of byStudentSession) {
      const bucket = resolveBucket(studentSession.latestState);
      if (bucket === null) continue;
      if (bucket === "verified") {
        verifiedTotal += 1;
        const sessionId = key.slice(0, key.lastIndexOf(":"));
        const startedAt = startedAtBySession.get(sessionId);
        if (
          startedAt !== undefined &&
          isLateArrival(studentSession.earliestCapturedAt, startedAt)
        ) {
          lateArrivals += 1;
        }
      } else if (bucket === "flagged") {
        flaggedTotal += 1;
      } else {
        rejectedTotal += 1;
      }
    }

    const denominator = input.sessions.length * input.section.enrolledCount;
    const attendanceRatePct =
      denominator === 0 ? null : round1((verifiedTotal / denominator) * 100);

    return {
      sectionId: input.section.sectionId,
      courseCode: input.section.courseCode,
      courseTitle: input.section.courseTitle,
      sessionsHeld: input.sessions.length,
      enrolledCount: input.section.enrolledCount,
      verifiedTotal,
      flaggedTotal,
      rejectedTotal,
      lateArrivals,
      attendanceRatePct,
    };
  });
}
