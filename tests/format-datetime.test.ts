import { describe, expect, it } from "vitest";

import {
  formatInstitutionDate,
  formatInstitutionDateTime,
  formatInstitutionTime,
  institutionDayStartMs,
} from "@/lib/format/datetime";

// ICU may separate "pm" with a narrow no-break space; compare on plain spaces.
const plain = (value: string) => value.replace(/\s/g, " ");

// 08:03:22 UTC is 13:33:22 IST.
const AFTERNOON_IST = Date.UTC(2026, 10, 5, 8, 3, 22);
// 20:00 UTC on the 5th is already 01:30 on the 6th in IST.
const AFTER_MIDNIGHT_IST = Date.UTC(2026, 10, 5, 20, 0, 0);

describe("institution datetime formatters", () => {
  it("formats the calendar date on the institution clock", () => {
    expect(plain(formatInstitutionDate(AFTERNOON_IST))).toBe("5 Nov 2026");
    expect(plain(formatInstitutionDate(AFTER_MIDNIGHT_IST))).toBe("6 Nov 2026");
  });

  it("formats the time of day in IST regardless of the host zone", () => {
    expect(plain(formatInstitutionTime(AFTERNOON_IST))).toBe("1:33 pm");
    expect(plain(formatInstitutionTime(AFTER_MIDNIGHT_IST))).toBe("1:30 am");
  });

  it("formats date and time together, optionally with seconds", () => {
    expect(plain(formatInstitutionDateTime(AFTERNOON_IST))).toBe("5 Nov 2026, 1:33 pm");
    expect(plain(formatInstitutionDateTime(AFTERNOON_IST, { seconds: true }))).toBe(
      "5 Nov 2026, 1:33:22 pm",
    );
  });
});

describe("institutionDayStartMs", () => {
  it("returns IST midnight for a date key", () => {
    expect(institutionDayStartMs("2026-11-06")).toBe(Date.UTC(2026, 10, 5, 18, 30));
    expect(formatInstitutionDate(institutionDayStartMs("2026-11-06")!)).toBe("6 Nov 2026");
  });

  it("rejects empty or malformed keys", () => {
    expect(institutionDayStartMs("")).toBeUndefined();
    expect(institutionDayStartMs("2026-13-45")).toBeUndefined();
  });
});
