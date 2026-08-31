import { SignJWT } from "jose";

import type { Role } from "./session";

export const ACTOR_TOKEN_ALGORITHM = "HS256";

/**
 * Sid-less tokens (demo/dev logins, enrollment ceremony helpers) carry no
 * server-side session, so their lifetime is bounded here.
 */
export const ACTOR_TOKEN_MAX_AGE_SECONDS = 10 * 60;

export const ACTOR_TOKEN_MAX_AGE_MS = ACTOR_TOKEN_MAX_AGE_SECONDS * 1000;

/**
 * Sid-carrying tokens are validated against the server session on every
 * Convex call (revocation, expiry, suspension), so they can live as long as
 * the session cookie: a live board must not silently die 10 minutes into an
 * hour-long class.
 */
export const SESSION_ACTOR_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60;

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
  // Sid-carrying tokens live for the session actor window: server-side
  // revocation checks (not the JWT exp) are what actually bound them.
  const defaultExpiry =
    payload.sid !== undefined
      ? `${SESSION_ACTOR_TOKEN_MAX_AGE_SECONDS}s`
      : `${ACTOR_TOKEN_MAX_AGE_SECONDS}s`;
  return new SignJWT({
    userId: payload.userId,
    role: payload.role,
    ...(payload.sid !== undefined ? { sid: payload.sid } : {}),
  })
    .setProtectedHeader({ alg: ACTOR_TOKEN_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn ?? defaultExpiry)
    .sign(getSecret());
}
