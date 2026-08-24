import type { Decision } from "@/lib/decision";

import { RISK_POLICY_VERSION, type RiskInput } from "./types";

export const RISK_ANOMALY_FLAG_THRESHOLD = 3;
export const MANUAL_ATTESTATION_IDENTITY_SOURCE = "faculty_attestation";
export const MANUAL_ATTESTATION_PRESENCE_SOURCE = "faculty_observation";

export const RISK_REASON_CODES = {
  identityUnverified: "identity_unverified",
  presenceUnverified: "presence_unverified",
  deviceDistrusted: "device_distrusted",
  deviceStatePrefix: "device_state:",
  deviceUntrusted: "device_untrusted",
  deviceMissing: "device_missing",
  locationMismatch: "location_mismatch",
  repeatedAnomaly: "repeated_anomaly",
  facultyManualOverride: "faculty_manual_override",
} as const;

export type AttendanceState = "verified" | "step_up" | "flagged" | "rejected";

export function outcomeToAttendanceState(outcome: Decision["outcome"]): AttendanceState {
  switch (outcome) {
    case "accept":
      return "verified";
    case "step_up":
      return "step_up";
    case "flag":
      return "flagged";
    case "reject":
      return "rejected";
  }
}

export function decide(input: RiskInput): Decision {
  const signals = input.signals;

  const hasManualIdentity = signals.some(
    (signal) =>
      signal.category === "identity" &&
      signal.source === MANUAL_ATTESTATION_IDENTITY_SOURCE &&
      signal.status === "verified",
  );
  const hasManualPresence = signals.some(
    (signal) =>
      signal.category === "presence" &&
      signal.source === MANUAL_ATTESTATION_PRESENCE_SOURCE &&
      signal.status === "verified",
  );

  let outcome: Decision["outcome"];
  const reasonCodes: string[] = [];

  if (hasManualIdentity && hasManualPresence) {
    outcome = "accept";
    reasonCodes.push(RISK_REASON_CODES.facultyManualOverride);
  } else if (!signals.some((s) => s.category === "identity" && s.status === "verified")) {
    outcome = "reject";
    reasonCodes.push(RISK_REASON_CODES.identityUnverified);
  } else if (!signals.some((s) => s.category === "presence" && s.status === "verified")) {
    outcome = "reject";
    reasonCodes.push(RISK_REASON_CODES.presenceUnverified);
  } else {
    const distrusted = signals.find((s) => s.category === "device" && s.status === "failed");
    if (distrusted) {
      outcome = "flag";
      reasonCodes.push(
        RISK_REASON_CODES.deviceDistrusted,
        `${RISK_REASON_CODES.deviceStatePrefix}${distrusted.detail ?? ""}`,
      );
    } else if ((input.anomalies?.recentSecurityFailures ?? 0) >= RISK_ANOMALY_FLAG_THRESHOLD) {
      outcome = "flag";
      reasonCodes.push(RISK_REASON_CODES.repeatedAnomaly);
    } else {
      const weaknesses: string[] = [];
      for (const signal of signals) {
        if (signal.category === "device" && signal.status === "weak") {
          weaknesses.push(RISK_REASON_CODES.deviceUntrusted);
        }
      }
      for (const signal of signals) {
        if (signal.category === "device" && signal.status === "missing") {
          weaknesses.push(RISK_REASON_CODES.deviceMissing);
        }
      }
      for (const signal of signals) {
        if (
          signal.category === "presence" &&
          signal.source === "geolocation" &&
          signal.status === "weak"
        ) {
          weaknesses.push(RISK_REASON_CODES.locationMismatch);
        }
      }

      if (weaknesses.length > 0) {
        outcome = "step_up";
        reasonCodes.push(...weaknesses);
      } else {
        outcome = "accept";
      }
    }
  }

  return {
    outcome,
    evidence: { signals: [...signals] },
    reasonCodes,
    policyVersion: RISK_POLICY_VERSION,
    decidedAt: input.now ?? Date.now(),
  };
}
