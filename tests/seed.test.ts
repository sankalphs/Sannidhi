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
});
