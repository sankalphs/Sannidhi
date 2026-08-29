import {
  DEFAULT_ATTENDANCE_THRESHOLD_PERCENT,
  summarizeAttendance,
  type AttendanceRecordState,
  type AttendanceSummary,
} from "@/lib/attendance/projection";

export type TrajectoryRecordState = AttendanceRecordState | "absent";

export type TrajectoryRecord = { state: TrajectoryRecordState; capturedAt: number };

export type TrajectoryTrend = "improving" | "steady" | "declining";

export type StudentTrajectory = {
  summary: AttendanceSummary;
  consecutiveMisses: number;
  trend: TrajectoryTrend;
  atRisk: boolean;
  /** Machine-readable explainable factors, e.g. "attendance_below_threshold", "consecutive_absences:4". */
  factors: string[];
};

export const CONSECUTIVE_MISS_ALERT_THRESHOLD = 3;

const TREND_MIN_RECORDS = 4;
const TREND_DELTA_PERCENT = 10;

/** Counts a miss run from the end of the held record list, stopping at the first favorable outcome. */
function countTrailingMisses(states: TrajectoryRecordState[]): number {
  let misses = 0;
  for (let i = states.length - 1; i >= 0; i -= 1) {
    const state = states[i];
    if (state === "flagged" || state === "rejected" || state === "absent") {
      misses += 1;
    } else {
      break;
    }
  }
  return misses;
}

/** Compares verified+corrected share of the second half against the first half of the held record list. */
function computeTrend(states: TrajectoryRecordState[]): TrajectoryTrend {
  if (states.length < TREND_MIN_RECORDS) return "steady";

  const firstHalfLength = Math.floor(states.length / 2);
  const firstHalf = states.slice(0, firstHalfLength);
  const secondHalf = states.slice(firstHalfLength);

  const rate = (records: TrajectoryRecordState[]) =>
    records.filter((state) => state === "verified" || state === "corrected").length /
    records.length;

  const delta = (rate(secondHalf) - rate(firstHalf)) * 100;
  if (delta >= TREND_DELTA_PERCENT) return "improving";
  if (delta <= -TREND_DELTA_PERCENT) return "declining";
  return "steady";
}

/**
 * Per-student trajectory over chronologically sorted records; the caller may
 * pass any order, the function re-sorts by capturedAt defensively before
 * summarizing.
 */
export function analyzeTrajectory(
  records: TrajectoryRecord[],
  thresholdPercent: number = DEFAULT_ATTENDANCE_THRESHOLD_PERCENT,
): StudentTrajectory {
  const sorted = [...records].sort((a, b) => a.capturedAt - b.capturedAt);
  const summary = summarizeAttendance(
    sorted.map((record) => ({
      state: record.state === "absent" ? ("rejected" as const) : record.state,
    })),
    thresholdPercent,
  );

  const heldStates = sorted
    .filter((record) => record.state !== "pending")
    .map((record) => record.state);
  const consecutiveMisses = countTrailingMisses(heldStates);
  const trend = computeTrend(heldStates);
  const belowThreshold = summary.totalHeld >= 3 && summary.percentage < thresholdPercent;
  const atRisk = belowThreshold || consecutiveMisses >= CONSECUTIVE_MISS_ALERT_THRESHOLD;

  const factors: string[] = [];
  if (belowThreshold) factors.push("attendance_below_threshold");
  if (consecutiveMisses >= CONSECUTIVE_MISS_ALERT_THRESHOLD) {
    factors.push(`consecutive_absences:${consecutiveMisses}`);
  }

  return { summary, consecutiveMisses, trend, atRisk, factors };
}
