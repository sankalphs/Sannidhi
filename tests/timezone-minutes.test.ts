import { describe, expect, it } from "vitest";

import {
  institutionDateKey,
  institutionDayOfWeek,
  institutionInstant,
  institutionMinutesOfDay,
} from "@/lib/attendance/timezone";

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

describe("institutionInstant", () => {
  it("builds the UTC instant for an IST wall-clock time", () => {
    // 09:00 IST on 6 Nov 2026 is 03:30 UTC.
    expect(institutionInstant("2026-11-06", 9 * 60)).toBe(Date.UTC(2026, 10, 6, 3, 30));
  });

  it("round-trips through institutionMinutesOfDay and institutionDateKey", () => {
    const instant = institutionInstant("2026-09-04", 14 * 60 + 45);
    expect(institutionMinutesOfDay(instant)).toBe(14 * 60 + 45);
    expect(institutionDateKey(instant)).toBe("2026-09-04");
  });
});
