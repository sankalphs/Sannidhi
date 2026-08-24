import { describe, expect, it } from "vitest";

import {
  DEFAULT_ATTENDANCE_THRESHOLD_PERCENT,
  summarizeAttendance,
  type AttendanceRecordState,
} from "@/lib/attendance/projection";

function records(...states: AttendanceRecordState[]) {
  return states.map((state) => ({ state }));
}

describe("summarizeAttendance", () => {
  it("returns an empty summary with full percentage for no records", () => {
    const summary = summarizeAttendance([]);
    expect(summary).toEqual({
      totalHeld: 0,
      verifiedCount: 0,
      flaggedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      percentage: 100,
      mustAttend: 0,
      canMiss: 0,
    });
  });

  it("counts every held state as fully attended when all records are verified", () => {
    const summary = summarizeAttendance(records("verified", "verified", "verified"));
    expect(summary.totalHeld).toBe(3);
    expect(summary.verifiedCount).toBe(3);
    expect(summary.flaggedCount).toBe(0);
    expect(summary.rejectedCount).toBe(0);
    expect(summary.percentage).toBe(100);
    expect(summary.mustAttend).toBe(0);
    expect(summary.canMiss).toBe(1);
  });

  it("counts corrected records as verified and each distinct state exactly once in mixed records", () => {
    const summary = summarizeAttendance(
      records(
        "verified",
        "flagged",
        "pending",
        "rejected",
        "corrected",
        "flagged",
        "verified",
        "corrected",
        "rejected",
      ),
    );
    expect(summary.verifiedCount).toBe(4);
    expect(summary.flaggedCount).toBe(2);
    expect(summary.pendingCount).toBe(1);
    expect(summary.rejectedCount).toBe(2);
    expect(summary.totalHeld).toBe(8);
  });

  it("excludes pending records from totalHeld while still counting them", () => {
    const summary = summarizeAttendance(records("pending", "pending", "verified"));
    expect(summary.pendingCount).toBe(2);
    expect(summary.totalHeld).toBe(1);
    expect(summary.percentage).toBe(100);
  });

  it("reports a fully pending term as not yet held", () => {
    const summary = summarizeAttendance(records("pending", "pending"));
    expect(summary.totalHeld).toBe(0);
    expect(summary.percentage).toBe(100);
    expect(summary.mustAttend).toBe(0);
    expect(summary.canMiss).toBe(0);
  });

  it("rounds percentage to one decimal place", () => {
    const summary = summarizeAttendance(records("verified", "rejected", "rejected"));
    expect(summary.percentage).toBeCloseTo(33.3, 5);

    const mixedSummary = summarizeAttendance(
      records("verified", "verified", "flagged", "rejected", "rejected", "rejected"),
    );
    expect(mixedSummary.percentage).toBeCloseTo(33.3, 5);
  });

  it("computes mustAttend by rounding up required future attendance below threshold", () => {
    const summary = summarizeAttendance(records("rejected", "rejected", "rejected", "rejected"));
    expect(summary.totalHeld).toBe(4);
    expect(summary.verifiedCount).toBe(0);
    expect(summary.mustAttend).toBe(12);
    expect(summary.canMiss).toBe(0);
  });

  it("floors partial surplus attendance above the threshold", () => {
    const summary = summarizeAttendance(
      records("verified", "verified", "verified", "verified", "verified", "rejected"),
    );
    expect(summary.totalHeld).toBe(6);
    expect(summary.verifiedCount).toBe(5);
    expect(summary.percentage).toBeCloseTo(83.3, 5);
    expect(summary.mustAttend).toBe(0);
    expect(summary.canMiss).toBe(0);
  });

  it("keeps only whole surplus sessions above the threshold", () => {
    const summary = summarizeAttendance(
      records("verified", "verified", "verified", "verified", "verified", "verified", "rejected"),
    );
    expect(summary.totalHeld).toBe(7);
    expect(summary.verifiedCount).toBe(6);
    expect(summary.mustAttend).toBe(0);
    expect(summary.canMiss).toBe(1);
  });

  it("computes canMiss by flooring surplus attendance above threshold", () => {
    const summary = summarizeAttendance(
      records(
        "verified",
        "verified",
        "verified",
        "verified",
        "verified",
        "verified",
        "verified",
        "verified",
        "verified",
        "flagged",
      ),
    );
    expect(summary.totalHeld).toBe(10);
    expect(summary.verifiedCount).toBe(9);
    expect(summary.mustAttend).toBe(0);
    expect(summary.canMiss).toBe(2);
  });

  it("requires zero extra sessions and allows zero misses at exact threshold equality", () => {
    const summary = summarizeAttendance(records("verified", "verified", "verified", "rejected"));
    expect(summary.totalHeld).toBe(4);
    expect(summary.verifiedCount / summary.totalHeld).toBeCloseTo(0.75, 10);
    expect(summary.mustAttend).toBe(0);
    expect(summary.canMiss).toBe(0);
  });

  it("honours a custom threshold for both directions", () => {
    const below = summarizeAttendance(records("verified", "rejected", "rejected"), 50);
    expect(below.totalHeld).toBe(3);
    expect(below.verifiedCount / below.totalHeld).toBeLessThan(0.5);
    expect(below.mustAttend).toBe(1);
    expect(below.canMiss).toBe(0);

    const exact = summarizeAttendance(records("verified", "verified", "rejected", "rejected"), 50);
    expect(exact.mustAttend).toBe(0);
    expect(exact.canMiss).toBe(0);

    const above = summarizeAttendance(records("verified", "verified", "verified", "rejected"), 50);
    expect(above.mustAttend).toBe(0);
    expect(above.canMiss).toBe(2);
  });

  it("uses the default threshold of 75 percent", () => {
    expect(DEFAULT_ATTENDANCE_THRESHOLD_PERCENT).toBe(75);
    const summary = summarizeAttendance(records("verified", "rejected", "rejected"));
    expect(summary.totalHeld).toBe(3);
    expect(summary.verifiedCount / summary.totalHeld).toBeLessThan(0.75);
    expect(summary.mustAttend).toBe(5);
  });

  it.each([0, -1, 100, 150])("rejects a threshold of %d percent", (thresholdPercent) => {
    expect(() => summarizeAttendance(records("verified"), thresholdPercent)).toThrow(RangeError);
  });
});
