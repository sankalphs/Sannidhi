import type { DeviceState } from "../devices/lifecycle";

export type AccountStatus = "invited" | "active" | "suspended";

export type MissingEnrollmentStep = "account" | "passkey" | "device";

export type EnrollmentGateInput = {
  accountStatus: AccountStatus | undefined;
  hasUsablePasskey: boolean;
  deviceState: DeviceState | null;
  biometricConsentRecorded: boolean;
};

export type EnrollmentGateResult = {
  locked: boolean;
  completedSteps: {
    account: boolean;
    passkey: boolean;
    device: boolean;
  };
  missingSteps: MissingEnrollmentStep[];
  biometricConsentRecorded: boolean;
  reason?: string;
};

const STEP_ORDER: MissingEnrollmentStep[] = ["account", "passkey", "device"];

export function evaluateEnrollmentGate(input: EnrollmentGateInput): EnrollmentGateResult {
  const completedSteps = {
    account: input.accountStatus === "active",
    passkey: input.hasUsablePasskey === true,
    device: input.deviceState === "active",
  };

  const missingSteps = STEP_ORDER.filter((step) => !completedSteps[step]);
  const locked = missingSteps.length > 0;

  return {
    locked,
    completedSteps,
    missingSteps,
    biometricConsentRecorded: input.biometricConsentRecorded,
    ...(locked ? { reason: `Enrollment incomplete: ${missingSteps.join(", ")}` } : {}),
  };
}
