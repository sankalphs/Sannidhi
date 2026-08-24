import { describe, expect, it } from "vitest";

import {
  CHALLENGE_TTL_MS,
  isChallengeConsumed,
  isChallengeExpired,
  isChallengeUsable,
} from "@/lib/auth/challenge";

describe("webauthn challenge predicates", () => {
  const now = 1_000_000;

  it("uses a five minute TTL", () => {
    expect(CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("flags expired challenges only at or after expiry", () => {
    expect(isChallengeExpired(now + CHALLENGE_TTL_MS, now)).toBe(false);
    expect(isChallengeExpired(now + CHALLENGE_TTL_MS - 1, now)).toBe(false);
    expect(isChallengeExpired(now + CHALLENGE_TTL_MS, now + CHALLENGE_TTL_MS)).toBe(true);
    expect(isChallengeExpired(now - 1, now)).toBe(true);
  });

  it("flags consumed challenges", () => {
    expect(isChallengeConsumed(undefined)).toBe(false);
    expect(isChallengeConsumed(now)).toBe(true);
  });

  it("accepts a fresh unconsumed challenge of matching purpose", () => {
    expect(
      isChallengeUsable(
        { purpose: "registration", expiresAt: now + CHALLENGE_TTL_MS },
        "registration",
        now,
      ),
    ).toBe(true);
    expect(
      isChallengeUsable(
        { purpose: "authentication", expiresAt: now + CHALLENGE_TTL_MS },
        "authentication",
        now,
      ),
    ).toBe(true);
  });

  it("rejects purpose mismatches", () => {
    expect(
      isChallengeUsable(
        { purpose: "registration", expiresAt: now + CHALLENGE_TTL_MS },
        "authentication",
        now,
      ),
    ).toBe(false);
    expect(
      isChallengeUsable(
        { purpose: "authentication", expiresAt: now + CHALLENGE_TTL_MS },
        "registration",
        now,
      ),
    ).toBe(false);
  });

  it("rejects consumed challenges regardless of freshness", () => {
    expect(
      isChallengeUsable(
        { purpose: "registration", expiresAt: now + CHALLENGE_TTL_MS, consumedAt: now - 10 },
        "registration",
        now,
      ),
    ).toBe(false);
  });

  it("rejects expired challenges even when unconsumed", () => {
    expect(
      isChallengeUsable({ purpose: "authentication", expiresAt: now }, "authentication", now),
    ).toBe(false);
  });
});
