import type { EvidenceSignal } from "@/lib/decision";
import type { DeviceState } from "@/lib/devices/lifecycle";

import type { LocationOutcome } from "./presence";

export function identitySessionSignal(): EvidenceSignal {
  return { category: "identity", source: "passkey_session", status: "verified" };
}

export function deviceTrustSignal(device: { state: DeviceState } | null): EvidenceSignal {
  if (device === null) {
    return {
      category: "device",
      source: "trust",
      status: "missing",
      detail: "no_registered_device",
    };
  }
  switch (device.state) {
    case "active":
      return { category: "device", source: "trust", status: "verified", detail: "active" };
    case "enrolled":
    case "new":
      return { category: "device", source: "trust", status: "weak", detail: device.state };
    default:
      return { category: "device", source: "trust", status: "failed", detail: device.state };
  }
}

export function challengePresenceSignal(sessionId: string): EvidenceSignal {
  return {
    category: "presence",
    source: "session_challenge",
    status: "verified",
    detail: sessionId,
  };
}

export function failurePresenceSignal(verdict: string): EvidenceSignal {
  return { category: "presence", source: "session_challenge", status: "failed", detail: verdict };
}

export function geolocationSignal(outcome: LocationOutcome): EvidenceSignal {
  switch (outcome.verdict) {
    case "consistent":
      return {
        category: "presence",
        source: "geolocation",
        status: "verified",
        detail: `within ${Math.round(outcome.distanceMeters)} m`,
      };
    case "mismatch":
      return {
        category: "presence",
        source: "geolocation",
        status: "weak",
        detail: `${Math.round(outcome.distanceMeters)} m from venue`,
      };
    case "inconclusive":
      return {
        category: "presence",
        source: "geolocation",
        status: "missing",
        detail: "inconclusive",
      };
    case "no_reference":
      return {
        category: "presence",
        source: "geolocation",
        status: "missing",
        detail: "no_venue_reference",
      };
    case "unavailable":
      return { category: "presence", source: "geolocation", status: "unavailable" };
    case "not_consented":
      return {
        category: "presence",
        source: "geolocation",
        status: "missing",
        detail: "location_not_consented",
      };
  }
}

export type FaceMatchOutcome =
  | { verdict: "match"; similarity: number }
  | { verdict: "mismatch"; similarity: number }
  | { verdict: "spoof_suspected" }
  | { verdict: "inconclusive" };

export function faceMatchSignal(outcome: FaceMatchOutcome): EvidenceSignal {
  switch (outcome.verdict) {
    case "match":
      return {
        category: "person",
        source: "face_match",
        status: "verified",
        detail: `similarity:${outcome.similarity.toFixed(3)}`,
      };
    case "mismatch":
      return {
        category: "person",
        source: "face_match",
        status: "failed",
        detail: `mismatch:${outcome.similarity.toFixed(3)}`,
      };
    case "spoof_suspected":
      return {
        category: "person",
        source: "face_match",
        status: "failed",
        detail: "spoof_suspected",
      };
    case "inconclusive":
      return { category: "person", source: "face_match", status: "weak", detail: "inconclusive" };
  }
}

export function manualAttestationSignals(reason: string): EvidenceSignal[] {
  return [
    {
      category: "identity",
      source: "faculty_attestation",
      status: "verified",
      detail: reason,
    },
    { category: "presence", source: "faculty_observation", status: "verified" },
  ];
}
