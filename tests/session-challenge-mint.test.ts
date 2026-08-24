import { describe, expect, it } from "vitest";

import {
  SESSION_CHALLENGE_TTL_MS,
  mintChallengeToken,
  nonceDigest,
  verifyChallengeToken,
} from "@/lib/session-challenge";

const BASE_INPUT = {
  sessionId: "session-1",
  institutionId: "inst-1",
  courseId: "course-1",
  sectionId: "section-1",
  venueId: "venue-1",
  now: 1_000_000,
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function restoreSecret(original: string | undefined): void {
  if (original === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = original;
}

function flipChar(value: string, index: number): string {
  const current = value[index];
  const replacement = ALPHABET[(ALPHABET.indexOf(current) + 13) % ALPHABET.length];
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

describe("session challenge minting", () => {
  it("produces a decodable token bound to the session context", async () => {
    const minted = await mintChallengeToken(BASE_INPUT);
    const parts = minted.token.split(".");
    expect(parts).toHaveLength(2);
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    expect(payload).toEqual({
      sid: "session-1",
      iid: "inst-1",
      cs: "course-1",
      sec: "section-1",
      ven: "venue-1",
      exp: BASE_INPUT.now + SESSION_CHALLENGE_TTL_MS,
      n: expect.any(String),
    });
    expect(minted.expiresAt).toBe(BASE_INPUT.now + SESSION_CHALLENGE_TTL_MS);
    const verified = await verifyChallengeToken(minted.token);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.payload).toEqual(payload);
  });

  it("applies the configured short TTL", async () => {
    const minted = await mintChallengeToken(BASE_INPUT);
    expect(minted.expiresAt - BASE_INPUT.now).toBe(60_000);
  });

  it("generates unique nonces and hashes across mints", async () => {
    const minted = await Promise.all(
      Array.from({ length: 50 }, () => mintChallengeToken(BASE_INPUT)),
    );
    expect(new Set(minted.map((row) => row.nonce)).size).toBe(50);
    expect(new Set(minted.map((row) => row.nonceHash)).size).toBe(50);
    expect(new Set(minted.map((row) => row.token)).size).toBe(50);
  });

  it("digests nonces with sha256 hex stably and distinctively", async () => {
    expect(await nonceDigest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await nonceDigest("nonce-a")).toBe(await nonceDigest("nonce-a"));
    expect(await nonceDigest("nonce-a")).not.toBe(await nonceDigest("nonce-b"));
    const minted = await mintChallengeToken(BASE_INPUT);
    expect(minted.nonceHash).toBe(await nonceDigest(minted.nonce));
  });

  it("rejects single-character tampering anywhere in either token segment", async () => {
    const { token } = await mintChallengeToken(BASE_INPUT);
    const [payloadPart, signaturePart] = token.split(".");
    for (let i = 0; i < payloadPart.length - 1; i += 1) {
      const tampered = await verifyChallengeToken(`${flipChar(payloadPart, i)}.${signaturePart}`);
      expect(tampered.ok).toBe(false);
    }
    for (let i = 0; i < signaturePart.length - 1; i += 1) {
      const tampered = await verifyChallengeToken(`${payloadPart}.${flipChar(signaturePart, i)}`);
      expect(tampered.ok).toBe(false);
    }
  });

  it("rejects structurally invalid tokens", async () => {
    expect((await verifyChallengeToken("")).ok).toBe(false);
    expect((await verifyChallengeToken("not-a-token")).ok).toBe(false);
    expect((await verifyChallengeToken("a.b.c")).ok).toBe(false);
    expect((await verifyChallengeToken("!!!!!.?????")).ok).toBe(false);
  });

  it("classifies undecodable base64url segments as token_malformed instead of throwing", async () => {
    const { token } = await mintChallengeToken(BASE_INPUT);
    const [payloadPart, signaturePart] = token.split(".");
    for (const candidate of ["A.B", "A.AAA", "AAA.B", `${payloadPart}.B`, `B.${signaturePart}`]) {
      const verified = await verifyChallengeToken(candidate);
      expect(verified.ok).toBe(false);
      if (!verified.ok) expect(verified.reasonCode).toBe("token_malformed");
    }
  });

  it("rejects tokens signed with a different secret", async () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "challenge-secret-alpha-0123456789";
    const { token } = await mintChallengeToken(BASE_INPUT);
    process.env.SESSION_SECRET = "challenge-secret-bravo-0123456789";
    expect((await verifyChallengeToken(token)).ok).toBe(false);
    restoreSecret(original);
  });

  it("throws when SESSION_SECRET is shorter than 16 bytes", async () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    await expect(mintChallengeToken(BASE_INPUT)).rejects.toThrow("at least 16 bytes");
    restoreSecret(original);
  });

  it("fails closed when SESSION_SECRET is unset", async () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    await expect(mintChallengeToken(BASE_INPUT)).rejects.toThrow("SESSION_SECRET must be set");
    await expect(nonceDigest("still-hashable")).resolves.toBeDefined();
    restoreSecret(original);
  });
});
