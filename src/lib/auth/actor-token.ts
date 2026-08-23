import type { Role } from "./session";

export const ACTOR_TOKEN_ALGORITHM = "HS256";

export const ACTOR_TOKEN_MAX_AGE_SECONDS = 10 * 60;

export const ACTOR_TOKEN_MAX_AGE_MS = ACTOR_TOKEN_MAX_AGE_SECONDS * 1000;

export type ActorTokenClaims = {
  userId: string;
  role: Role;
  sid?: string;
};
