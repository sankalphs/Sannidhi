import { describe, expect, it } from "vitest";

import { isEnrollmentSession, isFullSession, signSession, verifySession } from "@/lib/auth/session";

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("session sid and scope claims", () => {
  it("roundtrips a sid through signSession/verifySession", async () => {
    const token = await signSession({ userId: "user-1", role: "student", sid: "abc123" });
    const session = await verifySession(token);
    expect(session).toEqual({ userId: "user-1", role: "student", sid: "abc123" });
  });

  it("keeps sid-less tokens valid for the gated dev-session path", async () => {
    const token = await signSession({ userId: "dev-student", role: "student" });
    const session = await verifySession(token);
    expect(session).toEqual({ userId: "dev-student", role: "student" });
  });

  it("roundtrips the enrollment scope and honours a short expiry", async () => {
    const token = await signSession(
      { userId: "user-2", role: "faculty", scope: "enrollment" },
      { expiresIn: "15m" },
    );
    const session = await verifySession(token);
    expect(session).toEqual({ userId: "user-2", role: "faculty", scope: "enrollment" });
    expect(isEnrollmentSession(session)).toBe(true);
    expect(isFullSession(session)).toBe(false);
  });

  it("treats absent scope as a full session", async () => {
    const token = await signSession({ userId: "user-3", role: "admin", sid: "sid-9" });
    const session = await verifySession(token);
    expect(isFullSession(session)).toBe(true);
    expect(isEnrollmentSession(session)).toBe(false);
  });

  it("rejects tampered tokens", async () => {
    const token = await signSession({ userId: "user-4", role: "auditor", sid: "tamper-me" });
    const [header, payload, signature] = token.split(".");
    const forgedPayload = base64UrlEncode(JSON.stringify({ userId: "attacker", role: "admin" }));
    expect(await verifySession(`${header}.${forgedPayload}.${signature}`)).toBeNull();
    expect(await verifySession(`${header}.${payload}.${signature}x`)).toBeNull();
  });

  it("rejects a validly-signed token carrying an unknown scope", async () => {
    const token = await signSession({
      userId: "user-5",
      role: "student",
      scope: "root" as never,
    });
    expect(await verifySession(token)).toBeNull();
  });
});
