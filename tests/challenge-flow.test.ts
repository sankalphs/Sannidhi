import { describe, expect, it } from "vitest";

import {
  challengeLifecycle,
  parseTtlMs,
  spotRecheckPickIndex,
} from "../convex/lib/attendance_event";

describe("challenge TTL env parsing", () => {
  it("falls back when the env var is unset", () => {
    expect(parseTtlMs(undefined, 600_000)).toBe(600_000);
    expect(parseTtlMs(undefined, 300_000)).toBe(300_000);
  });

  it("accepts numeric strings with millisecond precision", () => {
    expect(parseTtlMs("120000", 600_000)).toBe(120_000);
    expect(parseTtlMs("0.5", 600_000)).toBe(0.5);
  });

  it("falls back on garbage, zero, and negative values instead of trusting them", () => {
    expect(parseTtlMs("ten-minutes", 600_000)).toBe(600_000);
    expect(parseTtlMs("", 600_000)).toBe(600_000);
    expect(parseTtlMs("NaN", 600_000)).toBe(600_000);
    expect(parseTtlMs("Infinity", 600_000)).toBe(600_000);
    expect(parseTtlMs("0", 600_000)).toBe(600_000);
    expect(parseTtlMs("-5000", 600_000)).toBe(600_000);
  });
});

describe("spot re-check random pick index", () => {
  it("maps the seed into the eligible range deterministically", () => {
    expect(spotRecheckPickIndex(5, 0)).toBe(0);
    expect(spotRecheckPickIndex(5, 7)).toBe(2);
    expect(spotRecheckPickIndex(5, 10)).toBe(0);
    expect(spotRecheckPickIndex(5, 14)).toBe(4);
  });

  it("always returns the only index for a single eligible student", () => {
    for (const seed of [1, 999, Date.now()]) {
      expect(spotRecheckPickIndex(1, seed)).toBe(0);
    }
  });

  it("stays in range for arbitrary seeds and falls back to 0 for empty lists", () => {
    for (let seed = 0; seed < 200; seed += 17) {
      const index = spotRecheckPickIndex(6, seed * 1_337);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(6);
    }
    expect(spotRecheckPickIndex(0, 123)).toBe(0);
  });
});

describe("challenge lifecycle transition", () => {
  type ChallengeStatus = "pending" | "passed" | "failed" | "expired" | "escalated";

  const pending = (overrides?: {
    status?: ChallengeStatus;
    expiresAt?: number;
  }): { status: ChallengeStatus; expiresAt: number } => ({
    status: "pending",
    expiresAt: 10_000,
    ...overrides,
  });

  it("treats unexpired pendings as active", () => {
    expect(challengeLifecycle(pending(), 9_999)).toBe("active");
  });

  it("lazily treats expired pendings as expired_pending at and after expiry", () => {
    expect(challengeLifecycle(pending(), 10_000)).toBe("expired_pending");
    expect(challengeLifecycle(pending(), 20_000)).toBe("expired_pending");
  });

  it("treats any non-pending status as resolved regardless of expiry", () => {
    for (const status of ["passed", "failed", "expired", "escalated"] as const) {
      expect(challengeLifecycle(pending({ status }), 5_000)).toBe("resolved");
      expect(challengeLifecycle(pending({ status }), 50_000)).toBe("resolved");
    }
  });
});
