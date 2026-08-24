import { describe, expect, expectTypeOf, it } from "vitest";

import { DEVICE_STATES, type DeviceState } from "@/lib/devices/lifecycle";
import {
  DEVICE_EVIDENCE_POLICY_VERSION,
  buildDeviceTrustEvidence,
  type DeviceTrustEvidence,
} from "@/lib/trust-evidence";

function device(state: DeviceState, overrides: Record<string, unknown> = {}) {
  return {
    _id: "device_1",
    state,
    activatedAt: 1724400000000,
    stateChangedAt: 1724400100000,
    replacedByDeviceId: "device_2",
    ...overrides,
  };
}

describe("buildDeviceTrustEvidence", () => {
  it("marks exactly the active state as trusted", () => {
    for (const state of DEVICE_STATES) {
      const evidence = buildDeviceTrustEvidence(device(state));
      expect(evidence.isTrusted).toBe(state === "active");
    }
  });

  it("carries the policy version stamp on every evidence record", () => {
    const evidence = buildDeviceTrustEvidence(device("active"));
    expect(evidence.evidenceVersion).toBe("device-evidence/v1");
    expect(DEVICE_EVIDENCE_POLICY_VERSION).toBe("device-evidence/v1");
  });

  it("normalizes absent optional fields to null", () => {
    const evidence = buildDeviceTrustEvidence(
      device("new", {
        activatedAt: undefined,
        stateChangedAt: undefined,
        replacedByDeviceId: undefined,
      }),
    );
    expect(evidence.activatedAt).toBeNull();
    expect(evidence.suspendedAt).toBeNull();
    expect(evidence.replacedByDeviceId).toBeNull();
  });

  it("derives suspendedAt only for suspended devices, from stateChangedAt", () => {
    const suspended = buildDeviceTrustEvidence(device("suspended"));
    expect(suspended.suspendedAt).toBe(1724400100000);

    const active = buildDeviceTrustEvidence(device("active"));
    expect(active.suspendedAt).toBeNull();

    const revoked = buildDeviceTrustEvidence(device("revoked"));
    expect(revoked.suspendedAt).toBeNull();
  });

  it("keeps identity fields verbatim so Risk Decision can reference the source device", () => {
    const evidence = buildDeviceTrustEvidence(device("replaced"));
    expect(evidence.deviceId).toBe("device_1");
    expect(evidence.state).toBe("replaced");
    expect(evidence.replacedByDeviceId).toBe("device_2");
  });

  it("matches the normalized shape contract", () => {
    const evidence: DeviceTrustEvidence = buildDeviceTrustEvidence(device("active"));
    expectTypeOf(evidence.isTrusted).toEqualTypeOf<boolean>();
    expectTypeOf(evidence.state).toEqualTypeOf<DeviceState>();
    expect(Object.keys(evidence).sort()).toEqual(
      [
        "activatedAt",
        "deviceId",
        "evidenceVersion",
        "isTrusted",
        "replacedByDeviceId",
        "state",
        "suspendedAt",
      ].sort(),
    );
  });
});
