import { describe, expect, it } from "vitest";

import { verifyActorToken } from "../convex/lib/actor";
import { mintActorToken } from "@/lib/auth/actor-token";
import { signSession, verifySession } from "@/lib/auth/session";

describe("session cookies and actor tokens are not interchangeable", () => {
  it("each verifier accepts its own token", async () => {
    const session = await signSession({ userId: "user-1", role: "student", sid: "sid-1" });
    const actor = await mintActorToken({ userId: "user-1", role: "student", sid: "sid-1" });
    await expect(verifySession(session)).resolves.toEqual({
      userId: "user-1",
      role: "student",
      sid: "sid-1",
    });
    await expect(verifyActorToken(actor)).resolves.toEqual({
      userId: "user-1",
      role: "student",
      sid: "sid-1",
    });
  });

  it("verifyActorToken rejects a session cookie, including sid-less enrollment ones", async () => {
    const full = await signSession({ userId: "user-1", role: "student", sid: "sid-1" });
    const enrollment = await signSession({
      userId: "user-1",
      role: "student",
      scope: "enrollment",
    });
    await expect(verifyActorToken(full)).rejects.toThrow("wrong token type");
    await expect(verifyActorToken(enrollment)).rejects.toThrow("wrong token type");
  });

  it("verifySession rejects an actor token", async () => {
    const sidless = await mintActorToken({ userId: "user-1", role: "admin" });
    const withSid = await mintActorToken({ userId: "user-1", role: "admin", sid: "sid-1" });
    expect(await verifySession(sidless)).toBeNull();
    expect(await verifySession(withSid)).toBeNull();
  });
});
