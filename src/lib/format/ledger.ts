/**
 * How the ledger UI groups events. Schedule edits are stored under the
 * "attendance" category (the stored category is hash-chained and cannot
 * change), so "schedule" is derived from the `schedule.` type prefix.
 */
export const LEDGER_DISPLAY_CATEGORIES = ["identity", "device", "attendance", "schedule"] as const;

export type LedgerDisplayCategory = (typeof LEDGER_DISPLAY_CATEGORIES)[number];

export const LEDGER_CATEGORY_LABEL: Record<LedgerDisplayCategory, string> = {
  identity: "Identity",
  device: "Device",
  attendance: "Attendance",
  schedule: "Schedule",
};

export function ledgerDisplayCategory(category: string, type: string): LedgerDisplayCategory {
  if (type.startsWith("schedule.")) return "schedule";
  if (category === "identity" || category === "device") return category;
  return "attendance";
}
