import { SignJWT, jwtVerify } from "jose";

export const ROLES = ["student", "faculty", "department_authority", "admin", "auditor"] as const;

export type Role = (typeof ROLES)[number];

export type SessionPayload = {
  userId: string;
  role: Role;
};

export const COOKIE_NAME = "sannidhi_session";

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

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { userId, role } = payload as { userId?: unknown; role?: unknown };
    if (typeof userId !== "string" || userId.length === 0) return null;
    if (typeof role !== "string" || !ROLES.includes(role as Role)) return null;
    return { userId, role: role as Role };
  } catch {
    return null;
  }
}
