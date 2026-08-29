export const PROXY_REASON_CODES = [
  "person_spoof_suspected",
  "person_face_mismatch",
  "repeated_anomaly",
  "device_distrusted",
  "spot_recheck_missed",
  "stepup_escalated_review",
] as const;

export const VERIFICATION_ANOMALY_TYPES = [
  "challenge_replayed",
  "wrong_session_challenge",
  "malformed_challenge",
  "challenge_expired_use",
  "checkin_rate_limited",
] as const;

export const PROXY_LOOKBACK_DAYS = 28;

export type ProxyAttemptRow = {
  studentId: string;
  /** Flagged events carrying a proxy reason code within the window. */
  flaggedCount: number;
  /** Unique reason codes across those events, sorted alphabetically. */
  reasonCodes: string[];
  /** Most recent qualifying event timestamp (0 when none). */
  latestAt: number;
};

export type VerificationAnomalySummary = {
  windowDays: number;
  byType: Array<{ type: string; count: number }>;
  recent: Array<{ type: string; subjectUserId: string | null; createdAt: number }>;
};

/**
 * Groups flagged proxy-suspect events per student within the lookback window;
 * events before sinceMs or without a proxy reason code are ignored.
 */
export function summarizeProxyAttempts(
  events: Array<{ studentId: string; reasonCodes: string[]; capturedAt: number }>,
  sinceMs: number,
): ProxyAttemptRow[] {
  const byStudent = new Map<string, ProxyAttemptRow>();

  for (const event of events) {
    if (event.capturedAt < sinceMs) continue;
    if (
      !event.reasonCodes.some((code) =>
        PROXY_REASON_CODES.includes(code as (typeof PROXY_REASON_CODES)[number]),
      )
    )
      continue;

    let row = byStudent.get(event.studentId);
    if (row === undefined) {
      row = { studentId: event.studentId, flaggedCount: 0, reasonCodes: [], latestAt: 0 };
      byStudent.set(event.studentId, row);
    }
    row.flaggedCount += 1;
    for (const code of event.reasonCodes) {
      if (PROXY_REASON_CODES.includes(code as (typeof PROXY_REASON_CODES)[number])) {
        row.reasonCodes.push(code);
      }
    }
    if (event.capturedAt > row.latestAt) row.latestAt = event.capturedAt;
  }

  return Array.from(byStudent.values())
    .map((row) => ({
      ...row,
      reasonCodes: Array.from(new Set(row.reasonCodes)).sort(),
    }))
    .sort((a, b) => b.flaggedCount - a.flaggedCount || b.latestAt - a.latestAt);
}

/**
 * Counts ledger verification anomalies within the window, grouped by type and
 * with the 20 most recent rows attached for an investigation feed.
 */
export function summarizeVerificationAnomalies(
  rows: Array<{ type: string; subjectUserId: string | null; createdAt: number }>,
  sinceMs: number,
  windowDays: number,
): VerificationAnomalySummary {
  const matching = rows.filter(
    (row) =>
      row.createdAt >= sinceMs &&
      VERIFICATION_ANOMALY_TYPES.includes(row.type as (typeof VERIFICATION_ANOMALY_TYPES)[number]),
  );

  const counts = new Map<string, number>();
  for (const row of matching) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  }

  const byType = Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));

  const recent = [...matching]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((row) => ({ type: row.type, subjectUserId: row.subjectUserId, createdAt: row.createdAt }));

  return { windowDays, byType, recent };
}
