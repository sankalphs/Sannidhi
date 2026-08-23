import { SignJWT, jwtVerify } from "jose";

import { ENROLLMENT_SESSION_TTL_MS, SESSION_TTL_MS } from "./token-hash";

export const ROLES = ["student", "faculty", "department_authority", "admin", "auditor"] as const;

export type Role = (typeof ROLES)[number];

export const SESSION_SCOPES = ["full", "enrollment"] as const;

export type SessionScope = (typeof SESSION_SCOPES)[number];

export type SessionPayload = {
  userId: string;
  role: Role;
  sid?: string;
  scope?: SessionScope;
};

export const COOKIE_NAME = "sannidhi_session";

export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

export const ENROLLMENT_SESSION_TTL_SECONDS = ENROLLMENT_SESSION_TTL_MS / 1000;
export const ROLE_TO_HOME: Record<Role, string> = {
  student: "/student",
  faculty: "/faculty",
  department_authority: "/admin",
  admin: "/admin",
  auditor: "/audit",
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

export async function signSession(
  payload: SessionPayload,
  options?: { expiresIn?: string | number },
): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    role: payload.role,
    ...(payload.sid !== undefined ? { sid: payload.sid } : {}),
    ...(payload.scope !== undefined ? { scope: payload.scope } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn ?? `${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { userId, role, sid, scope } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || userId.length === 0) return null;
    if (typeof role !== "string" || !ROLES.includes(role as Role)) return null;
    const session: SessionPayload = { userId, role: role as Role };
    if (typeof sid === "string" && sid.length > 0) session.sid = sid;
    if (scope !== undefined) {
      if (typeof scope !== "string" || !SESSION_SCOPES.includes(scope as SessionScope)) {
        return null;
      }
      session.scope = scope as SessionScope;
    }
    return session;
  } catch {
    return null;
  }
}

export function isFullSession(session: Pick<SessionPayload, "scope"> | null | undefined): boolean {
  if (!session) return false;
  return session.scope === undefined || session.scope === "full";
}

export function isEnrollmentSession(
  session: Pick<SessionPayload, "scope"> | null | undefined,
): boolean {
  return session?.scope === "enrollment";
}
