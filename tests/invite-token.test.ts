// @vitest-environment node
import { describe, expect, it } from "vitest";

import { generateInviteToken } from "@/lib/invites/token-node";
import { hashInviteToken, randomToken } from "@/lib/invites/token";

describe("generateInviteToken", () => {
  it("produces unpadded base64url of 32 random bytes", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("does not repeat across calls", () => {
    const seen = new Set(Array.from({ length: 32 }, () => generateInviteToken()));
    expect(seen.size).toBe(32);
  });
});

describe("randomToken", () => {
  it("produces the same shape via WebCrypto getRandomValues", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("hashInviteToken", () => {
  it("returns a stable hex sha256 digest", async () => {
    const hash = await hashInviteToken("demo-invite-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashInviteToken("demo-invite-token")).toBe(hash);
  });

  it("matches the sha256 reference digest for a known input", async () => {
    expect(await hashInviteToken("demo-invite-token")).toBe(
      "3aa030fe3ebc63be729f46fc6282b1cf4e85abe555eb1acda2a9b895a2fb70e8",
    );
  });

  it("differs for different tokens", async () => {
    expect(await hashInviteToken("token-a")).not.toBe(await hashInviteToken("token-b"));
  });

  it("never exposes the raw token through the hash input encoding", async () => {
    const token = generateInviteToken();
    const hash = await hashInviteToken(token);
    expect(hash).not.toContain(token.slice(0, 10));
  });
});
