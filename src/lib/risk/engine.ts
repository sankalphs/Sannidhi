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
  personSpoofSuspected: "person_spoof_suspected",
  personFaceMismatch: "person_face_mismatch",
  personCheckInconclusive: "person_check_inconclusive",
  repeatedAnomaly: "repeated_anomaly",
  spotRecheckMissed: "spot_recheck_missed",
  stepupEscalatedReview: "stepup_escalated_review",
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
  const failedPersonSignals = signals.filter(
    (signal) => signal.category === "person" && signal.status === "failed",
  );
  const distrusted = signals.find(
    (signal) => signal.category === "device" && signal.status === "failed",
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
  } else if (failedPersonSignals.length > 0) {
    outcome = "flag";
    if (failedPersonSignals.some((s) => s.detail?.startsWith("spoof_suspected"))) {
      reasonCodes.push(RISK_REASON_CODES.personSpoofSuspected);
    }
    if (failedPersonSignals.some((s) => s.detail?.startsWith("mismatch"))) {
      reasonCodes.push(RISK_REASON_CODES.personFaceMismatch);
    }
  } else if (distrusted) {
    outcome = "flag";
    reasonCodes.push(
      RISK_REASON_CODES.deviceDistrusted,
      `${RISK_REASON_CODES.deviceStatePrefix}${distrusted.detail ?? ""}`,
    );
  } else if ((input.anomalies?.recentSecurityFailures ?? 0) >= RISK_ANOMALY_FLAG_THRESHOLD) {
    outcome = "flag";
    reasonCodes.push(RISK_REASON_CODES.repeatedAnomaly);
  } else if (input.anomalies?.missedSpotRecheck) {
    outcome = "flag";
    reasonCodes.push(RISK_REASON_CODES.spotRecheckMissed);
  } else if (input.anomalies?.reviewRequested) {
    outcome = "flag";
    reasonCodes.push(RISK_REASON_CODES.stepupEscalatedReview);
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
    for (const signal of signals) {
      if (signal.category === "person" && signal.status === "weak") {
        weaknesses.push(RISK_REASON_CODES.personCheckInconclusive);
      }
    }

    if (weaknesses.length > 0) {
      outcome = "step_up";
      reasonCodes.push(...weaknesses);
    } else {
      outcome = "accept";
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
