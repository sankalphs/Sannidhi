import { describe, expect, it } from "vitest";

import { statusChangeRefusal } from "@/lib/users/status-change";

describe("statusChangeRefusal", () => {
  it("suspends active accounts, including legacy ones without a status", () => {
    expect(statusChangeRefusal("active", "suspended", false)).toBeNull();
    expect(statusChangeRefusal(undefined, "suspended", false)).toBeNull();
  });

  it("never lets an admin suspend themselves", () => {
    expect(statusChangeRefusal("active", "suspended", true)).toBe("you cannot suspend yourself");
  });

  it("leaves invited and already-suspended accounts alone", () => {
    expect(statusChangeRefusal("invited", "suspended", false)).toMatch(/only active/);
    expect(statusChangeRefusal("suspended", "suspended", false)).toMatch(/only active/);
  });

  it("reactivates only suspended accounts", () => {
    expect(statusChangeRefusal("suspended", "active", false)).toBeNull();
    expect(statusChangeRefusal("active", "active", false)).toMatch(/only suspended/);
    expect(statusChangeRefusal("invited", "active", false)).toMatch(/only suspended/);
  });
});
