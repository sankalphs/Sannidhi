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

/** Passkeys are recommended for phishing resistance but never block attendance on their own. */
const REQUIRED_STEPS: Array<Exclude<MissingEnrollmentStep, "passkey">> = ["account", "device"];

export function evaluateEnrollmentGate(input: EnrollmentGateInput): EnrollmentGateResult {
  const completedSteps = {
    account: input.accountStatus === "active",
    passkey: input.hasUsablePasskey === true,
    device: input.deviceState === "active",
  };

  const missingSteps = REQUIRED_STEPS.filter((step) => !completedSteps[step]);
  const locked = missingSteps.length > 0;

  return {
    locked,
    completedSteps,
    missingSteps,
    biometricConsentRecorded: input.biometricConsentRecorded,
    ...(locked ? { reason: `Enrollment incomplete: ${missingSteps.join(", ")}` } : {}),
  };
}

/** True when attendance is unlocked but registering a passkey is still advisable. */
export function isPasskeyRecommended(
  result: Pick<EnrollmentGateResult, "locked" | "completedSteps">,
): boolean {
  return !result.locked && !result.completedSteps.passkey;
}
