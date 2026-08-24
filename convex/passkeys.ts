"use node";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { ConvexError, v } from "convex/values";

import type { ActorTokenClaims } from "../src/lib/auth/actor-token";
import type { Role } from "../src/lib/auth/session";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { verifyActorToken } from "./lib/actor";

const RP_NAME = "Sannidhi";

type SessionIssued = { userId: string; role: Role; sid: string; expiresAt: number };

async function requireActor(actorToken: string): Promise<ActorTokenClaims> {
  try {
    return await verifyActorToken(actorToken);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "verification failed";
    throw new ConvexError(`unauthorized: ${reason}`);
  }
}

export function resolveRelyingParty(): { rpID: string; origin: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl === undefined || appUrl.trim().length === 0) {
    throw new ConvexError(
      "NEXT_PUBLIC_APP_URL is not set: WebAuthn ceremonies need the app's public origin",
    );
  }
  try {
    const url = new URL(appUrl);
    return { rpID: url.hostname, origin: url.origin };
  } catch {
    throw new ConvexError(`NEXT_PUBLIC_APP_URL is not a valid URL: ${appUrl}`);
  }
}

type CeremonyResponse = RegistrationResponseJSON | AuthenticationResponseJSON;

export function parseCeremonyResponse(value: unknown): CeremonyResponse {
  if (typeof value !== "object" || value === null) {
    throw new ConvexError("malformed ceremony response");
  }
  const candidate = value as Partial<CeremonyResponse>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.rawId !== "string" ||
    typeof candidate.type !== "string" ||
    typeof candidate.response?.clientDataJSON !== "string"
  ) {
    throw new ConvexError("malformed ceremony response");
  }
  return value as CeremonyResponse;
}

export function extractChallenge(response: CeremonyResponse): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8"),
    );
  } catch {
    throw new ConvexError("unreadable clientDataJSON");
  }
  const challenge = (parsed as { challenge?: unknown } | null)?.challenge;
  if (typeof challenge !== "string" || challenge.length === 0) {
    throw new ConvexError("clientDataJSON missing challenge");
  }
  return challenge;
}

function transportsOf(transports: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(transports)) return [];
  return transports.filter(
    (transport): transport is AuthenticatorTransportFuture => typeof transport === "string",
  );
}

async function verifyRegistrationOrThrow(args: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
}) {
  try {
    return await verifyRegistrationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: args.expectedOrigin,
      expectedRPID: args.expectedRPID,
      requireUserVerification: true,
    });
  } catch (error) {
    throw new ConvexError(
      `registration verification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

async function verifyAuthenticationOrThrow(args: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: { id: string; publicKey: Uint8Array; counter: number };
}) {
  try {
    return await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: args.expectedOrigin,
      expectedRPID: args.expectedRPID,
      credential: {
        id: args.credential.id,
        publicKey: new Uint8Array(args.credential.publicKey),
        counter: args.credential.counter,
      },
      requireUserVerification: true,
    });
  } catch (error) {
    throw new ConvexError(
      `authentication verification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

export const registerOptions = action({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<PublicKeyCredentialCreationOptionsJSON> => {
    const claims = await requireActor(args.actorToken);
    const { rpID } = resolveRelyingParty();

    const user = await ctx.runQuery(internal.passkeysInternal.getUserCore, {
      userId: claims.userId as Id<"users">,
    });
    if (user === null) throw new ConvexError("user not found");
    if (user.status === "suspended") throw new ConvexError("account suspended");

    const credentials = await ctx.runQuery(internal.passkeysInternal.listActiveCredentials, {
      userId: user._id,
    });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user._id),
      attestationType: "none",
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        ...(credential.transports !== undefined
          ? { transports: transportsOf(credential.transports) }
          : {}),
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    await ctx.runMutation(internal.passkeysInternal.storeChallenge, {
      challenge: options.challenge,
      purpose: "registration",
      userId: user._id,
    });

    return options;
  },
});

export const registerVerify = action({
  args: { actorToken: v.string(), response: v.any() },
  handler: async (ctx, args): Promise<SessionIssued> => {
    const claims = await requireActor(args.actorToken);
    const { rpID, origin } = resolveRelyingParty();

    const response = parseCeremonyResponse(args.response) as RegistrationResponseJSON;
    const challenge = extractChallenge(response);

    const challengeRow = await ctx.runQuery(internal.passkeysInternal.getChallengeRow, {
      challenge,
    });
    if (challengeRow === null || challengeRow.purpose !== "registration") {
      throw new ConvexError("challenge not found");
    }
    if (challengeRow.userId !== claims.userId) {
      throw new ConvexError("challenge bound to a different account");
    }

    const verification = await verifyRegistrationOrThrow({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!verification.verified || verification.registrationInfo === undefined) {
      throw new ConvexError("registration verification failed");
    }

    const { credential, aaguid } = verification.registrationInfo;

    const result = await ctx.runMutation(internal.passkeysInternal.completeRegistration, {
      challenge,
      userId: claims.userId as Id<"users">,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: transportsOf(response.response.transports),
      aaguid,
    });

    return {
      userId: claims.userId,
      role: result.role,
      sid: result.sid,
      expiresAt: result.expiresAt,
    };
  },
});

export const authenticateOptions = action({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args): Promise<PublicKeyCredentialRequestOptionsJSON> => {
    const { rpID } = resolveRelyingParty();

    let user: Awaited<
      ReturnType<typeof ctx.runQuery<typeof internal.passkeysInternal.getUserCore>>
    > | null = null;
    if (args.email !== undefined && args.email.trim().length > 0) {
      user = await ctx.runQuery(internal.passkeysInternal.getUserByEmail, { email: args.email });
      if (user === null || user.status === "suspended") {
        throw new ConvexError("no passkey available for this account");
      }
    }

    const credentials =
      user !== null
        ? await ctx.runQuery(internal.passkeysInternal.listActiveCredentials, { userId: user._id })
        : [];
    if (user !== null && credentials.length === 0) {
      throw new ConvexError("no passkey available for this account");
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        ...(credential.transports !== undefined
          ? { transports: transportsOf(credential.transports) }
          : {}),
      })),
      userVerification: "required",
    });

    await ctx.runMutation(internal.passkeysInternal.storeChallenge, {
      challenge: options.challenge,
      purpose: "authentication",
      ...(user !== null ? { userId: user._id } : {}),
    });

    return options;
  },
});

export const authenticateVerify = action({
  args: { response: v.any() },
  handler: async (ctx, args): Promise<SessionIssued> => {
    const { rpID, origin } = resolveRelyingParty();

    const response = parseCeremonyResponse(args.response) as AuthenticationResponseJSON;
    const challenge = extractChallenge(response);

    const challengeRow = await ctx.runQuery(internal.passkeysInternal.getChallengeRow, {
      challenge,
    });
    if (challengeRow === null || challengeRow.purpose !== "authentication") {
      throw new ConvexError("challenge not found");
    }

    const record = await ctx.runQuery(internal.passkeysInternal.getCredentialForAuth, {
      credentialId: response.id,
    });
    if (record === null || record.revokedAt !== undefined) {
      throw new ConvexError("credential not recognized");
    }
    if (challengeRow.userId !== undefined && challengeRow.userId !== record.userId) {
      throw new ConvexError("challenge bound to a different account");
    }

    const user = await ctx.runQuery(internal.passkeysInternal.getUserCore, {
      userId: record.userId,
    });
    if (user === null) throw new ConvexError("user not found");
    if (user.status === "suspended") throw new ConvexError("account suspended");

    const verification = await verifyAuthenticationOrThrow({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: record.credentialId,
        publicKey: Buffer.from(record.publicKey, "base64url"),
        counter: record.counter,
      },
    });
    if (!verification.verified) {
      throw new ConvexError("authentication verification failed");
    }

    const result = await ctx.runMutation(internal.passkeysInternal.completeAuthentication, {
      challenge,
      credentialRecordId: record._id,
      newCounter: verification.authenticationInfo.newCounter,
    });

    return {
      userId: user._id,
      role: result.role,
      sid: result.sid,
      expiresAt: result.expiresAt,
    };
  },
});
