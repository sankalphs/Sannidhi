import type { DeviceState } from "./devices/lifecycle";

export const DEVICE_EVIDENCE_POLICY_VERSION = "device-evidence/v1";

export type DeviceTrustEvidence = {
  deviceId: string;
  state: DeviceState;
  isTrusted: boolean;
  activatedAt: number | null;
  suspendedAt: number | null;
  replacedByDeviceId: string | null;
  evidenceVersion: string;
};

export type DeviceEvidenceSource = {
  _id: string;
  state: DeviceState;
  activatedAt?: number;
  stateChangedAt?: number;
  replacedByDeviceId?: string;
};

export function buildDeviceTrustEvidence(device: DeviceEvidenceSource): DeviceTrustEvidence {
  return {
    deviceId: device._id,
    state: device.state,
    isTrusted: device.state === "active",
    activatedAt: device.activatedAt ?? null,
    suspendedAt: device.state === "suspended" ? (device.stateChangedAt ?? null) : null,
    replacedByDeviceId: device.replacedByDeviceId ?? null,
    evidenceVersion: DEVICE_EVIDENCE_POLICY_VERSION,
  };
}
