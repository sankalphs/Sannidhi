/**
 * Platform operators review onboarding access requests from every
 * institution. An operator is an admin whose email appears in the
 * comma-separated SANNIDHI_OPERATOR_EMAILS Convex env var (case-insensitive);
 * an unset or empty list means nobody is an operator.
 */
export function isOperatorEmail(email: string, operatorEmails: string | undefined): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return (operatorEmails ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .includes(normalized);
}
