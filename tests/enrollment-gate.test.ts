import { describe, expect, it } from "vitest";

import {
  evaluateEnrollmentGate,
  isPasskeyRecommended,
  type EnrollmentGateInput,
} from "@/lib/enrollment/gate";
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

  it("treats the passkey as recommended — a missing passkey alone never locks", () => {
    const result = evaluateEnrollmentGate({ ...UNLOCKED, hasUsablePasskey: false });
    expect(result.locked).toBe(false);
    expect(result.missingSteps).toEqual([]);
    expect(result.completedSteps.passkey).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("flags the passkey as recommended whenever it is absent, even when locked", () => {
    const lockedResult = evaluateEnrollmentGate({ ...UNLOCKED, deviceState: "enrolled" });
    expect(lockedResult.locked).toBe(true);
    expect(isPasskeyRecommended(lockedResult)).toBe(false);

    const unlockedResult = evaluateEnrollmentGate({ ...UNLOCKED, hasUsablePasskey: false });
    expect(isPasskeyRecommended(unlockedResult)).toBe(true);
    expect(isPasskeyRecommended(evaluateEnrollmentGate(UNLOCKED))).toBe(false);
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

  it("reports missing required steps in canonical order, ignoring the passkey", () => {
    const result = evaluateEnrollmentGate({
      accountStatus: "invited",
      hasUsablePasskey: false,
      deviceState: "new",
      biometricConsentRecorded: false,
    });
    expect(result.missingSteps).toEqual(["account", "device"]);

    const partial = evaluateEnrollmentGate({
      ...UNLOCKED,
      hasUsablePasskey: false,
      deviceState: "enrolled",
    });
    expect(partial.missingSteps).toEqual(["device"]);

    const accountAndDevice = evaluateEnrollmentGate({
      ...UNLOCKED,
      accountStatus: "suspended",
      deviceState: null,
    });
    expect(accountAndDevice.missingSteps).toEqual(["account", "device"]);
  });

  it("explains why it is locked via reason", () => {
    const result = evaluateEnrollmentGate({ ...UNLOCKED, deviceState: null });
    expect(result.reason).toBe("Enrollment incomplete: device");
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
