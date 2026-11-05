export const DEFAULT_ATTENDANCE_THRESHOLD_PERCENT = 75;

/** "absent" is never stored: it is synthesized for closed sessions a student left no event in (see isAbsence). */
export type AttendanceRecordState =
  "verified" | "flagged" | "pending" | "rejected" | "corrected" | "absent";

export type AttendanceSummary = {
  totalHeld: number;
  verifiedCount: number;
  flaggedCount: number;
  pendingCount: number;
  /** Rejected check-ins plus missed (absent) classes. */
  rejectedCount: number;
  percentage: number;
  mustAttend: number;
  canMiss: number;
};

/** Projects a raw attendance_events lifecycle state to the record states history and analytics surfaces render. */
export function projectAttendanceState(state: string): AttendanceRecordState {
  if (state === "session_verified" || state === "verified") return "verified";
  if (state === "flagged" || state === "rejected" || state === "corrected") return state;
  return "pending";
}

/**
 * Absences are never written as events. A student was absent from a class
 * session when it has closed, it started at or after they enrolled in its
 * section, and they left no attendance event for it. Student history,
 * trajectory analytics and admin reports all count absences by this rule.
 */
export function isAbsence(args: {
  session: { status: string; startedAt: number };
  enrolledAt: number;
  attended: boolean;
}): boolean {
  return (
    args.session.status === "closed" && args.session.startedAt >= args.enrolledAt && !args.attended
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeAttendance(
  records: Array<{ state: AttendanceRecordState }>,
  thresholdPercent: number = DEFAULT_ATTENDANCE_THRESHOLD_PERCENT,
): AttendanceSummary {
  if (thresholdPercent <= 0 || thresholdPercent >= 100) {
    throw new RangeError("thresholdPercent must be greater than 0 and less than 100");
  }

  let verifiedCount = 0;
  let flaggedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  for (const record of records) {
    if (record.state === "verified" || record.state === "corrected") verifiedCount += 1;
    else if (record.state === "flagged") flaggedCount += 1;
    else if (record.state === "pending") pendingCount += 1;
    else if (record.state === "rejected" || record.state === "absent") rejectedCount += 1;
  }

  const totalHeld = records.filter((record) => record.state !== "pending").length;
  const threshold = thresholdPercent / 100;

  if (totalHeld === 0) {
    return {
      totalHeld: 0,
      verifiedCount,
      flaggedCount,
      pendingCount,
      rejectedCount,
      percentage: 100,
      mustAttend: 0,
      canMiss: 0,
    };
  }

  const meetsThreshold = verifiedCount / totalHeld >= threshold;
  const percentage = round1((verifiedCount / totalHeld) * 100);
  const mustAttend = meetsThreshold
    ? 0
    : Math.ceil((threshold * totalHeld - verifiedCount) / (1 - threshold));
  const canMiss = meetsThreshold
    ? Math.floor((verifiedCount - threshold * totalHeld) / threshold)
    : 0;

  return {
    totalHeld,
    verifiedCount,
    flaggedCount,
    pendingCount,
    rejectedCount,
    percentage,
    mustAttend,
    canMiss,
  };
}
