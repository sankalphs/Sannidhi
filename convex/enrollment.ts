import { ConvexError, v } from "convex/values";

import type { ActorTokenClaims } from "../src/lib/auth/actor-token";
import { evaluateEnrollmentGate, type EnrollmentGateResult } from "../src/lib/enrollment/gate";
import { buildEnrollmentGateInput } from "../src/lib/enrollment/mapping";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { verifyActorToken } from "./lib/actor";

export const BIOMETRIC_CONSENT_VERSION = "biometric-consent-1";

const FACE_TEMPLATE_REF_PREFIX = "face-template/ref-";

type BiometricRecordDoc = Doc<"biometric_records">;

export type MyEnrollmentStatus = EnrollmentGateResult & {
  email: string | null;
  institutionId: string | null;
};

async function requireActor(actorToken: string): Promise<ActorTokenClaims> {
  try {
    return await verifyActorToken(actorToken);
  } catch {
    throw new ConvexError("unauthorized");
  }
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

function assertStudent(user: Doc<"users">): void {
  if (user.role !== "student") {
    throw new ConvexError("only students manage biometric enrollment");
  }
}

async function listBiometricRecords(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
): Promise<BiometricRecordDoc[]> {
  return ctx.db
    .query("biometric_records")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

async function findActiveBiometricRecord(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
): Promise<BiometricRecordDoc | null> {
  const active = (await listBiometricRecords(ctx, userId)).filter(
    (record) => record.withdrawnAt === undefined,
  );
  return active.sort((a, b) => b.consentedAt - a.consentedAt)[0] ?? null;
}

function toBiometricRecordView(record: BiometricRecordDoc) {
  return {
    _id: record._id,
    consentVersion: record.consentVersion,
    consentedAt: record.consentedAt,
    faceTemplateRef: record.faceTemplateRef ?? null,
    faceEnrolledAt: record.faceEnrolledAt ?? null,
    withdrawnAt: record.withdrawnAt ?? null,
  };
}

async function appendIdentityEvent(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    type: string;
    actorUserId?: Id<"users">;
    subjectUserId?: Id<"users">;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.runMutation(internal.ledger.appendLedgerEvent, {
    institutionId: args.institutionId,
    category: "identity",
    type: args.type,
    actorUserId: args.actorUserId,
    subjectUserId: args.subjectUserId,
    payload: args.payload ?? {},
  });
}

export const getMyEnrollmentStatus = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<MyEnrollmentStatus> => {
    const claims = await requireActor(args.actorToken);

    const user = await resolveKnownUser(ctx, claims.userId);
    if (user === null) {
      return {
        ...evaluateEnrollmentGate({
          accountStatus: undefined,
          hasUsablePasskey: false,
          deviceState: null,
          biometricConsentRecorded: false,
        }),
        reason: "dev session",
        email: null,
        institutionId: null,
      };
    }

    const [credentials, devices, biometricRecords] = await Promise.all([
      ctx.db
        .query("passkey_credentials")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("devices")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      listBiometricRecords(ctx, user._id),
    ]);

    const latestBiometric =
      [...biometricRecords].sort((a, b) => b.consentedAt - a.consentedAt)[0] ?? null;

    return {
      ...evaluateEnrollmentGate(
        buildEnrollmentGateInput({
          user,
          credentials,
          devices,
          biometric: latestBiometric
            ? { consentedAt: latestBiometric.consentedAt, withdrawnAt: latestBiometric.withdrawnAt }
            : null,
        }),
      ),
      email: user.email,
      institutionId: user.institutionId,
    };
  },
});

export const getMyBiometricRecord = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);

    const user = await resolveKnownUser(ctx, claims.userId);
    if (user === null) return null;

    const records = await listBiometricRecords(ctx, user._id);
    const latest = [...records].sort((a, b) => b.consentedAt - a.consentedAt)[0];
    return latest !== undefined ? toBiometricRecordView(latest) : null;
  },
});

export const recordBiometricConsent = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    const user = await getUserOrThrow(ctx, claims.userId);
    assertStudent(user);

    const now = Date.now();
    const consentVersion = BIOMETRIC_CONSENT_VERSION;

    let recordId: Id<"biometric_records">;
    const existing = await findActiveBiometricRecord(ctx, user._id);
    if (existing !== null) {
      await ctx.db.patch(existing._id, { consentVersion, consentedAt: now });
      recordId = existing._id;
    } else {
      recordId = await ctx.db.insert("biometric_records", {
        userId: user._id,
        consentVersion,
        consentedAt: now,
      });
    }

    await appendIdentityEvent(ctx, {
      institutionId: user.institutionId,
      type: "identity.biometric_consent_recorded",
      actorUserId: user._id,
      subjectUserId: user._id,
      payload: { recordId, consentVersion },
    });

    return { recordId, consentVersion };
  },
});

export const enrollFaceStub = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    const user = await getUserOrThrow(ctx, claims.userId);
    assertStudent(user);

    const record = await findActiveBiometricRecord(ctx, user._id);
    if (record === null) {
      throw new ConvexError("biometric consent must be recorded before face enrollment");
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const faceTemplateRef =
      FACE_TEMPLATE_REF_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const now = Date.now();
    await ctx.db.patch(record._id, { faceTemplateRef, faceEnrolledAt: now });

    await appendIdentityEvent(ctx, {
      institutionId: user.institutionId,
      type: "identity.face_template_enrolled",
      actorUserId: user._id,
      subjectUserId: user._id,
      payload: { recordId: record._id, faceTemplateRef },
    });

    return { faceTemplateRef, faceEnrolledAt: now };
  },
});

export const withdrawBiometricConsent = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    const user = await getUserOrThrow(ctx, claims.userId);
    assertStudent(user);

    const record = await findActiveBiometricRecord(ctx, user._id);
    if (record === null) {
      throw new ConvexError("no active biometric consent to withdraw");
    }

    const now = Date.now();
    await ctx.db.patch(record._id, { withdrawnAt: now });

    await appendIdentityEvent(ctx, {
      institutionId: user.institutionId,
      type: "identity.biometric_consent_withdrawn",
      actorUserId: user._id,
      subjectUserId: user._id,
      payload: { recordId: record._id },
    });

    return { ok: true as const };
  },
});
