import type { ProxyAttemptRow } from "./anomalies";
import type { StudentTrajectory } from "./trajectory";

export const REVIEW_ALERT_KINDS = [
  "low_attendance",
  "proxy_attempt",
  "verification_anomaly",
] as const;

export type ReviewAlertKind = (typeof REVIEW_ALERT_KINDS)[number];

/** Ledger anomalies within lookback needed before an investigation alert fires; investigation-level, deliberately distinct from the check-in engine's flag threshold. */
export const ANOMALY_ALERT_THRESHOLD = 3;

export type DerivedAlert = { kind: ReviewAlertKind; factors: string[] };

/** Dedupes while preserving first-seen order. */
function uniqueOrdered(factors: string[]): string[] {
  return Array.from(new Set(factors));
}

/**
 * Combines a student's trajectory, proxy-suspect row, and ledger anomaly count
 * into ordered review alerts; each alert carries machine-readable factors.
 */
export function deriveAlerts(input: {
  trajectory: StudentTrajectory;
  proxy: ProxyAttemptRow | null;
  verificationAnomalyCount: number;
}): DerivedAlert[] {
  const alerts: DerivedAlert[] = [];

  if (input.trajectory.atRisk) {
    alerts.push({
      kind: "low_attendance",
      factors: uniqueOrdered([
        ...input.trajectory.factors,
        `attendance:${input.trajectory.summary.percentage}%`,
      ]),
    });
  }

  if (input.proxy !== null && input.proxy.flaggedCount >= 1) {
    alerts.push({
      kind: "proxy_attempt",
      factors: [`proxy_flags:${input.proxy.flaggedCount}`, ...input.proxy.reasonCodes],
    });
  }

  if (input.verificationAnomalyCount >= ANOMALY_ALERT_THRESHOLD) {
    alerts.push({
      kind: "verification_anomaly",
      factors: [`ledger_anomalies:${input.verificationAnomalyCount}`],
    });
  }

  return alerts;
}
