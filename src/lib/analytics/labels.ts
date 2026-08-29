/**
 * Human-readable labels for machine reason codes and alert factors surfaced on
 * analytics and review-inbox surfaces. Exact table first, then prefix rules,
 * then the raw code.
 */

export const REASON_LABELS: Record<string, string> = {
  person_spoof_suspected: "Face spoof suspected",
  person_face_mismatch: "Face mismatch",
  repeated_anomaly: "Repeated anomaly",
  device_distrusted: "Distrusted device",
  spot_recheck_missed: "Missed spot re-check",
  stepup_escalated_review: "Escalated review",
  device_untrusted: "Untrusted device",
  device_missing: "No device on file",
  location_mismatch: "Location outside venue",
  identity_unverified: "Identity unverified",
  presence_unverified: "Presence unverified",
  person_check_inconclusive: "Inconclusive face check",
  challenge_expired_use: "Expired challenge",
  faculty_manual_override: "Faculty override",
  offline_capture: "Offline capture",
  attendance_below_threshold: "Attendance below threshold",
};

const FACTOR_PREFIX_RULES: Array<{ prefix: string; format: (value: string) => string }> = [
  { prefix: "consecutive_absences:", format: (value) => `${value} consecutive absences` },
  { prefix: "attendance:", format: (value) => `Attendance at ${value}` },
  {
    prefix: "proxy_flags:",
    format: (value) => `${value} flagged ${value === "1" ? "check-in" : "check-ins"}`,
  },
  {
    prefix: "ledger_anomalies:",
    format: (value) => `${value} ledger ${value === "1" ? "anomaly" : "anomalies"}`,
  },
  { prefix: "device_state:", format: (value) => `Device state: ${value}` },
];

/** Formats a reason code or factor for display: known labels, prefix rules, then raw. */
export function formatReasonCode(code: string): string {
  const exact = REASON_LABELS[code];
  if (exact !== undefined) return exact;

  for (const rule of FACTOR_PREFIX_RULES) {
    if (code.startsWith(rule.prefix)) {
      return rule.format(code.slice(rule.prefix.length));
    }
  }
  return code;
}
