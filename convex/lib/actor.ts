import { jwtVerify } from "jose";

import {
  ACTOR_TOKEN_ALGORITHM,
  ACTOR_TOKEN_MAX_AGE_SECONDS,
  type ActorTokenClaims,
} from "../../src/lib/auth/actor-token";
import { ROLES, type Role } from "../../src/lib/auth/session";

function getActorSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret === undefined) {
    throw new Error("SESSION_SECRET must be set");
  }
  const encoded = new TextEncoder().encode(secret);
  if (encoded.byteLength < 16) {
    throw new Error("SESSION_SECRET must be at least 16 bytes");
  }
  return new Uint8Array(encoded);
}

export async function verifyActorToken(token: string): Promise<ActorTokenClaims> {
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, getActorSecret(), {
      algorithms: [ACTOR_TOKEN_ALGORITHM],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "verification failed";
    throw new Error(`Invalid actor token: ${reason}`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== "number") {
    throw new Error("Invalid actor token: missing issued-at claim");
  }
  if (now - payload.iat > ACTOR_TOKEN_MAX_AGE_SECONDS) {
    throw new Error(`Invalid actor token: issued more than ${ACTOR_TOKEN_MAX_AGE_SECONDS}s ago`);
  }

  const { userId, role, sid } = payload;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Invalid actor token: missing userId claim");
  }
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    throw new Error("Invalid actor token: missing or unknown role claim");
  }

  const claims: ActorTokenClaims = { userId, role: role as Role };
  if (typeof sid === "string" && sid.length > 0) {
    claims.sid = sid;
  }
  return claims;
}
