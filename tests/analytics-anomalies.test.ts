import { describe, expect, it } from "vitest";

import {
  PROXY_LOOKBACK_DAYS,
  PROXY_REASON_CODES,
  VERIFICATION_ANOMALY_TYPES,
  summarizeProxyAttempts,
  summarizeVerificationAnomalies,
} from "@/lib/analytics/anomalies";

const SINCE = 1_700_000_000_000;

describe("summarizeProxyAttempts", () => {
  it("includes events at the window boundary and excludes earlier ones", () => {
    const rows = summarizeProxyAttempts(
      [
        { studentId: "s1", reasonCodes: ["person_spoof_suspected"], capturedAt: SINCE },
        { studentId: "s1", reasonCodes: ["person_spoof_suspected"], capturedAt: SINCE - 1 },
      ],
      SINCE,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].flaggedCount).toBe(1);
  });

  it("ignores events without a proxy reason code", () => {
    const rows = summarizeProxyAttempts(
      [
        { studentId: "s1", reasonCodes: ["identity_unverified"], capturedAt: SINCE },
        { studentId: "s2", reasonCodes: ["person_spoof_suspected"], capturedAt: SINCE },
      ],
      SINCE,
    );
    expect(rows.map((row) => row.studentId)).toEqual(["s2"]);
  });

  it("keeps only proxy reason codes and dedupes them sorted alphabetically", () => {
    const rows = summarizeProxyAttempts(
      [
        {
          studentId: "s1",
          reasonCodes: ["repeated_anomaly", "identity_unverified", "person_face_mismatch"],
          capturedAt: SINCE,
        },
        {
          studentId: "s1",
          reasonCodes: ["repeated_anomaly", "device_distrusted"],
          capturedAt: SINCE + 1,
        },
      ],
      SINCE,
    );
    expect(rows[0].reasonCodes).toEqual([
      "device_distrusted",
      "person_face_mismatch",
      "repeated_anomaly",
    ]);
  });

  it("groups per student and sorts by flagged count then recency", () => {
    const rows = summarizeProxyAttempts(
      [
        { studentId: "s1", reasonCodes: ["spot_recheck_missed"], capturedAt: SINCE },
        { studentId: "s2", reasonCodes: ["stepup_escalated_review"], capturedAt: SINCE + 5 },
        { studentId: "s2", reasonCodes: ["stepup_escalated_review"], capturedAt: SINCE + 6 },
        { studentId: "s3", reasonCodes: ["device_distrusted"], capturedAt: SINCE + 9 },
      ],
      SINCE,
    );
    expect(rows.map((row) => row.studentId)).toEqual(["s2", "s3", "s1"]);
    expect(rows[0].latestAt).toBe(SINCE + 6);
  });

  it("returns an empty list when nothing qualifies", () => {
    expect(summarizeProxyAttempts([], SINCE)).toEqual([]);
  });

  it("documents the 28-day lookback constant", () => {
    expect(PROXY_LOOKBACK_DAYS).toBe(28);
    expect(PROXY_REASON_CODES).toContain("person_spoof_suspected");
  });
});

describe("summarizeVerificationAnomalies", () => {
  it("filters by the ledger anomaly types and window boundary", () => {
    const summary = summarizeVerificationAnomalies(
      [
        { type: "challenge_replayed", subjectUserId: "s1", createdAt: SINCE },
        { type: "challenge_replayed", subjectUserId: "s1", createdAt: SINCE - 1 },
        { type: "some_other_type", subjectUserId: "s1", createdAt: SINCE + 1 },
      ],
      SINCE,
      7,
    );
    expect(summary.byType).toEqual([{ type: "challenge_replayed", count: 1 }]);
    expect(summary.recent).toEqual([
      { type: "challenge_replayed", subjectUserId: "s1", createdAt: SINCE },
    ]);
  });

  it("sorts byType by count descending then type ascending", () => {
    const summary = summarizeVerificationAnomalies(
      [
        { type: "malformed_challenge", subjectUserId: null, createdAt: SINCE },
        { type: "challenge_replayed", subjectUserId: null, createdAt: SINCE },
        { type: "challenge_replayed", subjectUserId: null, createdAt: SINCE },
        { type: "challenge_replayed", subjectUserId: null, createdAt: SINCE },
        { type: "checkin_rate_limited", subjectUserId: null, createdAt: SINCE },
        { type: "checkin_rate_limited", subjectUserId: null, createdAt: SINCE },
      ],
      SINCE,
      7,
    );
    expect(summary.byType).toEqual([
      { type: "challenge_replayed", count: 3 },
      { type: "checkin_rate_limited", count: 2 },
      { type: "malformed_challenge", count: 1 },
    ]);
  });

  it("caps the recent feed at 20 rows, newest first", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      type: VERIFICATION_ANOMALY_TYPES[index % VERIFICATION_ANOMALY_TYPES.length],
      subjectUserId: `s${index}`,
      createdAt: SINCE + index,
    }));
    const summary = summarizeVerificationAnomalies(rows, SINCE, 30);
    expect(summary.recent).toHaveLength(20);
    expect(summary.recent[0].createdAt).toBe(SINCE + 24);
    expect(summary.recent[19].createdAt).toBe(SINCE + 5);
  });

  it("keeps null subjectUserId values and stamps the window size", () => {
    const summary = summarizeVerificationAnomalies(
      [{ type: "wrong_session_challenge", subjectUserId: null, createdAt: SINCE }],
      SINCE,
      14,
    );
    expect(summary.windowDays).toBe(14);
    expect(summary.recent[0].subjectUserId).toBeNull();
  });

  it("returns empty summaries when nothing matches", () => {
    const summary = summarizeVerificationAnomalies(
      [{ type: "not_a_type", subjectUserId: "s1", createdAt: SINCE }],
      SINCE,
      7,
    );
    expect(summary.byType).toEqual([]);
    expect(summary.recent).toEqual([]);
  });
});
