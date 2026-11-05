import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "convex", "testFixtures.ts"), "utf8");

describe("convex/testFixtures.ts", () => {
  it("exposes reset as an internal mutation", () => {
    expect(source).toMatch(/export const reset = internalMutation\(/);
  });

  it("gates every entry point behind SANNIDHI_TEST_FIXTURES", () => {
    expect(source).toContain('process.env.SANNIDHI_TEST_FIXTURES === "1"');
    const resetBody = source.slice(source.indexOf("export const reset"));
    expect(resetBody.indexOf("fixturesEnabled()")).toBeLessThan(resetBody.indexOf("deleteRows"));
    const actorBody = source.slice(source.indexOf("export const getFixtureActor"));
    expect(actorBody.indexOf("fixturesEnabled()")).toBeLessThan(actorBody.indexOf("ctx.db"));
  });

  it("wipes every schema table before loading", () => {
    expect(source).toContain("for (const table of ALL_TABLES)");
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

  it("self-verifies the backfilled event_ledger chain at seed time", () => {
    expect(source).toContain("seed backfill ledger chain broken");
    expect(source).toContain("verifyBackfillLedgerChain");
  });
});
