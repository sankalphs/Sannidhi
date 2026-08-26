// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  mintBundleKey,
  nonceHash,
  signRecord,
  verifySignature,
  type OfflineRecord,
} from "@/lib/offline/bundle";

const BASE_RECORD: OfflineRecord = {
  sessionId: "session_1",
  sectionId: "section_1",
  studentId: "student_1",
  capturedAt: 1_756_000_000_000,
  nonce: "nonce-a",
  note: "present, back row",
};

const HEX_ALPHABET = "0123456789abcdef";

function flipHexChar(value: string, index: number): string {
  const current = value[index];
  const replacement = HEX_ALPHABET[(HEX_ALPHABET.indexOf(current) + 7) % HEX_ALPHABET.length];
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

describe("mintBundleKey", () => {
  it("mints unique 32-byte hex keys", () => {
    const keys = Array.from({ length: 25 }, () => mintBundleKey());
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(keys).size).toBe(25);
  });
});

describe("signRecord / verifySignature round trip", () => {
  it("verifies a freshly signed record", async () => {
    const key = mintBundleKey();
    const signed = await signRecord(key, BASE_RECORD);
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifySignature(key, signed)).toBe(true);
  });

  it("verifies with the same key it was signed with", async () => {
    const key = mintBundleKey();
    const signed = await signRecord(key, BASE_RECORD);
    expect(await verifySignature(key, signed)).toBe(true);
    expect(await verifySignature(key, { ...signed })).toBe(true);
  });

  it("breaks the signature when any record field is tampered", async () => {
    const key = mintBundleKey();
    const signed = await signRecord(key, BASE_RECORD);
    const mutations = [
      { ...signed, sessionId: "session_2" },
      { ...signed, sectionId: "section_2" },
      { ...signed, studentId: "student_2" },
      { ...signed, capturedAt: signed.capturedAt + 1 },
      { ...signed, nonce: `${signed.nonce}b` },
      { ...signed, note: `${signed.note}!` },
      { ...signed, signature: flipHexChar(signed.signature, 17) },
      { ...signed, signature: signed.signature.slice(0, 63) },
    ];
    for (const mutated of mutations) {
      expect(await verifySignature(key, mutated)).toBe(false);
    }
  });

  it("rejects signatures produced under a different key", async () => {
    const signed = await signRecord(mintBundleKey(), BASE_RECORD);
    expect(await verifySignature(mintBundleKey(), signed)).toBe(false);
  });

  it("fails closed on malformed keys or signatures instead of throwing", async () => {
    const key = mintBundleKey();
    const signed = await signRecord(key, BASE_RECORD);
    expect(await verifySignature("not-hex", signed)).toBe(false);
    expect(await verifySignature("", signed)).toBe(false);
    expect(await verifySignature(key, { ...signed, signature: "zzzz-not-hex" })).toBe(false);
  });
});

describe("nonceHash", () => {
  it("is deterministic sha256 hex scoped to both session and nonce", async () => {
    expect(await nonceHash("session_1", "nonce-a")).toMatch(/^[0-9a-f]{64}$/);
    expect(await nonceHash("session_1", "nonce-a")).toBe(await nonceHash("session_1", "nonce-a"));
    expect(await nonceHash("session_1", "nonce-a")).not.toBe(
      await nonceHash("session_1", "nonce-b"),
    );
    expect(await nonceHash("session_1", "nonce-a")).not.toBe(
      await nonceHash("session_2", "nonce-a"),
    );
  });
});

describe("canonical signing stability", () => {
  it("signs identically regardless of property insertion order", async () => {
    const key = mintBundleKey();
    const reordered: OfflineRecord = {
      note: BASE_RECORD.note,
      nonce: BASE_RECORD.nonce,
      capturedAt: BASE_RECORD.capturedAt,
      studentId: BASE_RECORD.studentId,
      sectionId: BASE_RECORD.sectionId,
      sessionId: BASE_RECORD.sessionId,
    };
    expect((await signRecord(key, reordered)).signature).toBe(
      (await signRecord(key, BASE_RECORD)).signature,
    );
  });

  it("treats an absent note and an undefined note as the same signed payload", async () => {
    const key = mintBundleKey();
    const absent: OfflineRecord = { ...BASE_RECORD };
    delete absent.note;
    const explicitUndefined: OfflineRecord = { ...BASE_RECORD, note: undefined };
    expect((await signRecord(key, absent)).signature).toBe(
      (await signRecord(key, explicitUndefined)).signature,
    );
  });

  it("produces different signatures when the note differs", async () => {
    const key = mintBundleKey();
    expect((await signRecord(key, BASE_RECORD)).signature).not.toBe(
      (await signRecord(key, { ...BASE_RECORD, note: undefined })).signature,
    );
  });
});
