// @vitest-environment node
import { describe, expect, it } from "vitest";

import { canonicalEventJson, computeEventHash, type LedgerHashInput } from "@/lib/ledger/hash";

const baseEvent: LedgerHashInput = {
  institutionId: "inst_1",
  category: "device",
  type: "device.registered",
  actorUserId: "user_admin",
  subjectUserId: "user_student",
  deviceId: "device_1",
  payload: { label: "Pixel 8", platform: "android" },
  seq: 0,
};

describe("canonicalEventJson", () => {
  it("is deterministic regardless of key insertion order", () => {
    expect(JSON.stringify({ b: 2, a: 1 })).not.toBe(JSON.stringify({ a: 1, b: 2 }));
    expect(canonicalEventJson({ b: 2, a: 1 })).toBe(canonicalEventJson({ a: 1, b: 2 }));
  });

  it("sorts keys at every nesting level", () => {
    const nested = { z: { y: 1, a: 2 }, m: [{ c: 3, b: [4] }] };
    const canonical = canonicalEventJson(nested);
    expect(canonical).toBe('{"m":[{"b":[4],"c":3}],"z":{"a":2,"y":1}}');
  });

  it("preserves array element order (arrays are ordered data)", () => {
    const one = canonicalEventJson({ list: ["b", "a"] });
    const two = canonicalEventJson({ list: ["a", "b"] });
    expect(one).not.toBe(two);
  });

  it("drops undefined values so absent and undefined fields hash identically", () => {
    expect(canonicalEventJson({ a: 1 })).toBe(canonicalEventJson({ a: 1, missing: undefined }));
  });
});

describe("computeEventHash", () => {
  it("returns a stable hex sha256 digest of the canonical form", async () => {
    const hash = await computeEventHash(baseEvent);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeEventHash(baseEvent)).toBe(hash);
  });

  it("treats an absent prevEventHash the same as null (genesis events)", async () => {
    const withUndefined = await computeEventHash(baseEvent);
    const withNull = await computeEventHash({ ...baseEvent, prevEventHash: null });
    expect(withUndefined).toBe(withNull);
  });

  it("changes when any core field changes (tamper detection)", async () => {
    const baseline = await computeEventHash(baseEvent);
    const mutations = [
      { ...baseEvent, seq: 1 },
      { ...baseEvent, type: "device.enrolled" },
      { ...baseEvent, payload: { label: "iPhone 15" } },
      { ...baseEvent, subjectUserId: "user_other" },
      { ...baseEvent, prevEventHash: "0".repeat(64) },
    ];
    for (const mutated of mutations) {
      expect(await computeEventHash(mutated)).not.toBe(baseline);
    }
  });

  it("chains: event N's hash links verifiably into event N+1", async () => {
    const first = await computeEventHash(baseEvent);
    const secondInput: LedgerHashInput = {
      ...baseEvent,
      seq: 1,
      type: "device.enrolled",
      prevEventHash: first,
    };
    const second = await computeEventHash(secondInput);

    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeEventHash(secondInput)).toBe(second);
    expect(await computeEventHash({ ...secondInput, prevEventHash: "f".repeat(64) })).not.toBe(
      second,
    );
  });
});
