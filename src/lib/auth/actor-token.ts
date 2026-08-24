import { SignJWT } from "jose";

import type { Role } from "./session";

export const ACTOR_TOKEN_ALGORITHM = "HS256";

export const ACTOR_TOKEN_MAX_AGE_SECONDS = 10 * 60;

export const ACTOR_TOKEN_MAX_AGE_MS = ACTOR_TOKEN_MAX_AGE_SECONDS * 1000;

export type ActorTokenClaims = {
  userId: string;
  role: Role;
  sid?: string;
};

function getSecret(): Uint8Array {
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

export const getActorSecret = getSecret;

export async function mintActorToken(
  payload: ActorTokenClaims,
  options?: { expiresIn?: number | string },
): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    role: payload.role,
    ...(payload.sid !== undefined ? { sid: payload.sid } : {}),
  })
    .setProtectedHeader({ alg: ACTOR_TOKEN_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn ?? `${ACTOR_TOKEN_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}
