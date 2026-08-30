import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { assertSameInstitution, requireAdminUser, requireAnalyticsAuthority } from "./lib/actor";
import {
  getInstitutionPolicyRows,
  nextPolicyRevision,
  validatePolicySettings,
  type PolicySettings,
} from "./lib/policyStore";

type PolicyScope = "institution" | "department" | "venue";

export type PolicyOverviewResult = {
  departments: Array<{ id: Id<"departments">; code: string; name: string }>;
  venues: Array<{ id: Id<"venues">; name: string }>;
  institution: { settings: PolicySettings; revision: number } | null;
  departmentPolicies: Array<{
    departmentId: Id<"departments">;
    code: string;
    name: string;
    settings: PolicySettings;
    revision: number;
  }>;
  venuePolicies: Array<{
    venueId: Id<"venues">;
    name: string;
    settings: PolicySettings;
    revision: number;
  }>;
};

/**
 * Read model for the policy console: pickers (departments, venues) plus every
 * saved policy layer. Department authorities see department policies for their
 * own departments only; institution defaults and venue policies are visible
 * to both roles.
 */
export const getPolicyOverview = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<PolicyOverviewResult> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);

    const [departments, venues, policyRows] = await Promise.all([
      ctx.db
        .query("departments")
        .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
        .collect(),
      ctx.db
        .query("venues")
        .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
        .collect(),
      getInstitutionPolicyRows(ctx, { institutionId: caller.institutionId }),
    ]);

    const institutionRow = policyRows.find(
      (row) => row.scope === "institution" && row.departmentId === undefined,
    );
    const ownDepartmentIds = caller.departmentIds ?? [];

    const departmentPolicies = policyRows
      .filter(
        (
          row,
        ): row is Doc<"policy_rows"> & { scope: "department"; departmentId: Id<"departments"> } =>
          row.scope === "department" && row.departmentId !== undefined,
      )
      .filter(
        (row) =>
          caller.role === "admin" ||
          ownDepartmentIds.includes(row.departmentId as Id<"departments">),
      )
      .flatMap((row) => {
        const department = departments.find((dept) => dept._id === row.departmentId);
        if (department === undefined) return [];
        return [
          {
            departmentId: department._id,
            code: department.code,
            name: department.name,
            settings: (row.settings ?? {}) as PolicySettings,
            revision: row.revision,
          },
        ];
      });

    const venuePolicies = policyRows
      .filter(
        (row): row is Doc<"policy_rows"> & { scope: "venue"; venueId: Id<"venues"> } =>
          row.scope === "venue" && row.venueId !== undefined,
      )
      .flatMap((row) => {
        const venue = venues.find((candidate) => candidate._id === row.venueId);
        if (venue === undefined) return [];
        return [
          {
            venueId: venue._id,
            name: venue.name,
            settings: (row.settings ?? {}) as PolicySettings,
            revision: row.revision,
          },
        ];
      });

    return {
      departments: departments
        .map((department) => ({ id: department._id, code: department.code, name: department.name }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      venues: venues.map((venue) => ({ id: venue._id, name: venue.name })),
      institution:
        institutionRow !== undefined
          ? {
              settings: (institutionRow.settings ?? {}) as PolicySettings,
              revision: institutionRow.revision,
            }
          : null,
      departmentPolicies,
      venuePolicies,
    };
  },
});

async function findExistingPolicyRow(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    scope: PolicyScope;
    departmentId?: Id<"departments"> | null;
    venueId?: Id<"venues"> | null;
  },
): Promise<Doc<"policy_rows"> | null> {
  const institutionId: Id<"institutions"> = args.institutionId;
  if (args.scope === "institution") {
    return ctx.db
      .query("policy_rows")
      .withIndex("by_institution_scope", (q) =>
        q.eq("institutionId", institutionId).eq("scope", "institution"),
      )
      .first();
  }
  if (args.scope === "department" && args.departmentId != null) {
    const departmentId: Id<"departments"> = args.departmentId;
    return ctx.db
      .query("policy_rows")
      .withIndex("by_institution_scope_department", (q) =>
        q
          .eq("institutionId", institutionId)
          .eq("scope", "department")
          .eq("departmentId", departmentId),
      )
      .first();
  }
  if (args.scope === "venue" && args.venueId != null) {
    const venueId: Id<"venues"> = args.venueId;
    return ctx.db
      .query("policy_rows")
      .withIndex("by_institution_scope_venue", (q) =>
        q.eq("institutionId", institutionId).eq("scope", "venue").eq("venueId", venueId),
      )
      .first();
  }
  return null;
}

/**
 * Shared upsert for one policy layer: revision comes from the institution-wide
 * counter so any write moves the resolved-policy stamp forward. Returns the
 * row id plus the revision it was stamped with. expectedRevision is a
 * precondition: when the caller loaded a different revision (or none), the
 * scope changed underneath them and the save is rejected rather than
 * overwriting the newer write.
 */
async function upsertPolicyRow(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    scope: PolicyScope;
    departmentId?: Id<"departments"> | null;
    venueId?: Id<"venues"> | null;
    settings: PolicySettings;
    createdByUserId: Id<"users">;
    expectedRevision: number;
  },
): Promise<{ rowId: Id<"policy_rows">; revision: number }> {
  const existing = await findExistingPolicyRow(ctx, args);
  const loadedRevision = existing !== null ? existing.revision : 0;
  if (loadedRevision !== args.expectedRevision) {
    throw new ConvexError(
      `policy changed since you loaded it (revision ${loadedRevision}); reload and try again`,
    );
  }

  const revision = await nextPolicyRevision(ctx, { institutionId: args.institutionId });
  const now = Date.now();

  if (existing !== null) {
    await ctx.db.patch(existing._id, {
      settings: args.settings,
      revision,
      createdByUserId: args.createdByUserId,
      createdAt: now,
    });
    return { rowId: existing._id, revision };
  }

  const rowId = await ctx.db.insert("policy_rows", {
    institutionId: args.institutionId,
    scope: args.scope,
    ...(args.departmentId != null ? { departmentId: args.departmentId } : {}),
    ...(args.venueId != null ? { venueId: args.venueId } : {}),
    settings: args.settings,
    revision,
    createdByUserId: args.createdByUserId,
    createdAt: now,
  });
  return { rowId, revision };
}

function validateSettings(settings: PolicySettings): void {
  const issues = validatePolicySettings(settings);
  if (issues.length > 0) throw new ConvexError(issues.join("; "));
}

export const saveInstitutionPolicy = mutation({
  args: {
    actorToken: v.string(),
    expectedRevision: v.number(),
    settings: v.any(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);
    const settings = args.settings as PolicySettings;
    validateSettings(settings);

    const { revision } = await upsertPolicyRow(ctx, {
      institutionId: caller.institutionId,
      scope: "institution",
      settings,
      createdByUserId: caller._id,
      expectedRevision: args.expectedRevision,
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "identity",
      type: "policy.institution_policy_saved",
      actorUserId: caller._id,
      payload: { revision, keys: Object.keys(settings).sort() },
    });
    return { revision };
  },
});

export const saveDepartmentPolicy = mutation({
  args: {
    actorToken: v.string(),
    departmentId: v.id("departments"),
    expectedRevision: v.number(),
    settings: v.any(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);
    const department = await ctx.db.get(args.departmentId);
    if (department === null) throw new ConvexError("Department not found");
    assertSameInstitution(caller.institutionId, department.institutionId);

    const settings = args.settings as PolicySettings;
    validateSettings(settings);

    const { revision } = await upsertPolicyRow(ctx, {
      institutionId: caller.institutionId,
      scope: "department",
      departmentId: args.departmentId,
      settings,
      createdByUserId: caller._id,
      expectedRevision: args.expectedRevision,
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "identity",
      type: "policy.department_policy_saved",
      actorUserId: caller._id,
      payload: { departmentId: args.departmentId, revision, keys: Object.keys(settings).sort() },
    });
    return { revision };
  },
});

export const saveVenuePolicy = mutation({
  args: {
    actorToken: v.string(),
    venueId: v.id("venues"),
    expectedRevision: v.number(),
    settings: v.any(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);
    const venue = await ctx.db.get(args.venueId);
    if (venue === null) throw new ConvexError("Venue not found");
    assertSameInstitution(caller.institutionId, venue.institutionId);

    const settings = args.settings as PolicySettings;
    validateSettings(settings);

    const { revision } = await upsertPolicyRow(ctx, {
      institutionId: caller.institutionId,
      scope: "venue",
      venueId: args.venueId,
      settings,
      createdByUserId: caller._id,
      expectedRevision: args.expectedRevision,
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "identity",
      type: "policy.venue_policy_saved",
      actorUserId: caller._id,
      payload: { venueId: args.venueId, revision, keys: Object.keys(settings).sort() },
    });
    return { revision };
  },
});

/** Removes one policy layer; the scope below it (or defaults) takes over immediately. */
export const clearPolicyScope = mutation({
  args: {
    actorToken: v.string(),
    scope: v.union(v.literal("institution"), v.literal("department"), v.literal("venue")),
    departmentId: v.optional(v.id("departments")),
    venueId: v.optional(v.id("venues")),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);
    if (args.scope === "department" && args.departmentId === undefined) {
      throw new ConvexError("departmentId is required for department scope");
    }
    if (args.scope === "venue" && args.venueId === undefined) {
      throw new ConvexError("venueId is required for venue scope");
    }

    const rows = (
      await getInstitutionPolicyRows(ctx, { institutionId: caller.institutionId })
    ).filter((row) => {
      if (row.scope !== args.scope) return false;
      if (args.scope === "department") return row.departmentId === args.departmentId;
      if (args.scope === "venue") return row.venueId === args.venueId;
      return true;
    });

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    if (rows.length > 0) {
      // Bump the counter so post-clear saves never reuse a stamped revision.
      await nextPolicyRevision(ctx, { institutionId: caller.institutionId });
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: caller.institutionId,
        category: "identity",
        type: "policy.policy_cleared",
        actorUserId: caller._id,
        payload: {
          scope: args.scope,
          ...(args.departmentId !== undefined ? { departmentId: args.departmentId } : {}),
          ...(args.venueId !== undefined ? { venueId: args.venueId } : {}),
        },
      });
    }
    return { ok: true as const, cleared: rows.length };
  },
});
