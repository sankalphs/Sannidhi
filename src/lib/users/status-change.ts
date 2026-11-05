export type AccountStatus = "invited" | "active" | "suspended";

/**
 * Why an admin cannot move an account to `next`, or null when they can.
 * Shared by the Convex mutation (enforcement) and the Users page (which
 * actions to offer). Missing status means a legacy active account.
 */
export function statusChangeRefusal(
  current: AccountStatus | undefined,
  next: "active" | "suspended",
  isSelf: boolean,
): string | null {
  const status = current ?? "active";
  if (next === "suspended") {
    if (isSelf) return "you cannot suspend yourself";
    return status === "active" ? null : "only active accounts can be suspended";
  }
  return status === "suspended" ? null : "only suspended accounts can be reactivated";
}
