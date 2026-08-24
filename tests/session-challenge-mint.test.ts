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
  it("produces a decodable token bound to the session context", () => {
    const minted = mintChallengeToken(BASE_INPUT);
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
    const verified = verifyChallengeToken(minted.token);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.payload).toEqual(payload);
  });

  it("applies the configured short TTL", () => {
    const minted = mintChallengeToken(BASE_INPUT);
    expect(minted.expiresAt - BASE_INPUT.now).toBe(60_000);
  });

  it("generates unique nonces and hashes across mints", () => {
    const minted = Array.from({ length: 50 }, () => mintChallengeToken(BASE_INPUT));
    expect(new Set(minted.map((row) => row.nonce)).size).toBe(50);
    expect(new Set(minted.map((row) => row.nonceHash)).size).toBe(50);
    expect(new Set(minted.map((row) => row.token)).size).toBe(50);
  });

  it("digests nonces with sha256 hex stably and distinctively", () => {
    expect(nonceDigest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(nonceDigest("nonce-a")).toBe(nonceDigest("nonce-a"));
    expect(nonceDigest("nonce-a")).not.toBe(nonceDigest("nonce-b"));
    const minted = mintChallengeToken(BASE_INPUT);
    expect(minted.nonceHash).toBe(nonceDigest(minted.nonce));
  });

  it("rejects single-character tampering anywhere in either token segment", () => {
    const { token } = mintChallengeToken(BASE_INPUT);
    const [payloadPart, signaturePart] = token.split(".");
    for (let i = 0; i < payloadPart.length - 1; i += 1) {
      expect(verifyChallengeToken(`${flipChar(payloadPart, i)}.${signaturePart}`).ok).toBe(false);
    }
    for (let i = 0; i < signaturePart.length - 1; i += 1) {
      expect(verifyChallengeToken(`${payloadPart}.${flipChar(signaturePart, i)}`).ok).toBe(false);
    }
  });

  it("rejects structurally invalid tokens", () => {
    expect(verifyChallengeToken("").ok).toBe(false);
    expect(verifyChallengeToken("not-a-token").ok).toBe(false);
    expect(verifyChallengeToken("a.b.c").ok).toBe(false);
    expect(verifyChallengeToken("!!!!!.?????").ok).toBe(false);
  });

  it("rejects tokens signed with a different secret", () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "challenge-secret-alpha-0123456789";
    const { token } = mintChallengeToken(BASE_INPUT);
    process.env.SESSION_SECRET = "challenge-secret-bravo-0123456789";
    expect(verifyChallengeToken(token).ok).toBe(false);
    restoreSecret(original);
  });

  it("throws when SESSION_SECRET is shorter than 16 bytes", () => {
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    expect(() => mintChallengeToken(BASE_INPUT)).toThrow("at least 16 bytes");
    restoreSecret(original);
  });

  it("fails closed when SESSION_SECRET is unset", () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    expect(() => mintChallengeToken(BASE_INPUT)).toThrow("SESSION_SECRET must be set");
    expect(() => nonceDigest("still-hashable")).not.toThrow();
    restoreSecret(original);
  });
});
