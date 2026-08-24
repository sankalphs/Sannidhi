import { ConvexError, v } from "convex/values";

import type { ActorTokenClaims } from "../src/lib/auth/actor-token";
import { checkReplacementEligibility, REPLACEMENT_DECISIONS } from "../src/lib/devices/replacement";
import { assertTransition } from "../src/lib/devices/lifecycle";
import {
  checkPossessionUsable,
  generatePossessionCode,
  hashPossessionCode,
  POSSESSION_CODE_TTL_MS,
} from "../src/lib/devices/verification";
import { buildDeviceTrustEvidence } from "../src/lib/trust-evidence";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { assertSameInstitution, requireAdminUser, verifyActorToken } from "./lib/actor";

const MAX_LABEL_LENGTH = 80;
const MAX_LISTED_DEVICES = 200;

type DeviceDoc = Doc<"devices">;
type ReplacementRequestDoc = Doc<"replacement_requests">;

async function requireActor(actorToken: string): Promise<ActorTokenClaims> {
  try {
    return await verifyActorToken(actorToken);
  } catch {
    throw new ConvexError("unauthorized");
  }
}

async function requireAdminActor(actorToken: string): Promise<ActorTokenClaims> {
  const claims = await requireActor(actorToken);
  if (claims.role !== "admin") throw new ConvexError("unauthorized");
  return claims;
}

async function requireAdminInstitution(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<Id<"institutions">> {
  const admin = await requireAdminUser(ctx, actorToken);
  return admin.institutionId;
}

async function resolveActorUserId(
  ctx: MutationCtx,
  claims: ActorTokenClaims,
): Promise<Id<"users"> | undefined> {
  try {
    const user = await ctx.db.get(claims.userId as Id<"users">);
    return user !== null ? (claims.userId as Id<"users">) : undefined;
  } catch {
    return undefined;
  }
}

async function appendDeviceEvent(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    type: string;
    actorUserId?: Id<"users">;
    subjectUserId?: Id<"users">;
    deviceId?: Id<"devices">;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.runMutation(internal.ledger.appendLedgerEvent, {
    institutionId: args.institutionId,
    category: "device",
    type: args.type,
    actorUserId: args.actorUserId,
    subjectUserId: args.subjectUserId,
    deviceId: args.deviceId,
    payload: args.payload ?? {},
  });
}

async function getUserOrThrow(ctx: MutationCtx, userId: string): Promise<Doc<"users">> {
  let user: Doc<"users"> | null;
  try {
    user = await ctx.db.get(userId as Id<"users">);
  } catch {
    throw new ConvexError("actor identity must be a real institution account");
  }
  if (user === null) throw new ConvexError("user not found");
  return user;
}

async function resolveKnownUser(
  ctx: MutationCtx | QueryCtx,
  userId: string,
): Promise<Doc<"users"> | null> {
  try {
    return await ctx.db.get(userId as Id<"users">);
  } catch {
    return null;
  }
}

async function getDeviceOrThrow(ctx: MutationCtx, deviceId: string): Promise<DeviceDoc> {
  const device = await ctx.db.get(deviceId as Id<"devices">);
  if (device === null) throw new ConvexError("device not found");
  return device;
}

function assertOwnerOrAdmin(claims: ActorTokenClaims, device: DeviceDoc): void {
  if (claims.role === "admin") return;
  if (claims.userId !== device.userId) throw new ConvexError("unauthorized");
}

async function findLatestVerification(
  ctx: MutationCtx,
  deviceId: Id<"devices">,
): Promise<Doc<"device_verifications"> | null> {
  const rows = await ctx.db
    .query("device_verifications")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .collect();
  return rows.sort((a, b) => b.expiresAt - a.expiresAt)[0] ?? null;
}

async function findActiveDevice(
  ctx: MutationCtx,
  userId: Id<"users">,
  excludeDeviceId?: Id<"devices">,
): Promise<DeviceDoc | null> {
  const devices = await ctx.db
    .query("devices")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return (
    devices.find((device) => device.state === "active" && device._id !== excludeDeviceId) ?? null
  );
}

async function findPendingRequestForDevice(
  ctx: MutationCtx,
  studentId: Id<"users">,
  oldDeviceId: Id<"devices">,
): Promise<ReplacementRequestDoc | null> {
  const requests = await ctx.db
    .query("replacement_requests")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
  return (
    requests.find(
      (request) => request.oldDeviceId === oldDeviceId && request.status === "pending",
    ) ?? null
  );
}

export const registerDevice = mutation({
  args: { actorToken: v.string(), label: v.string(), platform: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    if (claims.role !== "student") throw new ConvexError("only students register devices");

    const user = await getUserOrThrow(ctx, claims.userId);
    if (user.status === "suspended") throw new ConvexError("account suspended");

    const label = args.label.trim().slice(0, MAX_LABEL_LENGTH);
    if (label.length === 0) throw new ConvexError("label required");

    const now = Date.now();
    const deviceId = await ctx.db.insert("devices", {
      institutionId: user.institutionId,
      userId: user._id,
      label,
      ...(args.platform !== undefined && args.platform.length > 0
        ? { platform: args.platform.slice(0, 120) }
        : {}),
      state: "new",
      registeredAt: now,
      stateChangedAt: now,
    });

    const code = generatePossessionCode();
    await ctx.db.insert("device_verifications", {
      deviceId,
      codeHash: await hashPossessionCode(code),
      expiresAt: now + POSSESSION_CODE_TTL_MS,
      attempts: 0,
    });

    await appendDeviceEvent(ctx, {
      institutionId: user.institutionId,
      type: "device.registered",
      actorUserId: user._id,
      subjectUserId: user._id,
      deviceId,
      payload: { label },
    });

    return { deviceId, code, expiresAt: now + POSSESSION_CODE_TTL_MS };
  },
});

export const verifyPossession = mutation({
  args: { actorToken: v.string(), deviceId: v.id("devices"), code: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    const device = await getDeviceOrThrow(ctx, args.deviceId);
    assertOwnerOrAdmin(claims, device);

    const verification = await findLatestVerification(ctx, device._id);
    if (verification === null) throw new ConvexError("no verification pending for this device");

    const now = Date.now();
    const usable = checkPossessionUsable(verification, now);
    if (usable !== "ok") throw new ConvexError(`verification ${usable}`);

    const codeHash = await hashPossessionCode(args.code.trim());
    if (codeHash !== verification.codeHash) {
      await ctx.db.patch(verification._id, { attempts: verification.attempts + 1 });
      throw new ConvexError("incorrect code");
    }

    await ctx.db.patch(verification._id, { consumedAt: now });
    assertTransition(device.state, "enrolled");
    await ctx.db.patch(device._id, { state: "enrolled", stateChangedAt: now });

    await appendDeviceEvent(ctx, {
      institutionId: device.institutionId,
      type: "device.enrolled",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: device.userId,
      deviceId: device._id,
    });

    return { ok: true as const };
  },
});

export const verifySuccessorDevice = mutation({
  args: { actorToken: v.string(), deviceId: v.id("devices"), identityReverified: v.boolean() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    if (!args.identityReverified) throw new ConvexError("identity re-verification required");

    const device = await getDeviceOrThrow(ctx, args.deviceId);
    if (claims.userId !== device.userId) throw new ConvexError("unauthorized");
    if (device.replacesDeviceId === undefined) {
      throw new ConvexError("device is not a replacement successor");
    }

    const approvedRequest = (
      await ctx.db
        .query("replacement_requests")
        .withIndex("by_student", (q) => q.eq("studentId", device.userId))
        .collect()
    ).find((request) => request.status === "approved" && request.successorDeviceId === device._id);
    if (approvedRequest === undefined) {
      throw new ConvexError("no approved replacement found for this device");
    }

    assertTransition(device.state, "enrolled");

    const now = Date.now();
    await ctx.db.patch(device._id, { state: "enrolled", stateChangedAt: now });

    await appendDeviceEvent(ctx, {
      institutionId: device.institutionId,
      type: "device.enrolled",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: device.userId,
      deviceId: device._id,
      payload: { via: "replacement-approval", requestId: approvedRequest._id },
    });

    return { ok: true as const };
  },
});

export const activateDevice = mutation({
  args: { actorToken: v.string(), deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    const device = await getDeviceOrThrow(ctx, args.deviceId);
    if (claims.role === "admin") {
      assertSameInstitution(await requireAdminInstitution(ctx, args.actorToken), device.institutionId);
    } else {
      assertOwnerOrAdmin(claims, device);
    }

    if (device.state === "suspended" && claims.role !== "admin") {
      throw new ConvexError("suspended devices can only be reinstated by an administrator");
    }

    assertTransition(device.state, "active");

    if (device.replacesDeviceId === undefined) {
      const active = await findActiveDevice(ctx, device.userId, device._id);
      if (active !== null) {
        throw new ConvexError(
          "another active device already exists; request a replacement to switch devices",
        );
      }
    }

    const now = Date.now();
    await ctx.db.patch(device._id, {
      state: "active",
      activatedAt: now,
      stateChangedAt: now,
    });

    if (device.replacesDeviceId !== undefined) {
      const oldDevice = await ctx.db.get(device.replacesDeviceId);
      if (oldDevice !== null && oldDevice.state !== "replaced") {
        assertTransition(oldDevice.state, "replaced", { replacesDeviceId: true });
        await ctx.db.patch(oldDevice._id, {
          state: "replaced",
          replacedByDeviceId: device._id,
          stateChangedAt: now,
        });
        await appendDeviceEvent(ctx, {
          institutionId: oldDevice.institutionId,
          type: "device.replaced",
          actorUserId: await resolveActorUserId(ctx, claims),
          subjectUserId: oldDevice.userId,
          deviceId: oldDevice._id,
          payload: { replacedByDeviceId: device._id },
        });
      }
    }

    await appendDeviceEvent(ctx, {
      institutionId: device.institutionId,
      type: "device.activated",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: device.userId,
      deviceId: device._id,
      ...(device.replacesDeviceId !== undefined
        ? { payload: { replacesDeviceId: device.replacesDeviceId } }
        : {}),
    });

    return { ok: true as const };
  },
});

export const suspendDevice = mutation({
  args: { actorToken: v.string(), deviceId: v.id("devices"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const claims = await requireAdminActor(args.actorToken);
    const device = await getDeviceOrThrow(ctx, args.deviceId);
    assertSameInstitution(
      await requireAdminInstitution(ctx, args.actorToken),
      device.institutionId,
    );
    assertTransition(device.state, "suspended");

    const now = Date.now();
    await ctx.db.patch(device._id, {
      state: "suspended",
      stateChangedAt: now,
      ...(args.reason !== undefined ? { stateReason: args.reason } : {}),
    });

    await appendDeviceEvent(ctx, {
      institutionId: device.institutionId,
      type: "device.suspended",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: device.userId,
      deviceId: device._id,
      ...(args.reason !== undefined ? { payload: { reason: args.reason } } : {}),
    });

    return { ok: true as const };
  },
});

export const revokeDevice = mutation({
  args: { actorToken: v.string(), deviceId: v.id("devices"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const claims = await requireAdminActor(args.actorToken);
    const device = await getDeviceOrThrow(ctx, args.deviceId);
    assertSameInstitution(
      await requireAdminInstitution(ctx, args.actorToken),
      device.institutionId,
    );
    assertTransition(device.state, "revoked");

    const now = Date.now();
    await ctx.db.patch(device._id, {
      state: "revoked",
      stateChangedAt: now,
      ...(args.reason !== undefined ? { stateReason: args.reason } : {}),
    });

    await appendDeviceEvent(ctx, {
      institutionId: device.institutionId,
      type: "device.revoked",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: device.userId,
      deviceId: device._id,
      ...(args.reason !== undefined ? { payload: { reason: args.reason } } : {}),
    });

    return { ok: true as const };
  },
});

export const adminActivateDevice = mutation({
  args: { actorToken: v.string(), deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const claims = await requireAdminActor(args.actorToken);
    const device = await getDeviceOrThrow(ctx, args.deviceId);
    assertSameInstitution(
      await requireAdminInstitution(ctx, args.actorToken),
      device.institutionId,
    );
    assertTransition(device.state, "active");

    if (device.replacesDeviceId === undefined) {
      const active = await findActiveDevice(ctx, device.userId, device._id);
      if (active !== null) {
        throw new ConvexError(
          "another active device already exists; use the replacement flow to switch devices",
        );
      }
    }

    const now = Date.now();
    await ctx.db.patch(device._id, {
      state: "active",
      activatedAt: device.activatedAt ?? now,
      stateChangedAt: now,
    });

    await appendDeviceEvent(ctx, {
      institutionId: device.institutionId,
      type: "device.activated",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: device.userId,
      deviceId: device._id,
      payload: { by: "admin" },
    });

    return { ok: true as const };
  },
});

export const requestReplacement = mutation({
  args: {
    actorToken: v.string(),
    oldDeviceId: v.id("devices"),
    reason: v.string(),
    identityReverified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    if (!args.identityReverified) throw new ConvexError("identity re-verification required");

    const device = await getDeviceOrThrow(ctx, args.oldDeviceId);
    if (claims.role !== "admin" && claims.userId !== device.userId) {
      throw new ConvexError("unauthorized");
    }

    const pending = await findPendingRequestForDevice(ctx, device.userId, device._id);

    const eligibility = checkReplacementEligibility({
      deviceState: device.state,
      freshAuth: args.identityReverified,
      hasPendingReplacementForDevice: pending !== null,
      reasonLength: args.reason.trim().length,
    });
    if (eligibility !== "ok") throw new ConvexError(`replacement request rejected: ${eligibility}`);

    const now = Date.now();
    const requestId = await ctx.db.insert("replacement_requests", {
      institutionId: device.institutionId,
      studentId: device.userId,
      oldDeviceId: device._id,
      reason: args.reason.trim(),
      status: "pending",
      requestedAt: now,
    });

    await appendDeviceEvent(ctx, {
      institutionId: device.institutionId,
      type: "device.replacement_requested",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: device.userId,
      deviceId: device._id,
      payload: { requestId },
    });

    return { requestId };
  },
});

export const decideReplacement = mutation({
  args: {
    actorToken: v.string(),
    requestId: v.id("replacement_requests"),
    decision: v.union(...REPLACEMENT_DECISIONS.map((decision) => v.literal(decision))),
  },
  handler: async (ctx, args) => {
    const claims = await requireAdminActor(args.actorToken);
    const request = await ctx.db.get(args.requestId);
    if (request === null) throw new ConvexError("replacement request not found");
    if (request.status !== "pending") throw new ConvexError("request already decided");
    assertSameInstitution(
      await requireAdminInstitution(ctx, args.actorToken),
      request.institutionId,
    );

    const now = Date.now();

    if (args.decision === "reject") {
      await ctx.db.patch(request._id, {
        status: "rejected",
        decidedByUserId: await resolveActorUserId(ctx, claims),
        decidedAt: now,
      });
      await appendDeviceEvent(ctx, {
        institutionId: request.institutionId,
        type: "device.replacement_rejected",
        actorUserId: await resolveActorUserId(ctx, claims),
        subjectUserId: request.studentId,
        deviceId: request.oldDeviceId,
        payload: { requestId: request._id },
      });
      return { ok: true as const };
    }

    const oldDevice = await ctx.db.get(request.oldDeviceId);
    if (oldDevice === null || oldDevice.state !== "active") {
      throw new ConvexError("old device is no longer active; nothing to replace");
    }

    const successorDeviceId = await ctx.db.insert("devices", {
      institutionId: request.institutionId,
      userId: request.studentId,
      label: "Replacement device",
      state: "new",
      replacesDeviceId: oldDevice._id,
      registeredAt: now,
      stateChangedAt: now,
      stateReason: "replacement-approved",
    });

    await ctx.db.patch(request._id, {
      status: "approved",
      decidedByUserId: await resolveActorUserId(ctx, claims),
      decidedAt: now,
      successorDeviceId,
    });

    await appendDeviceEvent(ctx, {
      institutionId: request.institutionId,
      type: "device.replacement_approved",
      actorUserId: await resolveActorUserId(ctx, claims),
      subjectUserId: request.studentId,
      deviceId: request.oldDeviceId,
      payload: { requestId: request._id, successorDeviceId },
    });

    return { ok: true as const, successorDeviceId };
  },
});

function evidenceOf(device: DeviceDoc) {
  return buildDeviceTrustEvidence({
    _id: device._id,
    state: device.state,
    activatedAt: device.activatedAt,
    stateChangedAt: device.stateChangedAt,
    replacedByDeviceId: device.replacedByDeviceId,
  });
}

export const listMyDevices = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    if ((await resolveKnownUser(ctx, claims.userId)) === null) return [];
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", claims.userId as Id<"users">))
      .collect();
    return devices
      .sort((a, b) => b.registeredAt - a.registeredAt)
      .slice(0, MAX_LISTED_DEVICES)
      .map((device) => ({
        _id: device._id,
        label: device.label,
        platform: device.platform ?? null,
        state: device.state,
        stateReason: device.stateReason ?? null,
        registeredAt: device.registeredAt,
        activatedAt: device.activatedAt ?? null,
        replacesDeviceId: device.replacesDeviceId ?? null,
        evidence: evidenceOf(device),
      }));
  },
});

export const listMyReplacementRequests = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    const requests = await ctx.db
      .query("replacement_requests")
      .withIndex("by_student", (q) => q.eq("studentId", claims.userId as Id<"users">))
      .collect();
    return requests
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .slice(0, MAX_LISTED_DEVICES)
      .map((request) => ({
        _id: request._id,
        oldDeviceId: request.oldDeviceId,
        reason: request.reason,
        status: request.status,
        requestedAt: request.requestedAt,
        decidedAt: request.decidedAt ?? null,
        successorDeviceId: request.successorDeviceId ?? null,
      }));
  },
});

export const listDevices = query({
  args: {
    actorToken: v.string(),
    state: v.optional(
      v.union(
        v.literal("new"),
        v.literal("enrolled"),
        v.literal("active"),
        v.literal("suspended"),
        v.literal("revoked"),
        v.literal("replaced"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const institutionId = await requireAdminInstitution(ctx, args.actorToken);

    const states = (
      args.state !== undefined
        ? [args.state]
        : ["new", "enrolled", "active", "suspended", "revoked", "replaced"]
    ) as Doc<"devices">["state"][];

    const devices: DeviceDoc[] = [];
    for (const state of states) {
      const page = await ctx.db
        .query("devices")
        .withIndex("by_institution_state_registered", (q) =>
          q.eq("institutionId", institutionId).eq("state", state),
        )
        .order("desc")
        .take(MAX_LISTED_DEVICES);
      devices.push(...page);
    }

    const rows = [];
    for (const device of devices
      .sort((a, b) => b.registeredAt - a.registeredAt)
      .slice(0, MAX_LISTED_DEVICES)) {
      const owner = await ctx.db.get(device.userId);
      rows.push({
        _id: device._id,
        label: device.label,
        platform: device.platform ?? null,
        state: device.state,
        stateReason: device.stateReason ?? null,
        registeredAt: device.registeredAt,
        activatedAt: device.activatedAt ?? null,
        userId: device.userId,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.name ?? null,
      });
    }
    return rows;
  },
});

export const listAllReplacementRequests = query({
  args: {
    actorToken: v.string(),
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
  },
  handler: async (ctx, args) => {
    const institutionId = await requireAdminInstitution(ctx, args.actorToken);

    const statuses =
      args.status !== undefined ? [args.status] : (["pending", "approved", "rejected"] as const);
    const requests: ReplacementRequestDoc[] = [];
    for (const status of statuses) {
      const page = await ctx.db
        .query("replacement_requests")
        .withIndex("by_institution_status_requested", (q) =>
          q.eq("institutionId", institutionId).eq("status", status),
        )
        .order("desc")
        .take(MAX_LISTED_DEVICES);
      requests.push(...page);
    }

    const rows = [];
    for (const request of requests
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .slice(0, MAX_LISTED_DEVICES)) {
      const [student, oldDevice] = await Promise.all([
        ctx.db.get(request.studentId),
        ctx.db.get(request.oldDeviceId),
      ]);
      rows.push({
        _id: request._id,
        status: request.status,
        reason: request.reason,
        requestedAt: request.requestedAt,
        decidedAt: request.decidedAt ?? null,
        studentEmail: student?.email ?? null,
        studentName: student?.name ?? null,
        oldDeviceLabel: oldDevice?.label ?? null,
        oldDeviceState: oldDevice?.state ?? null,
        successorDeviceId: request.successorDeviceId ?? null,
      });
    }
    return rows;
  },
});

export const getMyDeviceTrustEvidence = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    if ((await resolveKnownUser(ctx, claims.userId)) === null) return [];
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", claims.userId as Id<"users">))
      .collect();
    return devices.map((device) => evidenceOf(device));
  },
});
