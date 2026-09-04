import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { institutionDayOfWeek, institutionMinutesOfDay } from "@/lib/attendance/timezone";

const source = readFileSync(join(process.cwd(), "convex", "seed.ts"), "utf8");

describe("convex/seed.ts", () => {
  it("exports seedDemoData as an internal mutation", () => {
    expect(source).toMatch(/export const seedDemoData = internalMutation\(/);
  });

  it("guards against re-seeding when institutions already exist", () => {
    expect(source).toContain('"already-seeded"');
  });

  it("gates the clear utility behind demo mode", () => {
    expect(source).toMatch(/export const clearDemoData = internalMutation\(/);
    expect(source).toContain('process.env.SANNIDHI_DEMO_MODE !== "1"');
  });

  it("gates seeding itself behind demo mode", () => {
    const seedBody = source.slice(source.indexOf("seedDemoData"));
    expect(seedBody.indexOf('SANNIDHI_DEMO_MODE !== "1"')).toBeLessThan(
      seedBody.indexOf('"already-seeded"'),
    );
  });

  it("computes today's weekday and brackets the current time for a live slot", () => {
    // The "live today" slot must use the institution timezone (IST), not the
    // server's zone — seed-time and read-time day math must agree.
    expect(source).toMatch(/const todayDayOfWeek = institutionDayOfWeek\(now\)/);
    expect(source).toMatch(/const istMinutesOfDay = institutionMinutesOfDay\(now\)/);
    expect(source).toMatch(/dayOfWeek: todayDayOfWeek/);
    expect(source).toMatch(/startMinutes: liveStartMinutes/);
    expect(source).toMatch(/endMinutes: liveEndMinutes/);
  });

  it("converts UTC to IST wall-clock minutes correctly (behavioral)", () => {
    // 2026-09-04T10:00:00Z is 15:30 IST — east-of-UTC offsets are ADDED to
    // the UTC clock, not subtracted.
    expect(institutionMinutesOfDay(Date.UTC(2026, 8, 4, 10, 0, 0))).toBe(15 * 60 + 30);
    // Midnight UTC is 05:30 IST, the same calendar day.
    expect(institutionMinutesOfDay(Date.UTC(2026, 8, 4, 0, 0, 0))).toBe(5 * 60 + 30);
    // 2026-09-04T20:00:00Z is 01:30 IST on Sep 5 — wrap by day.
    expect(institutionMinutesOfDay(Date.UTC(2026, 8, 4, 20, 0, 0))).toBe(1 * 60 + 30);
    // The day-of-week flips at 18:30 UTC: Sep 4 2026 is a Friday, so 19:00
    // UTC is already Saturday Sep 5 IST.
    expect(institutionDayOfWeek(Date.UTC(2026, 8, 4, 18, 0, 0))).toBe(5); // Friday
    expect(institutionDayOfWeek(Date.UTC(2026, 8, 4, 19, 0, 0))).toBe(6); // Saturday IST
  });

  it("assigns the seeded faculty member to the live timetable slots", () => {
    expect(source).toContain('throw new Error("seed data must include a faculty user")');
    expect(source).toMatch(/facultyId,\s*\n\s*\}\);/);
  });

  it("enrolls seeded students into seeded sections", () => {
    expect(source).toMatch(/insert\("enrollments"/);
    expect(source).toContain("studentIds[studentIndex]");
    expect(source).toContain("sectionIds[pair[1]]");
  });

  it("provisions an active device and passkey for every enrolled student", () => {
    expect(source).toMatch(/insert\("passkey_credentials"/);
    expect(source).toMatch(/insert\("devices"/);
    expect(source).toContain('state: "active"');
    expect(source).toContain("devices: deviceCount");
  });

  it("marks core seeded users active so the enrollment gate unlocks", () => {
    expect(source).toContain('status: "active"');
  });

  it("backfills a full term of closed sessions with chained attendance events", () => {
    expect(source).toContain("BACKFILL_OUTCOMES");
    expect(source).toMatch(/insert\("class_sessions"/);
    expect(source).toContain("sessionsBackfilled");
    expect(source).toContain("attendanceEventsBackfilled");
  });

  it("keeps backfilled sessions clear of the live e2e slot window", () => {
    expect(source).toContain("BACKFILL_NEWEST_AGE_MS");
    expect(source).toMatch(/status: "closed"/);
  });

  it("self-verifies the backfilled attendance chain at seed time", () => {
    expect(source).toContain("seed backfill chain broken");
    expect(source).toContain("verifyBackfillChain");
  });

  it("self-verifies the backfilled event_ledger chain at seed time", () => {
    expect(source).toContain("seed backfill ledger chain broken");
    expect(source).toContain("verifyBackfillLedgerChain");
  });
});
