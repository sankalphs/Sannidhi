import { describe, expect, it } from "vitest";

import {
  DEFAULT_RISK_POLICY_SETTINGS,
  mergeRiskPolicySettings,
  resolveRiskPolicy,
  validateRiskPolicySettings,
} from "@/lib/risk";

describe("mergeRiskPolicySettings", () => {
  it("returns an empty object when no layers are given", () => {
    expect(mergeRiskPolicySettings()).toEqual({});
  });

  it("later layers win per-key (venue beats department beats institution)", () => {
    const merged = mergeRiskPolicySettings(
      { anomalyFlagThreshold: 2, strictPresence: true },
      { anomalyFlagThreshold: 5 },
      { strictPresence: false, stepUpOnWeakDevice: false },
    );
    expect(merged).toEqual({
      anomalyFlagThreshold: 5,
      strictPresence: false,
      stepUpOnWeakDevice: false,
    });
  });

  it("undefined keys fall through to earlier layers", () => {
    const merged = mergeRiskPolicySettings(
      { anomalyFlagThreshold: 2, locationInconclusiveMarginMeters: 100 },
      { anomalyFlagThreshold: undefined, stepUpOnWeakDevice: false },
    );
    expect(merged).toEqual({
      anomalyFlagThreshold: 2,
      locationInconclusiveMarginMeters: 100,
      stepUpOnWeakDevice: false,
    });
  });
});

describe("resolveRiskPolicy", () => {
  it("resolves pure defaults with an empty stamp when no layers are given", () => {
    expect(resolveRiskPolicy([])).toEqual({
      ...DEFAULT_RISK_POLICY_SETTINGS,
      stamp: "",
    });
  });

  it("resolves defaults when layers carry empty settings", () => {
    expect(resolveRiskPolicy([{ revision: 3 }, { settings: {}, revision: 5 }])).toEqual({
      ...DEFAULT_RISK_POLICY_SETTINGS,
      stamp: "",
    });
  });

  it("resolves merged settings across scopes with per-key fallthrough", () => {
    const resolved = resolveRiskPolicy([
      { settings: { anomalyFlagThreshold: 2, strictPresence: true }, revision: 2 },
      { settings: { anomalyFlagThreshold: 5 }, revision: 5 },
    ]);
    expect(resolved.anomalyFlagThreshold).toBe(5);
    expect(resolved.strictPresence).toBe(true);
    expect(resolved.stepUpOnWeakDevice).toBe(DEFAULT_RISK_POLICY_SETTINGS.stepUpOnWeakDevice);
    expect(resolved.stamp).toBe("policy:5");
  });

  it("stamp uses the max revision across layers that have settings", () => {
    const resolved = resolveRiskPolicy([
      { settings: { strictPresence: true }, revision: 2 },
      { settings: { locationInconclusiveMarginMeters: 300 }, revision: 5 },
      { revision: 9 },
    ]);
    expect(resolved.stamp).toBe("policy:5");
  });

  it("stamp is empty when no layer contributes settings", () => {
    expect(resolveRiskPolicy([{ revision: 4 }, { revision: 7 }]).stamp).toBe("");
  });
});

describe("validateRiskPolicySettings", () => {
  it("accepts empty and valid sparse settings", () => {
    expect(validateRiskPolicySettings({})).toEqual([]);
    expect(
      validateRiskPolicySettings({
        anomalyFlagThreshold: 10,
        stepUpOnWeakDevice: false,
        strictPresence: true,
        locationDefaultRadiusMeters: 500,
        locationInconclusiveMarginMeters: 0,
        locationMaxAccuracyMarginMeters: 2000,
      }),
    ).toEqual([]);
  });

  it("rejects out-of-range and non-integer thresholds and margins", () => {
    expect(validateRiskPolicySettings({ anomalyFlagThreshold: 0 })).not.toEqual([]);
    expect(validateRiskPolicySettings({ anomalyFlagThreshold: 11 })).not.toEqual([]);
    expect(validateRiskPolicySettings({ anomalyFlagThreshold: 2.5 })).not.toEqual([]);
    expect(validateRiskPolicySettings({ locationInconclusiveMarginMeters: -5 })).not.toEqual([]);
    expect(validateRiskPolicySettings({ locationMaxAccuracyMarginMeters: 2001 })).not.toEqual([]);
    expect(validateRiskPolicySettings({ locationDefaultRadiusMeters: 5 })).not.toEqual([]);
    expect(validateRiskPolicySettings({ locationDefaultRadiusMeters: 5001 })).not.toEqual([]);
  });

  it("rejects non-boolean flags", () => {
    expect(validateRiskPolicySettings({ stepUpOnWeakDevice: 1 as unknown as boolean })).not.toEqual(
      [],
    );
    expect(validateRiskPolicySettings({ strictPresence: "yes" as unknown as boolean })).not.toEqual(
      [],
    );
  });

  it("ignores undefined keys", () => {
    expect(
      validateRiskPolicySettings({
        anomalyFlagThreshold: undefined,
        locationInconclusiveMarginMeters: undefined,
      }),
    ).toEqual([]);
  });
});
