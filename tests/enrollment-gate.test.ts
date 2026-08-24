import { describe, expect, it } from "vitest";

import { evaluateEnrollmentGate, type EnrollmentGateInput } from "@/lib/enrollment/gate";
import type { DeviceState } from "@/lib/devices/lifecycle";

const UNLOCKED: EnrollmentGateInput = {
  accountStatus: "active",
  hasUsablePasskey: true,
  deviceState: "active",
  biometricConsentRecorded: false,
};

describe("evaluateEnrollmentGate", () => {
  it("unlocks only when account is active, passkey usable, and device active", () => {
    const result = evaluateEnrollmentGate(UNLOCKED);
    expect(result).toEqual({
      locked: false,
      completedSteps: { account: true, passkey: true, device: true },
      missingSteps: [],
      biometricConsentRecorded: false,
    });
    expect(result.reason).toBeUndefined();
  });

  it("locks for each non-active account status", () => {
    for (const accountStatus of ["invited", "suspended", undefined] as const) {
      const result = evaluateEnrollmentGate({ ...UNLOCKED, accountStatus });
      expect(result.locked).toBe(true);
      expect(result.missingSteps).toEqual(["account"]);
      expect(result.completedSteps.account).toBe(false);
    }
  });

  it("locks when no usable passkey exists", () => {
    const result = evaluateEnrollmentGate({ ...UNLOCKED, hasUsablePasskey: false });
    expect(result.locked).toBe(true);
    expect(result.missingSteps).toEqual(["passkey"]);
  });

  it("locks until the device reaches the active state", () => {
    const states: Array<DeviceState | null> = [
      null,
      "new",
      "enrolled",
      "suspended",
      "revoked",
      "replaced",
    ];
    for (const deviceState of states) {
      const result = evaluateEnrollmentGate({ ...UNLOCKED, deviceState });
      expect(result.locked).toBe(true);
      expect(result.missingSteps).toEqual(["device"]);
    }
  });

  it("reports multiple missing steps in canonical order", () => {
    const result = evaluateEnrollmentGate({
      accountStatus: "invited",
      hasUsablePasskey: false,
      deviceState: "new",
      biometricConsentRecorded: false,
    });
    expect(result.missingSteps).toEqual(["account", "passkey", "device"]);

    const partial = evaluateEnrollmentGate({
      ...UNLOCKED,
      hasUsablePasskey: false,
      deviceState: "enrolled",
    });
    expect(partial.missingSteps).toEqual(["passkey", "device"]);

    const accountAndDevice = evaluateEnrollmentGate({
      ...UNLOCKED,
      accountStatus: "suspended",
      deviceState: null,
    });
    expect(accountAndDevice.missingSteps).toEqual(["account", "device"]);
  });

  it("explains why it is locked via reason", () => {
    const result = evaluateEnrollmentGate({ ...UNLOCKED, hasUsablePasskey: false });
    expect(result.reason).toBe("Enrollment incomplete: passkey");
  });

  it("does not let biometric consent block or unlock the gate", () => {
    expect(evaluateEnrollmentGate({ ...UNLOCKED, biometricConsentRecorded: true }).locked).toBe(
      false,
    );
    expect(
      evaluateEnrollmentGate({ ...UNLOCKED, biometricConsentRecorded: true }).missingSteps,
    ).toEqual([]);

    const lockedWithConsent = evaluateEnrollmentGate({
      ...UNLOCKED,
      accountStatus: "invited",
      biometricConsentRecorded: true,
    });
    expect(lockedWithConsent.locked).toBe(true);
    expect(lockedWithConsent.biometricConsentRecorded).toBe(true);
  });

  it("always surfaces the recorded biometric consent flag", () => {
    expect(evaluateEnrollmentGate(UNLOCKED).biometricConsentRecorded).toBe(false);
    expect(
      evaluateEnrollmentGate({ ...UNLOCKED, biometricConsentRecorded: true })
        .biometricConsentRecorded,
    ).toBe(true);
  });
});
