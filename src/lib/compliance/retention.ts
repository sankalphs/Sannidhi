export type RetentionPolicySettings = {
  retentionDays?: number;
};

export const DEFAULT_RETENTION_DAYS = 730;
export const MIN_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 3650;

const clampRetentionDays = (days: number): number =>
  Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, days));

// Out-of-range values are clamped into [MIN, MAX]; absent/non-finite values fall back
// to the environment default (itself clamped), then to DEFAULT_RETENTION_DAYS.
export function resolveRetentionDays(
  settings: RetentionPolicySettings | null | undefined,
  envDefault: number,
): number {
  if (typeof settings?.retentionDays === "number" && Number.isFinite(settings.retentionDays)) {
    return clampRetentionDays(settings.retentionDays);
  }
  if (typeof envDefault === "number" && Number.isFinite(envDefault)) {
    return clampRetentionDays(envDefault);
  }
  return DEFAULT_RETENTION_DAYS;
}
