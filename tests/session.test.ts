import { describe, expect, it } from "vitest";

import { COOKIE_NAME, ROLES, ROLE_TO_HOME, signSession, verifySession } from "@/lib/auth/session";

describe("session", () => {
  it("roundtrips a signed session payload", async () => {
    const token = await signSession({ userId: "user-1", role: "faculty" });
    const session = await verifySession(token);
    expect(session).toEqual({ userId: "user-1", role: "faculty" });
  });

  it("rejects tokens signed with a different secret", async () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "secret-a";
    const token = await signSession({ userId: "user-1", role: "admin" });
    process.env.SESSION_SECRET = "secret-b";
    const session = await verifySession(token);
    expect(session).toBeNull();
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  });

  it("returns null for garbage tokens", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("exposes the expected cookie name and role homes", () => {
    expect(COOKIE_NAME).toBe("sannidhi_session");
    expect(ROLES).toHaveLength(5);
    expect(ROLE_TO_HOME.student).toBe("/student");
    expect(ROLE_TO_HOME.faculty).toBe("/faculty");
    expect(ROLE_TO_HOME.department_authority).toBe("/admin");
    expect(ROLE_TO_HOME.admin).toBe("/admin");
    expect(ROLE_TO_HOME.auditor).toBe("/audit");
  });
});
