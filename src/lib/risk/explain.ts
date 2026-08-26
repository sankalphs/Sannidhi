import { RISK_REASON_CODES } from "./engine";
import type { Decision, EvidenceSignal } from "@/lib/decision";

import type { DecisionExplanation, RiskExplanationTier } from "./types";

const HEADLINES: Record<Decision["outcome"], string> = {
  accept: "You're checked in",
  step_up: "Extra quick check needed",
  flag: "Held for faculty review",
  reject: "Could not verify your attendance",
};

const STUDENT_MESSAGES: Record<Decision["outcome"], string> = {
  accept: "Your attendance has been recorded.",
  step_up: "Please complete one extra quick check to confirm your attendance.",
  flag: "Your attendance is held for your faculty member to review.",
  reject: "We could not verify this attempt. Please contact your faculty member.",
};

const STUDENT_ACTIONS_BY_CODE: Record<string, string> = {
  [RISK_REASON_CODES.deviceMissing]: "Activate your registered device from the Devices page.",
  [RISK_REASON_CODES.deviceUntrusted]:
    "Your device isn't active yet — finish activation on the Devices page.",
  [RISK_REASON_CODES.locationMismatch]:
    "Make sure you are inside the classroom venue, then retry check-in.",
  [RISK_REASON_CODES.personSpoofSuspected]:
    "A photo or video was detected instead of a live face — your attendance was sent to your faculty member for review.",
  [RISK_REASON_CODES.personFaceMismatch]:
    "Your face did not match your enrolled profile — your attendance was sent to your faculty member for review.",
  [RISK_REASON_CODES.personCheckInconclusive]:
    "Lighting or visibility made the face check inconclusive — try again in better light if prompted.",
  [RISK_REASON_CODES.spotRecheckMissed]:
    "A spot re-check request expired — contact your faculty member.",
  [RISK_REASON_CODES.stepupEscalatedReview]:
    "Your verification request was sent to your faculty member for review — follow up with them.",
  [RISK_REASON_CODES.repeatedAnomaly]:
    "Several recent attempts were blocked — wait a few minutes or contact your faculty member.",
};

const FACULTY_FACTOR_LABELS: Record<string, string> = {
  [RISK_REASON_CODES.identityUnverified]: "identity unverified",
  [RISK_REASON_CODES.presenceUnverified]: "presence unverified",
  [RISK_REASON_CODES.deviceDistrusted]: "device distrusted",
  [RISK_REASON_CODES.deviceUntrusted]: "device untrusted",
  [RISK_REASON_CODES.deviceMissing]: "device missing",
  [RISK_REASON_CODES.locationMismatch]: "location mismatch",
  [RISK_REASON_CODES.personSpoofSuspected]: "Face check: suspected photo/video",
  [RISK_REASON_CODES.personFaceMismatch]: "Face check: no match",
  [RISK_REASON_CODES.personCheckInconclusive]: "Face check inconclusive",
  [RISK_REASON_CODES.spotRecheckMissed]: "Spot re-check missed",
  [RISK_REASON_CODES.stepupEscalatedReview]: "Step-up escalated to review",
  [RISK_REASON_CODES.repeatedAnomaly]: "repeated anomalies",
  [RISK_REASON_CODES.facultyManualOverride]: "faculty manual override",
};

function facultyFactorLabel(code: string): string {
  if (code.startsWith(RISK_REASON_CODES.deviceStatePrefix)) {
    return `device state ${code.slice(RISK_REASON_CODES.deviceStatePrefix.length)}`;
  }
  return FACULTY_FACTOR_LABELS[code] ?? code;
}

function studentActions(reasonCodes: string[]): string[] {
  const actions: string[] = [];
  for (const code of reasonCodes) {
    const action = STUDENT_ACTIONS_BY_CODE[code];
    if (action && !actions.includes(action)) actions.push(action);
  }
  return actions;
}

function deepCopySignals(signals: EvidenceSignal[]): EvidenceSignal[] {
  return signals.map((signal) => ({ ...signal }));
}

export function explainDecision(
  decision: Decision,
  tier: RiskExplanationTier,
): DecisionExplanation {
  const headline = HEADLINES[decision.outcome];

  if (tier === "admin") {
    return {
      headline,
      message: `Full decision trail for outcome "${decision.outcome}" under policy ${decision.policyVersion}.`,
      actions: [],
      reasons: [...decision.reasonCodes],
      signals: deepCopySignals(decision.evidence.signals),
    };
  }

  if (tier === "faculty") {
    const factors = decision.reasonCodes.map(facultyFactorLabel);
    const message =
      decision.reasonCodes.length > 0
        ? `Challenged factors: ${factors.join(", ")}`
        : "All verification factors passed.";
    return {
      headline,
      message,
      actions: [],
      reasons: [...decision.reasonCodes],
      signals: [],
    };
  }

  return {
    headline,
    message: STUDENT_MESSAGES[decision.outcome],
    actions: studentActions(decision.reasonCodes),
    reasons: [],
    signals: [],
  };
}
