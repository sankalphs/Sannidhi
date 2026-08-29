import { describe, expect, it } from "vitest";

import {
  CONSECUTIVE_MISS_ALERT_THRESHOLD,
  analyzeTrajectory,
  type TrajectoryRecord,
} from "@/lib/analytics/trajectory";

const BASE_MS = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function chronological(...states: TrajectoryRecord["state"][]): TrajectoryRecord[] {
  return states.map((state, index) => ({ state, capturedAt: BASE_MS + index * DAY_MS }));
}

describe("analyzeTrajectory", () => {
  it("flags a below-threshold student as at risk with the attendance factor", () => {
    const trajectory = analyzeTrajectory(
      chronological("rejected", "verified", "rejected", "rejected", "verified"),
    );
    expect(trajectory.summary.totalHeld).toBe(5);
    expect(trajectory.summary.percentage).toBe(40);
    expect(trajectory.atRisk).toBe(true);
    expect(trajectory.factors).toEqual(["attendance_below_threshold"]);
  });

  it("treats absent records as unfavorable outcomes that still count toward miss runs", () => {
    const trajectory = analyzeTrajectory(chronological("verified", "absent", "absent", "absent"));
    expect(trajectory.summary.totalHeld).toBe(4);
    expect(trajectory.summary.percentage).toBe(25);
    expect(trajectory.summary.rejectedCount).toBe(3);
    expect(trajectory.consecutiveMisses).toBe(3);
    expect(trajectory.atRisk).toBe(true);
  });

  it("counts the trailing run of misses and excludes pending records from it", () => {
    const trajectory = analyzeTrajectory(
      chronological("rejected", "verified", "pending", "absent", "flagged"),
    );
    expect(trajectory.consecutiveMisses).toBe(2);
    expect(trajectory.summary.pendingCount).toBe(1);
  });

  it("stops the trailing run at the first favorable outcome", () => {
    const trajectory = analyzeTrajectory(chronological("rejected", "verified", "rejected"));
    expect(trajectory.consecutiveMisses).toBe(1);
  });

  it("reports improving when the second-half verified rate climbs by at least 10 points", () => {
    const trajectory = analyzeTrajectory(
      chronological("rejected", "rejected", "verified", "verified"),
    );
    expect(trajectory.trend).toBe("improving");
  });

  it("reports declining when the second-half verified rate drops by at least 10 points", () => {
    const trajectory = analyzeTrajectory(
      chronological("verified", "verified", "rejected", "rejected"),
    );
    expect(trajectory.trend).toBe("declining");
  });

  it("reports steady when the halves differ by less than 10 points", () => {
    const trajectory = analyzeTrajectory(
      chronological("verified", "rejected", "verified", "rejected"),
    );
    expect(trajectory.trend).toBe("steady");
  });

  it("defaults the trend to steady with fewer than four held records", () => {
    const trajectory = analyzeTrajectory(chronological("verified", "verified", "rejected"));
    expect(trajectory.trend).toBe("steady");
  });

  it("treats corrected records as verified for the trend halves", () => {
    const trajectory = analyzeTrajectory(
      chronological("rejected", "rejected", "corrected", "verified"),
    );
    expect(trajectory.trend).toBe("improving");
  });

  it("returns a clean non-risk trajectory for empty records", () => {
    const trajectory = analyzeTrajectory([]);
    expect(trajectory.summary.totalHeld).toBe(0);
    expect(trajectory.summary.percentage).toBe(100);
    expect(trajectory.atRisk).toBe(false);
    expect(trajectory.consecutiveMisses).toBe(0);
    expect(trajectory.trend).toBe("steady");
    expect(trajectory.factors).toEqual([]);
  });

  it("sorts records by capturedAt before analyzing", () => {
    const records = chronological("verified", "verified", "rejected", "rejected").reverse();
    const trajectory = analyzeTrajectory(records);
    expect(trajectory.summary.percentage).toBe(50);
    expect(trajectory.consecutiveMisses).toBe(2);
  });

  it("stays safe at threshold with a small history", () => {
    const trajectory = analyzeTrajectory(chronological("rejected", "rejected"));
    expect(trajectory.summary.totalHeld).toBe(2);
    expect(trajectory.atRisk).toBe(false);
    expect(trajectory.factors).toEqual([]);
  });

  it("honours a custom threshold", () => {
    const trajectory = analyzeTrajectory(
      chronological("verified", "verified", "verified", "rejected", "rejected"),
      50,
    );
    expect(trajectory.summary.percentage).toBe(60);
    expect(trajectory.atRisk).toBe(false);
    expect(trajectory.factors).toEqual([]);
  });

  it("surfaces consecutive absences once the alert threshold is met", () => {
    const trajectory = analyzeTrajectory(chronological("verified", "absent", "absent", "absent"));
    expect(CONSECUTIVE_MISS_ALERT_THRESHOLD).toBe(3);
    expect(trajectory.factors).toEqual(["attendance_below_threshold", "consecutive_absences:3"]);
    expect(trajectory.atRisk).toBe(true);
  });

  it("reports both factors when below threshold and in a long miss run", () => {
    const trajectory = analyzeTrajectory(
      chronological("verified", "absent", "absent", "absent", "absent"),
    );
    expect(trajectory.summary.percentage).toBe(20);
    expect(trajectory.factors).toEqual(["attendance_below_threshold", "consecutive_absences:4"]);
  });

  it("passes invalid thresholds through to summarizeAttendance", () => {
    expect(() => analyzeTrajectory(chronological("verified"), 0)).toThrow(RangeError);
    expect(() => analyzeTrajectory(chronological("verified"), 100)).toThrow(RangeError);
  });
});
