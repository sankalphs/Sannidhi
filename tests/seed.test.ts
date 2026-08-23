import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "convex", "seed.ts"), "utf8");

describe("convex/seed.ts", () => {
  it("exports a public seedDemoData mutation", () => {
    expect(source).toMatch(/export const seedDemoData = mutation\(/);
  });

  it("guards against re-seeding when institutions already exist", () => {
    expect(source).toContain('"already-seeded"');
  });
});
