export { ANOMALY_ALERT_THRESHOLD, REVIEW_ALERT_KINDS, deriveAlerts } from "./alerts";
export type { DerivedAlert, ReviewAlertKind } from "./alerts";
export {
  PROXY_LOOKBACK_DAYS,
  PROXY_REASON_CODES,
  VERIFICATION_ANOMALY_TYPES,
  summarizeProxyAttempts,
  summarizeVerificationAnomalies,
} from "./anomalies";
export type { ProxyAttemptRow, VerificationAnomalySummary } from "./anomalies";
export { toCsv } from "./csv";
export { renderReportPdf } from "./pdf";
export { LATE_ARRIVAL_GRACE_MINUTES, isLateArrival, summarizeSectionTrends } from "./trends";
export type { SectionTrendInput, SectionTrendRow } from "./trends";
export { CONSECUTIVE_MISS_ALERT_THRESHOLD, analyzeTrajectory } from "./trajectory";
export type {
  StudentTrajectory,
  TrajectoryRecord,
  TrajectoryRecordState,
  TrajectoryTrend,
} from "./trajectory";
export { REPORT_PERIODS, REPORT_PERIOD_MS, isReportPeriod, reportWindow } from "./reporting";
export type { ReportPeriod } from "./reporting";
