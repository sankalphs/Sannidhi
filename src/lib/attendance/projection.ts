export const DEFAULT_ATTENDANCE_THRESHOLD_PERCENT = 75;

export type AttendanceRecordState = "verified" | "flagged" | "pending" | "rejected" | "corrected";

export type AttendanceSummary = {
  totalHeld: number;
  verifiedCount: number;
  flaggedCount: number;
  pendingCount: number;
  rejectedCount: number;
  percentage: number;
  mustAttend: number;
  canMiss: number;
};

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
    if (record.state === "verified") verifiedCount += 1;
    else if (record.state === "flagged") flaggedCount += 1;
    else if (record.state === "pending") pendingCount += 1;
    else if (record.state === "rejected") rejectedCount += 1;
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
