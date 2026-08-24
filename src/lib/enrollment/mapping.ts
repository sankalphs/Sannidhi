import type { DeviceState } from "../devices/lifecycle";
import type { AccountStatus, EnrollmentGateInput } from "./gate";

export type EnrollmentUserLike = {
  status?: AccountStatus | null;
};

export type EnrollmentCredentialLike = {
  revokedAt?: number | null;
};

export type EnrollmentDeviceLike = {
  state: DeviceState;
  registeredAt?: number | null;
};

export type EnrollmentBiometricLike = {
  consentedAt?: number | null;
  withdrawnAt?: number | null;
} | null;

export function hasUsablePasskey(credentials: readonly EnrollmentCredentialLike[]): boolean {
  return credentials.some((credential) => credential.revokedAt == null);
}

export function resolveGateDeviceState(
  devices: readonly EnrollmentDeviceLike[],
): DeviceState | null {
  if (devices.some((device) => device.state === "active")) return "active";
  const latest = [...devices].sort((a, b) => (b.registeredAt ?? 0) - (a.registeredAt ?? 0))[0];
  return latest !== undefined ? latest.state : null;
}

export function hasActiveBiometricConsent(record: EnrollmentBiometricLike): boolean {
  return record !== null && record.consentedAt != null && record.withdrawnAt == null;
}

export function buildEnrollmentGateInput(raw: {
  user: EnrollmentUserLike | null;
  credentials: readonly EnrollmentCredentialLike[];
  devices: readonly EnrollmentDeviceLike[];
  biometric: EnrollmentBiometricLike;
}): EnrollmentGateInput {
  return {
    accountStatus: raw.user?.status ?? undefined,
    hasUsablePasskey: hasUsablePasskey(raw.credentials),
    deviceState: resolveGateDeviceState(raw.devices),
    biometricConsentRecorded: hasActiveBiometricConsent(raw.biometric),
  };
}
