import { describe, expect, it } from "vitest";

import { inviteRefusal } from "@/lib/invites/eligibility";

const INSTITUTION = "inst_a";

describe("inviteRefusal", () => {
  it("allows brand-new emails", () => {
    expect(inviteRefusal("new@sit.edu.in", null, INSTITUTION)).toBeNull();
  });

  it("allows re-inviting an account that has not activated yet", () => {
    const existing = { institutionId: INSTITUTION, status: "invited" as const };
    expect(inviteRefusal("meera@sit.edu.in", existing, INSTITUTION)).toBeNull();
  });

  it("refuses active and suspended accounts so an invite cannot take them over", () => {
    expect(
      inviteRefusal("a@sit.edu.in", { institutionId: INSTITUTION, status: "active" }, INSTITUTION),
    ).toBe("a@sit.edu.in already has an active account");
    expect(inviteRefusal("legacy@sit.edu.in", { institutionId: INSTITUTION }, INSTITUTION)).toBe(
      "legacy@sit.edu.in already has an active account",
    );
    expect(
      inviteRefusal(
        "s@sit.edu.in",
        { institutionId: INSTITUTION, status: "suspended" },
        INSTITUTION,
      ),
    ).toMatch(/is suspended/);
  });

  it("lets operator recovery re-issue for an existing account", () => {
    const existing = { institutionId: INSTITUTION, status: "active" as const };
    expect(
      inviteRefusal("admin@sit.edu.in", existing, INSTITUTION, { allowExistingAccount: true }),
    ).toBeNull();
  });

  it("never crosses institutions, even for recovery", () => {
    const existing = { institutionId: "inst_b", status: "invited" as const };
    expect(
      inviteRefusal("x@sit.edu.in", existing, INSTITUTION, { allowExistingAccount: true }),
    ).toBe("x@sit.edu.in belongs to another institution");
  });
});
