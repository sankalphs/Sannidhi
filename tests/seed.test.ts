import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
    expect(source).toMatch(/const todayDayOfWeek = seedMoment\.getDay\(\)/);
    expect(source).toMatch(
      /const currentMinutes = seedMoment\.getHours\(\) \* 60 \+ seedMoment\.getMinutes\(\)/,
    );
    expect(source).toMatch(/dayOfWeek: todayDayOfWeek/);
    expect(source).toMatch(/startMinutes: liveStartMinutes/);
    expect(source).toMatch(/endMinutes: liveEndMinutes/);
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
});
