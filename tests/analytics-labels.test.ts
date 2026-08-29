import { describe, expect, it } from "vitest";

import { formatReasonCode, REASON_LABELS } from "@/lib/analytics/labels";

describe("formatReasonCode", () => {
  it("maps known reason codes to their labels", () => {
    expect(formatReasonCode("person_spoof_suspected")).toBe("Face spoof suspected");
    expect(formatReasonCode("person_face_mismatch")).toBe("Face mismatch");
    expect(formatReasonCode("device_distrusted")).toBe("Distrusted device");
    expect(formatReasonCode("spot_recheck_missed")).toBe("Missed spot re-check");
    expect(formatReasonCode("attendance_below_threshold")).toBe("Attendance below threshold");
  });

  it("formats prefixed factors", () => {
    expect(formatReasonCode("consecutive_absences:4")).toBe("4 consecutive absences");
    expect(formatReasonCode("attendance:62.5%")).toBe("Attendance at 62.5%");
    expect(formatReasonCode("proxy_flags:2")).toBe("2 flagged check-ins");
    expect(formatReasonCode("proxy_flags:1")).toBe("1 flagged check-in");
    expect(formatReasonCode("ledger_anomalies:3")).toBe("3 ledger anomalies");
    expect(formatReasonCode("ledger_anomalies:1")).toBe("1 ledger anomaly");
    expect(formatReasonCode("device_state:distrusted")).toBe("Device state: distrusted");
  });

  it("returns unknown codes raw", () => {
    expect(formatReasonCode("some_new_code")).toBe("some_new_code");
    expect(formatReasonCode("prefix:unknown")).toBe("prefix:unknown");
  });

  it("prefers the exact table over prefix rules", () => {
    expect(REASON_LABELS["attendance_below_threshold"]).toBe("Attendance below threshold");
    expect(formatReasonCode("challenge_expired_use")).toBe("Expired challenge");
  });
});
