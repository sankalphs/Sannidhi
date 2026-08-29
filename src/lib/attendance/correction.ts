import type { Decision, EvidenceSignal } from "@/lib/decision";
import {
  MANUAL_ATTESTATION_IDENTITY_SOURCE,
  MANUAL_ATTESTATION_PRESENCE_SOURCE,
} from "@/lib/risk/engine";

/** Reason code stamped on every faculty-applied correction decision. */
export const FACULTY_CORRECTION_REASON_CODE = "faculty_correction";

/** Policy version used when the disputed event carries no decision to inherit from. */
export const CORRECTION_FALLBACK_POLICY_VERSION = "correction/unversioned";

/**
 * The Decision attached to a "corrected" attendance event. Outcome "accept"
 * projects to "verified" through the risk engine's outcomeToAttendanceState;
 * policyVersion is inherited from the original event so the audit trail keeps
 * the policy context the disputed verdict was made under (report §12).
 */
export function buildCorrectionDecision(
  original: { policyVersion?: string } | undefined,
  args: { decidedAt: number },
): Decision {
  const signals: EvidenceSignal[] = [
    { category: "identity", source: MANUAL_ATTESTATION_IDENTITY_SOURCE, status: "verified" },
    { category: "presence", source: MANUAL_ATTESTATION_PRESENCE_SOURCE, status: "verified" },
  ];
  return {
    outcome: "accept",
    evidence: { signals },
    reasonCodes: [FACULTY_CORRECTION_REASON_CODE],
    policyVersion: original?.policyVersion ?? CORRECTION_FALLBACK_POLICY_VERSION,
    decidedAt: args.decidedAt,
  };
}

/**
 * The note stored on the correction event: the student's dispute reason plus
 * the reviewer's optional note, folded into one string because
 * attendance_events has a single note field.
 */
export function foldCorrectionNote(studentReason: string, reviewNote?: string): string {
  const trimmed = reviewNote?.trim();
  if (trimmed === undefined || trimmed.length === 0) return studentReason;
  return `${studentReason}\nReviewer: ${trimmed}`;
}
