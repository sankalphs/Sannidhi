import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { createSingleInvite } from "./invites";
import { ALL_TABLES, deleteRows } from "./lib/wipe";

/**
 * Operator-only provisioning. Internal functions are unreachable from the
 * browser; they run only through `bunx convex run` (deploy key) or the
 * Convex dashboard. See README "Production setup".
 */

const ADMIN_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INSTITUTION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIPE_BATCH_SIZE = 500;

type AdminInviteResult = {
  institutionId: Id<"institutions">;
  adminEmail: string;
  invitePath: string;
  expiresAt: string;
};

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new ConvexError("adminEmail is not a valid email");
  return email;
}

function normalizeName(raw: string, field: string): string {
  const name = raw.trim();
  if (name.length < 2 || name.length > 120)
    throw new ConvexError(`${field} must be 2–120 characters`);
  return name;
}

async function issueAdminInviteFor(
  ctx: MutationCtx,
  args: { institutionId: Id<"institutions">; email: string; name: string },
): Promise<AdminInviteResult> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", args.email))
    .first();
  if (existing !== null) {
    if (existing.institutionId !== args.institutionId) {
      throw new ConvexError("that email belongs to a different institution");
    }
    if (existing.role !== "admin") {
      throw new ConvexError(`that email is a ${existing.role} account, not an admin`);
    }
    if (existing.status === "suspended") throw new ConvexError("that admin account is suspended");
  }
  const expiresAt = Date.now() + ADMIN_INVITE_TTL_MS;
  const invite = await createSingleInvite(ctx, {
    institutionId: args.institutionId,
    actorUserId: undefined,
    email: args.email,
    name: args.name,
    role: "admin",
    expiresAt,
  });
  return {
    institutionId: args.institutionId,
    adminEmail: invite.email,
    invitePath: `/invite/${invite.token}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * First-run provisioning: creates an institution and an activation link for
 * its first admin. Open `<app url><invitePath>` to enrol the admin's passkey.
 *
 *   bunx convex run setup:bootstrap '{"institutionName":"…","institutionCode":"…","adminName":"…","adminEmail":"…"}'
 */
export const bootstrap = internalMutation({
  args: {
    institutionName: v.string(),
    institutionCode: v.string(),
    adminName: v.string(),
    adminEmail: v.string(),
  },
  handler: async (ctx, args): Promise<AdminInviteResult> => {
    const name = normalizeName(args.institutionName, "institutionName");
    const code = args.institutionCode.trim().toUpperCase();
    if (!INSTITUTION_CODE_PATTERN.test(code)) {
      throw new ConvexError("institutionCode must be 2–16 letters, digits, or hyphens");
    }
    const adminName = normalizeName(args.adminName, "adminName");
    const adminEmail = normalizeEmail(args.adminEmail);

    const clash = await ctx.db
      .query("institutions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (clash !== null) {
      throw new ConvexError(
        `institution ${code} already exists — use setup:issueAdminInvite to add an admin`,
      );
    }
    const emailTaken = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", adminEmail))
      .first();
    if (emailTaken !== null) throw new ConvexError("that email already has an account");

    const institutionId = await ctx.db.insert("institutions", {
      name,
      code,
      createdAt: Date.now(),
    });
    return issueAdminInviteFor(ctx, { institutionId, email: adminEmail, name: adminName });
  },
});

/**
 * Issues a fresh admin activation link — for an expired bootstrap link, an
 * additional admin, or an admin who lost every passkey.
 *
 *   bunx convex run setup:issueAdminInvite '{"institutionCode":"…","adminName":"…","adminEmail":"…"}'
 */
export const issueAdminInvite = internalMutation({
  args: { institutionCode: v.string(), adminName: v.string(), adminEmail: v.string() },
  handler: async (ctx, args): Promise<AdminInviteResult> => {
    const code = args.institutionCode.trim().toUpperCase();
    const institution = await ctx.db
      .query("institutions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (institution === null) throw new ConvexError(`no institution with code ${code}`);
    return issueAdminInviteFor(ctx, {
      institutionId: institution._id,
      email: normalizeEmail(args.adminEmail),
      name: normalizeName(args.adminName, "adminName"),
    });
  },
});

export const wipeTableBatch = internalMutation({
  args: { table: v.string() },
  handler: async (ctx, args): Promise<number> => {
    if (!ALL_TABLES.includes(args.table as TableNames)) throw new ConvexError("unknown table");
    return deleteRows(ctx, args.table as TableNames, WIPE_BATCH_SIZE);
  },
});

/**
 * Irreversibly deletes every row in every table — used once to clear a
 * deployment that previously held demo data, before `setup:bootstrap`.
 *
 *   bunx convex run setup:wipeAllData '{"confirm":"delete-all-data"}'
 */
export const wipeAllData = internalAction({
  args: { confirm: v.literal("delete-all-data") },
  handler: async (ctx): Promise<Record<string, number>> => {
    const deleted: Record<string, number> = {};
    for (const table of ALL_TABLES) {
      let total = 0;
      for (;;) {
        const count: number = await ctx.runMutation(internal.setup.wipeTableBatch, { table });
        total += count;
        if (count < WIPE_BATCH_SIZE) break;
      }
      if (total > 0) deleted[table] = total;
    }
    return deleted;
  },
});
