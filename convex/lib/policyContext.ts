import type { ResolvedRiskPolicy } from "../../src/lib/risk/policy";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolvePolicySettings } from "./policyStore";

/**
 * Risk policy for one class session's decisions: institution defaults, then
 * the department override of the session's course, then the venue override.
 * With no policy rows this resolves to built-in defaults whose empty stamp
 * keeps decisions on the base risk-engine/v1 policyVersion, so behavior is
 * identical to the pre-policy paths.
 */
export async function resolveSessionPolicy(
  ctx: MutationCtx | QueryCtx,
  session: Doc<"class_sessions">,
): Promise<ResolvedRiskPolicy> {
  const course = await ctx.db.get(session.courseId);
  const { resolved } = await resolvePolicySettings(ctx, {
    institutionId: session.institutionId,
    departmentId: course?.departmentId ?? null,
    venueId: session.venueId,
  });
  return resolved;
}
