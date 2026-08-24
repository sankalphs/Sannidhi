import { describe, expect, it } from "vitest";

import {
  FRESH_AUTH_WINDOW_MS,
  checkReplacementEligibility,
  isFreshAuth,
} from "../src/lib/devices/replacement";

describe("fresh auth window", () => {
  it("accepts only recent authentication", () => {
    const now = 10_000_000;
    expect(isFreshAuth(now - 1000, now)).toBe(true);
    expect(isFreshAuth(now - FRESH_AUTH_WINDOW_MS, now)).toBe(true);
    expect(isFreshAuth(now - FRESH_AUTH_WINDOW_MS - 1, now)).toBe(false);
    expect(isFreshAuth(undefined, now)).toBe(false);
  });
});

describe("replacement eligibility", () => {
  const base = {
    deviceState: "active" as const,
    freshAuth: true,
    hasPendingReplacementForDevice: false,
    reasonLength: 20,
  };

  it("accepts an eligible request", () => {
    expect(checkReplacementEligibility(base)).toBe("ok");
  });

  it("rejects non-active devices", () => {
    for (const state of ["new", "enrolled", "suspended", "revoked", "replaced"] as const) {
      expect(checkReplacementEligibility({ ...base, deviceState: state })).toBe(
        "device-not-active",
      );
    }
  });

  it("requires fresh identity re-verification", () => {
    expect(checkReplacementEligibility({ ...base, freshAuth: false })).toBe("auth-stale");
  });

  it("rejects while a replacement is already pending", () => {
    expect(checkReplacementEligibility({ ...base, hasPendingReplacementForDevice: true })).toBe(
      "replacement-pending",
    );
  });

  it("requires a reason within bounds", () => {
    expect(checkReplacementEligibility({ ...base, reasonLength: 0 })).toBe("reason-missing");
    expect(checkReplacementEligibility({ ...base, reasonLength: 501 })).toBe("reason-missing");
  });
});
