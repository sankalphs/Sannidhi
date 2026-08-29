import { describe, expect, it } from "vitest";

import {
  REPORT_PERIOD_MS,
  REPORT_PERIODS,
  isReportPeriod,
  reportWindow,
} from "@/lib/analytics/reporting";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("reporting", () => {
  it("exposes the three rolling periods", () => {
    expect(REPORT_PERIODS).toEqual(["daily", "weekly", "monthly"]);
  });

  it("guards the period union", () => {
    expect(isReportPeriod("daily")).toBe(true);
    expect(isReportPeriod("weekly")).toBe(true);
    expect(isReportPeriod("monthly")).toBe(true);
    expect(isReportPeriod("yearly")).toBe(false);
    expect(isReportPeriod("")).toBe(false);
  });

  it("maps periods to 24h, 7d, and 30d durations", () => {
    expect(REPORT_PERIOD_MS.daily).toBe(DAY_MS);
    expect(REPORT_PERIOD_MS.weekly).toBe(7 * DAY_MS);
    expect(REPORT_PERIOD_MS.monthly).toBe(30 * DAY_MS);
  });

  it("builds an exclusive rolling window ending at now", () => {
    expect(reportWindow("daily", NOW)).toEqual({
      startMs: NOW - DAY_MS,
      endMs: NOW,
      label: "Past 24 hours",
    });
    expect(reportWindow("weekly", NOW)).toEqual({
      startMs: NOW - 7 * DAY_MS,
      endMs: NOW,
      label: "Past 7 days",
    });
    expect(reportWindow("monthly", NOW)).toEqual({
      startMs: NOW - 30 * DAY_MS,
      endMs: NOW,
      label: "Past 30 days",
    });
  });
});
