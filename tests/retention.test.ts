import { describe, expect, it } from "vitest";

import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  resolveRetentionDays,
} from "@/lib/compliance/retention";

describe("resolveRetentionDays", () => {
  it("falls back to the environment default when settings are absent", () => {
    expect(resolveRetentionDays(undefined, 365)).toBe(365);
    expect(resolveRetentionDays(null, 365)).toBe(365);
    expect(resolveRetentionDays({}, 365)).toBe(365);
  });

  it("uses institution settings when present and valid", () => {
    expect(resolveRetentionDays({ retentionDays: 90 }, 365)).toBe(90);
  });

  it("clamps settings into the allowed range from both directions", () => {
    expect(resolveRetentionDays({ retentionDays: 10 }, 365)).toBe(MIN_RETENTION_DAYS);
    expect(resolveRetentionDays({ retentionDays: 99999 }, 365)).toBe(MAX_RETENTION_DAYS);
  });

  it("clamps an out-of-range environment default too", () => {
    expect(resolveRetentionDays(undefined, 5)).toBe(MIN_RETENTION_DAYS);
    expect(resolveRetentionDays(undefined, 99999)).toBe(MAX_RETENTION_DAYS);
  });

  it("falls back to the env default when settings are non-finite, clamping it too", () => {
    expect(resolveRetentionDays({ retentionDays: Number.NaN }, 365)).toBe(365);
    expect(resolveRetentionDays({ retentionDays: Number.NaN }, 5)).toBe(MIN_RETENTION_DAYS);
    expect(resolveRetentionDays(undefined, Number.NaN)).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("keeps exact boundary values", () => {
    expect(resolveRetentionDays({ retentionDays: MIN_RETENTION_DAYS }, 365)).toBe(
      MIN_RETENTION_DAYS,
    );
    expect(resolveRetentionDays({ retentionDays: MAX_RETENTION_DAYS }, 365)).toBe(
      MAX_RETENTION_DAYS,
    );
  });
});
