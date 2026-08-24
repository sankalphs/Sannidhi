import type { MissingEnrollmentStep } from "./gate";

export const ENROLLMENT_STEPS: readonly MissingEnrollmentStep[] = ["account", "passkey", "device"];

const STEP_COPY: Record<MissingEnrollmentStep, string> = {
  account: "Account active",
  passkey: "Passkey registered",
  device: "Device active",
};

export function missingStepCopy(step: MissingEnrollmentStep): string {
  return STEP_COPY[step];
}
