import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  type RetentionPolicySettings,
} from "@/lib/compliance/retention";
import {
  mergeRiskPolicySettings,
  resolveRiskPolicy,
  validateRiskPolicySettings,
  type ResolvedRiskPolicy,
  type RiskPolicySettings,
} from "@/lib/risk/policy";

/**
 * Combined per-scope settings stored in policy_rows: the risk knobs plus the
 * compliance retention horizon. Both halves are sparse; a row may carry
 * either or both.
 */
export type PolicySettings = RiskPolicySettings & RetentionPolicySettings;

/** Validation issues for a sparse settings payload; an empty list means it may be stored. */
export function validatePolicySettings(settings: PolicySettings): string[] {
  const issues = validateRiskPolicySettings(settings);
  if (settings.retentionDays !== undefined) {
    const days = settings.retentionDays;
    if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
      issues.push(
        `retentionDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
      );
    }
  }
  return issues;
}

/**
 * Policy precedence used by every surface: institution defaults, then the
 * department override, then the venue override. revision is the highest
 * revision among layers that actually contributed a key (0 when no row
 * exists); resolved.stamp carries that number into decision records.
 */
export function resolveInstitutionPolicy(
  layers: { settings?: PolicySettings; revision?: number }[],
): { settings: PolicySettings; resolved: ResolvedRiskPolicy; revision: number } {
  const contributed = layers.filter(
    (layer): layer is { settings: PolicySettings; revision?: number } =>
      Object.keys(layer.settings ?? {}).length > 0,
  );
  const settings = mergeRiskPolicySettings(...contributed.map((layer) => layer.settings));
  const resolved = resolveRiskPolicy(
    contributed.map((layer) => ({ settings: layer.settings, revision: layer.revision })),
  );
  const revision = contributed.reduce((max, layer) => Math.max(max, layer.revision ?? 0), 0);
  return { settings, resolved, revision };
}
