import { ConvexError, v } from "convex/values";

import type { ActorTokenClaims } from "../src/lib/auth/actor-token";
import { createFaceTemplateRef, validateFaceEmbedding } from "../src/lib/enrollment/face-template";
import { evaluateEnrollmentGate, type EnrollmentGateResult } from "../src/lib/enrollment/gate";
import { buildEnrollmentGateInput } from "../src/lib/enrollment/mapping";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { FACE_EMBEDDING_VERSION } from "../src/lib/biometry";
import { requireActorUserWithActiveSession, resolveActorUser } from "./lib/actor";

export const BIOMETRIC_CONSENT_VERSION = "biometric-consent-1";

type BiometricRecordDoc = Doc<"biometric_records">;

export type MyEnrollmentStatus = EnrollmentGateResult & {
  email: string | null;
  institutionId: string | null;
};

/**
 * Claims for a live, stored user: token verified, session checked when the
 * token carries one, and the role read from the user row — suspension and
 * revocation take effect immediately on every biometric mutation.
 */
async function requireActor(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<ActorTokenClaims & { user: Doc<"users"> }> {
  const user = await requireActorUserWithActiveSession(ctx, actorToken);
  return { userId: user._id, role: user.role, user };
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
    embeddingVersion: record.embeddingVersion ?? null,
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
    // Read-only status surface: tolerant of sid-less dev sessions on purpose.
    const user = await resolveActorUser(ctx, args.actorToken);
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
    const user = await resolveActorUser(ctx, args.actorToken);
    if (user === null) return null;

    const records = await listBiometricRecords(ctx, user._id);
    const latest = [...records].sort((a, b) => b.consentedAt - a.consentedAt)[0];
    return latest !== undefined ? toBiometricRecordView(latest) : null;
  },
});

export const recordBiometricConsent = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireActor(ctx, args.actorToken);
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

export const enrollFaceTemplate = mutation({
  args: { actorToken: v.string(), embedding: v.array(v.number()) },
  handler: async (ctx, args) => {
    const { user } = await requireActor(ctx, args.actorToken);
    if (user.role !== "student") {
      throw new ConvexError("unauthorized");
    }

    const record = await findActiveBiometricRecord(ctx, user._id);
    if (record === null) {
      throw new ConvexError("no_active_biometric_consent");
    }

    const invalidReason = validateFaceEmbedding(args.embedding);
    if (invalidReason !== null) throw new ConvexError(invalidReason);

    const faceTemplateRef = createFaceTemplateRef();
    const faceEnrolledAt = Date.now();
    // The raw embedding is stored on the record for later matching; the ledger
    // only ever sees its dimensions and version.
    await ctx.db.patch(record._id, {
      faceEmbedding: args.embedding,
      embeddingVersion: FACE_EMBEDDING_VERSION,
      faceTemplateRef,
      faceEnrolledAt,
    });

    await appendIdentityEvent(ctx, {
      institutionId: user.institutionId,
      type: "identity.face_template_enrolled",
      actorUserId: user._id,
      subjectUserId: user._id,
      payload: {
        recordId: record._id,
        faceTemplateRef,
        embeddingVersion: FACE_EMBEDDING_VERSION,
        dims: args.embedding.length,
      },
    });

    return { faceTemplateRef, faceEnrolledAt };
  },
});

export const withdrawBiometricConsent = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireActor(ctx, args.actorToken);
    assertStudent(user);

    const record = await findActiveBiometricRecord(ctx, user._id);
    if (record === null) {
      throw new ConvexError("no active biometric consent to withdraw");
    }

    const now = Date.now();
    // Passing undefined removes the optional fields, so the raw face template
    // never outlives the consent it was enrolled under.
    await ctx.db.patch(record._id, {
      withdrawnAt: now,
      faceEmbedding: undefined,
      embeddingVersion: undefined,
    });

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
