import { describe, expect, it } from "vitest";

import { institutionDayOfWeek, institutionMinutesOfDay } from "@/lib/attendance/timezone";

describe("institutionMinutesOfDay", () => {
  it("reads the wall clock in IST, not UTC", () => {
    // 2026-11-05T20:00Z is 01:30 on Friday 6 Nov in IST.
    const instant = Date.UTC(2026, 10, 5, 20, 0);
    expect(institutionMinutesOfDay(instant)).toBe(90);
    expect(institutionDayOfWeek(instant)).toBe(5);
  });

  it("returns 0 at IST midnight", () => {
    expect(institutionMinutesOfDay(Date.UTC(2026, 10, 5, 18, 30))).toBe(0);
  });
});
