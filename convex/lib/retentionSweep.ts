import {
  resolveRetentionDays,
  type RetentionPolicySettings,
} from "../../src/lib/compliance/retention";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type InstitutionRetention = { institutionId: string; retentionDays: number };

/**
 * Per-institution effective retention: the institution-scope policy row's
 * retentionDays when usable, else the env horizon. Department- and venue-scope
 * rows never affect retention. resolveRetentionDays clamps every outcome into
 * [MIN_RETENTION_DAYS, MAX_RETENTION_DAYS].
 */
export function buildRetentionTable(args: {
  institutions: { _id: string }[];
  policyRows: { institutionId: string; scope: string; settings: unknown }[];
  envRetentionDays: number;
}): InstitutionRetention[] {
  const settingsByInstitution = new Map<string, RetentionPolicySettings>();
  for (const row of args.policyRows) {
    if (row.scope !== "institution" || settingsByInstitution.has(row.institutionId)) continue;
    settingsByInstitution.set(row.institutionId, (row.settings ?? {}) as RetentionPolicySettings);
  }
  return args.institutions.map((institution) => ({
    institutionId: institution._id,
    retentionDays: resolveRetentionDays(
      settingsByInstitution.get(institution._id),
      args.envRetentionDays,
    ),
  }));
}

/**
 * Whether a row is older than its institution's effective retention.
 * Unknown institutions are conservatively kept.
 */
export function isPrunable(
  rowCreatedAtMs: number,
  args: { institutionId: string; now: number; table: InstitutionRetention[] },
): boolean {
  const entry = args.table.find((item) => item.institutionId === args.institutionId);
  if (entry === undefined) return false;
  return rowCreatedAtMs < args.now - entry.retentionDays * MS_PER_DAY;
}

/**
 * The loosest horizon across the table: the cutoff that reaches rows prunable
 * under ANY institution, so one index query per chain suffices. The env
 * default only applies when no institutions exist — mixing it in otherwise
 * would wrongly tighten the cutoff against explicit long-retention policies.
 */
export function minRetentionDays(table: InstitutionRetention[], envDefault: number): number {
  if (table.length === 0) return resolveRetentionDays(undefined, envDefault);
  return table.reduce((min, entry) => Math.min(min, entry.retentionDays), Number.POSITIVE_INFINITY);
}
