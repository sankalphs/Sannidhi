"use node";

import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { ConvexError, v } from "convex/values";

import type { ActorTokenClaims } from "../src/lib/auth/actor-token";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { verifyActorToken } from "./lib/actor";
import { extractChallenge, parseCeremonyResponse, resolveRelyingParty } from "./passkeys";

async function requireActor(actorToken: string): Promise<ActorTokenClaims> {
  try {
    return await verifyActorToken(actorToken);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "verification failed";
    throw new ConvexError(`unauthorized: ${reason}`);
  }
}

export const stepUpOptions = action({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await requireActor(args.actorToken);
    const { rpID } = resolveRelyingParty();

    const user = await ctx.runQuery(internal.passkeysInternal.getUserCore, {
      userId: claims.userId as Id<"users">,
    });
    if (user === null || user.status === "suspended") {
      throw new ConvexError("account unavailable");
    }

    const credentials = await ctx.runQuery(internal.passkeysInternal.listActiveCredentials, {
      userId: user._id,
    });
    if (credentials.length === 0) throw new ConvexError("no passkey available for this account");

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((credential) => ({ id: credential.credentialId })),
      userVerification: "required",
    });

    await ctx.runMutation(internal.passkeysInternal.storeChallenge, {
      challenge: options.challenge,
      purpose: "authentication",
      userId: user._id,
    });

    return options;
  },
});

export const stepUpVerify = action({
  args: { actorToken: v.string(), response: v.any() },
  handler: async (ctx, args): Promise<{ verifiedAt: number }> => {
    const claims = await requireActor(args.actorToken);
    if (claims.sid === undefined) throw new ConvexError("step-up requires a session-bound login");

    const { rpID, origin } = resolveRelyingParty();

    const response = parseCeremonyResponse(args.response) as AuthenticationResponseJSON;
    const challenge = extractChallenge(response);

    const challengeRow = await ctx.runQuery(internal.passkeysInternal.getChallengeRow, {
      challenge,
    });
    if (
      challengeRow === null ||
      challengeRow.purpose !== "authentication" ||
      challengeRow.userId !== claims.userId
    ) {
      throw new ConvexError("challenge not bound to this account");
    }

    const record = await ctx.runQuery(internal.passkeysInternal.getCredentialForAuth, {
      credentialId: response.id,
    });
    if (record === null || record.revokedAt !== undefined || record.userId !== claims.userId) {
      throw new ConvexError("credential not recognized for this account");
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: record.credentialId,
          publicKey: new Uint8Array(Buffer.from(record.publicKey, "base64url")),
          counter: record.counter,
        },
        requireUserVerification: true,
      });
    } catch (error) {
      throw new ConvexError(
        `authentication verification failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    if (!verification.verified) throw new ConvexError("authentication verification failed");

    const verifiedAt = Date.now();
    await ctx.runMutation(internal.passkeysInternal.consumeChallenge, {
      challenge,
    });
    await ctx.runMutation(internal.sessions.touchBySid, { sid: claims.sid });
    await ctx.runMutation(internal.passkeysInternal.updateCredentialCounter, {
      credentialRecordId: record._id,
      newCounter: verification.authenticationInfo.newCounter,
      lastUsedAt: verifiedAt,
    });

    return { verifiedAt };
  },
});
