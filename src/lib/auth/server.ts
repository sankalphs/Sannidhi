import { cookies } from "next/headers";

import { api } from "../../../convex/_generated/api";
import { mintActorToken } from "./actor-token";
import {
  COOKIE_NAME,
  isEnrollmentSession,
  verifySession,
  type Role,
  type SessionPayload,
} from "./session";
import { getConvexClient } from "@/lib/convex/server-client";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function getSessionRole(fallback: Role): Promise<Role> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token === undefined) return fallback;
  const session = await verifySession(token);
  if (session === null || isEnrollmentSession(session)) return fallback;
  return session.role;
}

export async function getActiveSession(options?: {
  allowEnrollment?: boolean;
}): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token === undefined) return null;
  const session = await verifySession(token);
  if (session === null) return null;

  if (isEnrollmentSession(session)) {
    return options?.allowEnrollment === true ? session : null;
  }

  const { sid } = session;
  if (sid !== undefined) {
    const active = await isServerSessionActive({ ...session, sid });
    if (!active) return null;
  }
  return session;
}

type ConvexSessionStatus = { active: boolean; expiresAt: number | null };

async function queryOwnSession(session: SessionPayload & { sid: string }) {
  try {
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });
    const status = await getConvexClient().query(api.sessions.getSessionStatus, { actorToken });
    return (status as ConvexSessionStatus | null) ?? null;
  } catch {
    return null;
  }
}

async function isServerSessionActive(session: SessionPayload & { sid: string }): Promise<boolean> {
  const status = await queryOwnSession(session);
  return status?.active === true;
}

export async function getSessionExpiresAt(session: SessionPayload): Promise<number | null> {
  const { sid } = session;
  if (sid === undefined) return null;
  const status = await queryOwnSession({ ...session, sid });
  return status?.expiresAt ?? null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}
