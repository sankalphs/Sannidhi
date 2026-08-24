import { describe, expect, it } from "vitest";

import {
  POSSESSION_CODE_LENGTH,
  POSSESSION_MAX_ATTEMPTS,
  checkPossessionUsable,
  generatePossessionCode,
  hasAttemptsLeft,
  hashPossessionCode,
  isPossessionExpired,
} from "../src/lib/devices/verification";

describe("possession codes", () => {
  it("generates six-digit numeric codes", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generatePossessionCode();
      expect(code).toHaveLength(POSSESSION_CODE_LENGTH);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("generates distinct codes across samples", () => {
    const codes = new Set(Array.from({ length: 30 }, () => generatePossessionCode()));
    expect(codes.size).toBeGreaterThan(25);
  });

  it("hashes deterministically and separates different codes", async () => {
    expect(await hashPossessionCode("123456")).toBe(await hashPossessionCode("123456"));
    expect(await hashPossessionCode("123456")).not.toBe(await hashPossessionCode("654321"));
  });

  it("detects expiry only after the deadline", () => {
    const now = 1_000_000;
    expect(isPossessionExpired(now + 1, now)).toBe(false);
    expect(isPossessionExpired(now, now)).toBe(true);
  });

  it("enforces the attempt budget", () => {
    expect(hasAttemptsLeft(0)).toBe(true);
    expect(hasAttemptsLeft(POSSESSION_MAX_ATTEMPTS - 1)).toBe(true);
    expect(hasAttemptsLeft(POSSESSION_MAX_ATTEMPTS)).toBe(false);
  });

  it("reports usability with the right reason", async () => {
    const now = 50_000;
    const codeHash = await hashPossessionCode("000000");
    expect(checkPossessionUsable({ codeHash, expiresAt: now + 1000, attempts: 0 }, now)).toBe("ok");
    expect(checkPossessionUsable({ codeHash, expiresAt: now - 1, attempts: 0 }, now)).toBe(
      "expired",
    );
    expect(
      checkPossessionUsable(
        { codeHash, expiresAt: now + 1000, attempts: POSSESSION_MAX_ATTEMPTS },
        now,
      ),
    ).toBe("attempts-exhausted");
    expect(
      checkPossessionUsable(
        { codeHash, expiresAt: now + 1000, attempts: 0, consumedAt: now - 500 },
        now,
      ),
    ).toBe("consumed");
  });
});
