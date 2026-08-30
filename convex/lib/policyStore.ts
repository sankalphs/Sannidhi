import {
  resolveInstitutionPolicy,
  type PolicySettings,
  validatePolicySettings,
} from "../../src/lib/policies/settings";
import { type ResolvedRiskPolicy, type RiskPolicySettings } from "../../src/lib/risk/policy";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export { type PolicySettings, validatePolicySettings };

/**
 * Layered policy for one context: institution defaults, then the department
 * override, then the venue override. revision is the highest revision among
 * layers that actually contributed a key (0 when no row exists); the same
 * number rides into resolved.stamp so decision records cite their policy.
 */
export async function resolvePolicySettings(
  ctx: MutationCtx | QueryCtx,
  args: {
    institutionId: Id<"institutions">;
    departmentId?: Id<"departments"> | null;
    venueId?: Id<"venues"> | null;
  },
): Promise<{ settings: RiskPolicySettings; resolved: ResolvedRiskPolicy; revision: number }> {
  const departmentId = args.departmentId ?? null;
  const venueId = args.venueId ?? null;

  const [institutionRow, departmentRow, venueRow] = await Promise.all([
    ctx.db
      .query("policy_rows")
      .withIndex("by_institution_scope", (q) =>
        q.eq("institutionId", args.institutionId).eq("scope", "institution"),
      )
      .first(),
    departmentId !== null
      ? ctx.db
          .query("policy_rows")
          .withIndex("by_institution_scope_department", (q) =>
            q
              .eq("institutionId", args.institutionId)
              .eq("scope", "department")
              .eq("departmentId", departmentId),
          )
          .first()
      : Promise.resolve(null),
    venueId !== null
      ? ctx.db
          .query("policy_rows")
          .withIndex("by_institution_scope_venue", (q) =>
            q.eq("institutionId", args.institutionId).eq("scope", "venue").eq("venueId", venueId),
          )
          .first()
      : Promise.resolve(null),
  ]);

  const layers = [institutionRow, departmentRow, venueRow]
    .filter((row): row is Doc<"policy_rows"> => row !== null)
    .map((row) => ({ settings: (row.settings ?? {}) as PolicySettings, revision: row.revision }));

  const { settings, resolved, revision } = resolveInstitutionPolicy(layers);

  return { settings: settings as RiskPolicySettings, resolved, revision };
}

/** Every policy row for an institution; the retention sweep and the overview read from here. */
export async function getInstitutionPolicyRows(
  ctx: MutationCtx | QueryCtx,
  args: { institutionId: Id<"institutions"> },
): Promise<Array<Doc<"policy_rows">>> {
  return ctx.db
    .query("policy_rows")
    .withIndex("by_institution_scope", (q) => q.eq("institutionId", args.institutionId))
    .collect();
}

/**
 * Next revision for any policy write in this institution. One counter across
 * all scopes so the revision stamped on resolved policies always moves forward.
 */
export async function nextPolicyRevision(
  ctx: MutationCtx | QueryCtx,
  args: { institutionId: Id<"institutions"> },
): Promise<number> {
  const rows = await getInstitutionPolicyRows(ctx, args);
  const max = rows.reduce((acc, row) => Math.max(acc, row.revision), 0);
  return Math.max(1, max + 1);
}
