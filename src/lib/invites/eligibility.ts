type ExistingAccount = {
  institutionId: string;
  status?: "invited" | "active" | "suspended";
};

/**
 * Why an email cannot be sent a new invite link, or null when it can. Only
 * accounts that have not activated yet are re-invitable: an invite enrols a
 * passkey, so issuing one for an active account would hand over that account.
 * `allowExistingAccount` is for operator recovery of an existing admin.
 */
export function inviteRefusal(
  email: string,
  existing: ExistingAccount | null,
  institutionId: string,
  options: { allowExistingAccount?: boolean } = {},
): string | null {
  if (existing === null) return null;
  if (existing.institutionId !== institutionId) return `${email} belongs to another institution`;
  if (existing.status === "invited" || options.allowExistingAccount === true) return null;
  return existing.status === "suspended"
    ? `${email} is suspended — reactivate it instead of re-inviting`
    : `${email} already has an active account`;
}
