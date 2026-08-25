export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const USN_MIN_LENGTH = 4;
export const USN_MAX_LENGTH = 24;

export type PasswordIssue =
  "password_too_short" | "password_too_long" | "password_missing_letter" | "password_missing_digit";

export type UsnIssue = "usn_invalid_format";

export type IdentifierKind = "email" | "usn";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** USNs are alphanumeric seat numbers (e.g. 1SI22CS001); case-insensitive on input. */
export function normalizeUsn(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateUsn(raw: string): UsnIssue[] {
  const usn = normalizeUsn(raw);
  if (!/^[A-Z0-9]+$/.test(usn) || usn.length < USN_MIN_LENGTH || usn.length > USN_MAX_LENGTH) {
    return ["usn_invalid_format"];
  }
  return [];
}

export function classifyIdentifier(raw: string): IdentifierKind {
  return raw.includes("@") ? "email" : "usn";
}

export function validateEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim().toLowerCase());
}

export function validatePassword(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("password_too_short");
  if (password.length > PASSWORD_MAX_LENGTH) issues.push("password_too_long");
  if (!/[a-zA-Z]/.test(password)) issues.push("password_missing_letter");
  if (!/\d/.test(password)) issues.push("password_missing_digit");
  return issues;
}

const PASSWORD_ISSUE_COPY: Record<PasswordIssue, string> = {
  password_too_short: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  password_too_long: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  password_missing_letter: "Password must include at least one letter.",
  password_missing_digit: "Password must include at least one number.",
};

export function passwordIssueCopy(issue: PasswordIssue): string {
  return PASSWORD_ISSUE_COPY[issue];
}

export function describePasswordIssues(issues: PasswordIssue[]): string {
  return issues.map(passwordIssueCopy).join(" ");
}
