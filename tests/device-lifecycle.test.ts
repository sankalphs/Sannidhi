import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DEVICE_STATES,
  DEVICE_TRANSITIONS,
  assertTransition,
  canTransition,
  type DeviceState,
} from "@/lib/devices/lifecycle";

const LEGAL: Array<[DeviceState, DeviceState]> = [
  ["new", "enrolled"],
  ["enrolled", "active"],
  ["active", "suspended"],
  ["suspended", "active"],
  ["active", "revoked"],
  ["suspended", "revoked"],
  ["active", "replaced"],
  ["revoked", "replaced"],
];

describe("device state machine definition", () => {
  it("exposes exactly the six spec states in order", () => {
    expect([...DEVICE_STATES]).toEqual([
      "new",
      "enrolled",
      "active",
      "suspended",
      "revoked",
      "replaced",
    ]);
  });

  it("covers every state as a key of the transition table", () => {
    for (const state of DEVICE_STATES) {
      expect(DEVICE_TRANSITIONS[state]).toBeDefined();
    }
    expect(Object.keys(DEVICE_TRANSITIONS).sort()).toEqual([...DEVICE_STATES].sort());
  });

  it("only allows transitions between declared states", () => {
    for (const targets of Object.values(DEVICE_TRANSITIONS)) {
      for (const target of targets) {
        expect(DEVICE_STATES).toContain(target);
      }
    }
  });
});

describe("canTransition (legal transitions)", () => {
  it("allows every non-replaced legal transition without extra context", () => {
    for (const [from, to] of LEGAL) {
      if (to !== "replaced") {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
      }
    }
  });

  it("allows active -> replaced and revoked -> replaced only with a successor context", () => {
    expect(canTransition("active", "replaced", { replacesDeviceId: true })).toBe(true);
    expect(canTransition("revoked", "replaced", { replacesDeviceId: true })).toBe(true);
    expect(canTransition("active", "replaced")).toBe(false);
    expect(canTransition("revoked", "replaced")).toBe(false);
    expect(canTransition("active", "replaced", { replacesDeviceId: false })).toBe(false);
  });

  it("rejects every illegal transition pair", () => {
    const legalSet = new Set(LEGAL.map(([from, to]) => `${from}->${to}`));
    for (const from of DEVICE_STATES) {
      for (const to of DEVICE_STATES) {
        const isLegal = legalSet.has(`${from}->${to}`);
        if (!isLegal) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    }
  });

  it("never allows transitions out of the replaced terminal state", () => {
    for (const to of DEVICE_STATES) {
      if (to !== "replaced") {
        expect(canTransition("replaced", to)).toBe(false);
      }
    }
  });

  it("does not allow skipping the enrollment chain", () => {
    expect(canTransition("new", "active")).toBe(false);
    expect(canTransition("new", "enrolled")).toBe(true);
    expect(canTransition("enrolled", "suspended")).toBe(false);
    expect(canTransition("enrolled", "revoked")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("accepts every non-replaced legal transition", () => {
    for (const [from, to] of LEGAL) {
      if (to !== "replaced") {
        expect(() => assertTransition(from, to), `${from} -> ${to}`).not.toThrow();
      }
    }
  });

  it("throws on illegal transitions with a descriptive message", () => {
    expect(() => assertTransition("new", "revoked")).toThrow(
      "Illegal device transition: new -> revoked",
    );
    expect(() => assertTransition("replaced", "active")).toThrow(
      "Illegal device transition: replaced -> active",
    );
  });

  it("names the missing successor when replaced lacks replacement context", () => {
    expect(() => assertTransition("active", "replaced")).toThrow(
      "successor device (replacesDeviceId) is required",
    );
  });

  it("passes through a valid replaced transition with context", () => {
    expect(() => assertTransition("revoked", "replaced", { replacesDeviceId: true })).not.toThrow();
  });
});

describe("type-level shape", () => {
  it("keeps DeviceState aligned with the constant set", () => {
    expectTypeOf<DeviceState>().toEqualTypeOf<(typeof DEVICE_STATES)[number]>();
  });
});
