import { describe, expect, it } from "vitest";

import type { DeviceState } from "@/lib/devices/lifecycle";
import { buildEnrollmentGateInput } from "@/lib/enrollment/mapping";
import { ENROLLMENT_STEPS, missingStepCopy } from "@/lib/enrollment/ui";

describe("missingStepCopy", () => {
  it("labels every enrollment step for checklist and locked states", () => {
    expect(missingStepCopy("account")).toBe("Account active");
    expect(missingStepCopy("passkey")).toBe("Passkey registered");
    expect(missingStepCopy("device")).toBe("Device active");
  });

  it("covers the canonical step order", () => {
    expect(ENROLLMENT_STEPS).toEqual(["account", "passkey", "device"]);
    expect(ENROLLMENT_STEPS.map(missingStepCopy)).toHaveLength(3);
  });
});

describe("buildEnrollmentGateInput", () => {
  const ACTIVE_USER = { status: "active" as const };
  const USABLE_CREDENTIALS = [{ revokedAt: null }];
  const ACTIVE_DEVICE = { state: "active" as DeviceState, registeredAt: 30 };
  const ACTIVE_BIOMETRIC = { consentedAt: 10, withdrawnAt: null };

  it("maps a fully enrolled student to an unlocked gate input", () => {
    const input = buildEnrollmentGateInput({
      user: ACTIVE_USER,
      credentials: USABLE_CREDENTIALS,
      devices: [ACTIVE_DEVICE],
      biometric: ACTIVE_BIOMETRIC,
    });
    expect(input).toEqual({
      accountStatus: "active",
      hasUsablePasskey: true,
      deviceState: "active",
      biometricConsentRecorded: true,
    });
  });

  it("treats a missing user as an unactivated account", () => {
    const input = buildEnrollmentGateInput({
      user: null,
      credentials: USABLE_CREDENTIALS,
      devices: [ACTIVE_DEVICE],
      biometric: null,
    });
    expect(input.accountStatus).toBeUndefined();
    expect(input.biometricConsentRecorded).toBe(false);
  });

  it("passes through invited and suspended statuses", () => {
    expect(
      buildEnrollmentGateInput({
        user: { status: "invited" },
        credentials: [],
        devices: [],
        biometric: null,
      }).accountStatus,
    ).toBe("invited");
    expect(
      buildEnrollmentGateInput({
        user: { status: "suspended" },
        credentials: [],
        devices: [],
        biometric: null,
      }).accountStatus,
    ).toBe("suspended");
  });

  it("requires at least one unrevoked credential for a usable passkey", () => {
    expect(
      buildEnrollmentGateInput({
        user: ACTIVE_USER,
        credentials: [{ revokedAt: 5 }, { revokedAt: 9 }],
        devices: [ACTIVE_DEVICE],
        biometric: null,
      }).hasUsablePasskey,
    ).toBe(false);
    expect(
      buildEnrollmentGateInput({
        user: ACTIVE_USER,
        credentials: [{ revokedAt: 5 }, { revokedAt: null }],
        devices: [ACTIVE_DEVICE],
        biometric: null,
      }).hasUsablePasskey,
    ).toBe(true);
    expect(
      buildEnrollmentGateInput({
        user: ACTIVE_USER,
        credentials: [],
        devices: [ACTIVE_DEVICE],
        biometric: null,
      }).hasUsablePasskey,
    ).toBe(false);
  });

  it("picks the active device state when one exists", () => {
    const input = buildEnrollmentGateInput({
      user: ACTIVE_USER,
      credentials: USABLE_CREDENTIALS,
      devices: [
        { state: "replaced", registeredAt: 40 },
        ACTIVE_DEVICE,
        { state: "new", registeredAt: 50 },
      ],
      biometric: null,
    });
    expect(input.deviceState).toBe("active");
  });

  it("falls back to the latest-registered non-active device state", () => {
    const input = buildEnrollmentGateInput({
      user: ACTIVE_USER,
      credentials: USABLE_CREDENTIALS,
      devices: [
        { state: "enrolled", registeredAt: 20 },
        { state: "suspended", registeredAt: 35 },
      ],
      biometric: null,
    });
    expect(input.deviceState).toBe("suspended");
  });

  it("reports null device state with no devices", () => {
    expect(
      buildEnrollmentGateInput({
        user: ACTIVE_USER,
        credentials: USABLE_CREDENTIALS,
        devices: [],
        biometric: null,
      }).deviceState,
    ).toBeNull();
  });

  it("counts only unwithdrawn biometric consent as recorded", () => {
    expect(
      buildEnrollmentGateInput({
        user: ACTIVE_USER,
        credentials: USABLE_CREDENTIALS,
        devices: [ACTIVE_DEVICE],
        biometric: ACTIVE_BIOMETRIC,
      }).biometricConsentRecorded,
    ).toBe(true);
    expect(
      buildEnrollmentGateInput({
        user: ACTIVE_USER,
        credentials: USABLE_CREDENTIALS,
        devices: [ACTIVE_DEVICE],
        biometric: { consentedAt: 10, withdrawnAt: 20 },
      }).biometricConsentRecorded,
    ).toBe(false);
    expect(
      buildEnrollmentGateInput({
        user: ACTIVE_USER,
        credentials: USABLE_CREDENTIALS,
        devices: [ACTIVE_DEVICE],
        biometric: null,
      }).biometricConsentRecorded,
    ).toBe(false);
  });
});
