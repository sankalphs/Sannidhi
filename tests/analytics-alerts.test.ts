import { describe, expect, it } from "vitest";

import { ANOMALY_ALERT_THRESHOLD, deriveAlerts } from "@/lib/analytics/alerts";
import { analyzeTrajectory } from "@/lib/analytics/trajectory";
import type { TrajectoryRecord } from "@/lib/analytics/trajectory";

const BASE_MS = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function safeTrajectory() {
  return analyzeTrajectory(
    Array.from<TrajectoryRecord[]>([[{ state: "verified", capturedAt: BASE_MS }]]).flat(),
  );
}

function atRiskTrajectory() {
  const records: TrajectoryRecord[] = ["rejected", "verified", "rejected", "rejected"].map(
    (state, index) => ({
      state: state as TrajectoryRecord["state"],
      capturedAt: BASE_MS + index * DAY_MS,
    }),
  );
  return analyzeTrajectory(records);
}

describe("deriveAlerts", () => {
  it("fires only low_attendance when the trajectory is at risk", () => {
    const alerts = deriveAlerts({
      trajectory: atRiskTrajectory(),
      proxy: null,
      verificationAnomalyCount: 0,
    });
    expect(alerts).toEqual([
      {
        kind: "low_attendance",
        factors: ["attendance_below_threshold", "attendance:25%"],
      },
    ]);
  });

  it("fires proxy_attempt from a single qualifying flagged event", () => {
    const alerts = deriveAlerts({
      trajectory: safeTrajectory(),
      proxy: {
        studentId: "s1",
        flaggedCount: 1,
        reasonCodes: ["person_spoof_suspected", "repeated_anomaly"],
        latestAt: BASE_MS,
      },
      verificationAnomalyCount: 0,
    });
    expect(alerts).toEqual([
      {
        kind: "proxy_attempt",
        factors: ["proxy_flags:1", "person_spoof_suspected", "repeated_anomaly"],
      },
    ]);
  });

  it("does not fire proxy_attempt when the proxy row is absent or has zero flags", () => {
    expect(
      deriveAlerts({ trajectory: safeTrajectory(), proxy: null, verificationAnomalyCount: 0 }),
    ).toEqual([]);
    expect(
      deriveAlerts({
        trajectory: safeTrajectory(),
        proxy: { studentId: "s1", flaggedCount: 0, reasonCodes: [], latestAt: 0 },
        verificationAnomalyCount: 0,
      }),
    ).toEqual([]);
  });

  it("respects the ledger anomaly threshold of 3", () => {
    expect(ANOMALY_ALERT_THRESHOLD).toBe(3);
    expect(
      deriveAlerts({ trajectory: safeTrajectory(), proxy: null, verificationAnomalyCount: 2 }),
    ).toEqual([]);
    expect(
      deriveAlerts({ trajectory: safeTrajectory(), proxy: null, verificationAnomalyCount: 3 }),
    ).toEqual([{ kind: "verification_anomaly", factors: ["ledger_anomalies:3"] }]);
  });

  it("fires all three kinds in a stable order when all conditions hold", () => {
    const alerts = deriveAlerts({
      trajectory: atRiskTrajectory(),
      proxy: {
        studentId: "s1",
        flaggedCount: 2,
        reasonCodes: ["device_distrusted"],
        latestAt: BASE_MS,
      },
      verificationAnomalyCount: 4,
    });
    expect(alerts.map((alert) => alert.kind)).toEqual([
      "low_attendance",
      "proxy_attempt",
      "verification_anomaly",
    ]);
    expect(alerts[0].factors).toEqual(["attendance_below_threshold", "attendance:25%"]);
    expect(alerts[1].factors).toEqual(["proxy_flags:2", "device_distrusted"]);
    expect(alerts[2].factors).toEqual(["ledger_anomalies:4"]);
  });

  it("dedupes factors in the low_attendance alert while preserving order", () => {
    const trajectory = analyzeTrajectory(
      ["absent", "absent", "absent", "absent"].map((state, index) => ({
        state: state as TrajectoryRecord["state"],
        capturedAt: BASE_MS + index * DAY_MS,
      })),
    );
    const alerts = deriveAlerts({
      trajectory,
      proxy: null,
      verificationAnomalyCount: 0,
    });
    expect(alerts).toEqual([
      {
        kind: "low_attendance",
        factors: ["attendance_below_threshold", "consecutive_absences:4", "attendance:0%"],
      },
    ]);
  });

  it("returns an empty list when nothing fires", () => {
    expect(
      deriveAlerts({ trajectory: safeTrajectory(), proxy: null, verificationAnomalyCount: 0 }),
    ).toEqual([]);
  });
});
