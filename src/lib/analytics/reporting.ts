export const REPORT_PERIODS = ["daily", "weekly", "monthly"] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function isReportPeriod(value: string): value is ReportPeriod {
  return (REPORT_PERIODS as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const REPORT_PERIOD_MS: Record<ReportPeriod, number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
};

const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: "Past 24 hours",
  weekly: "Past 7 days",
  monthly: "Past 30 days",
};

/** Rolling window ending at `now` (exclusive). */
export function reportWindow(
  period: ReportPeriod,
  now: number,
): { startMs: number; endMs: number; label: string } {
  const durationMs = REPORT_PERIOD_MS[period];
  return { startMs: now - durationMs, endMs: now, label: REPORT_PERIOD_LABELS[period] };
}
