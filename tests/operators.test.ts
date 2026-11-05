import { describe, expect, it } from "vitest";

import { isOperatorEmail } from "@/lib/auth/operators";

describe("isOperatorEmail", () => {
  it("matches listed emails case-insensitively, ignoring whitespace", () => {
    const list = " ops@sannidhi.app, Ananya.Iyer@SIT.edu.in ";
    expect(isOperatorEmail("ananya.iyer@sit.edu.in", list)).toBe(true);
    expect(isOperatorEmail("OPS@sannidhi.app", list)).toBe(true);
  });

  it("rejects emails that are not listed", () => {
    expect(isOperatorEmail("admin@other.edu", "ops@sannidhi.app")).toBe(false);
  });

  it("treats an unset or empty list as no operators", () => {
    expect(isOperatorEmail("ops@sannidhi.app", undefined)).toBe(false);
    expect(isOperatorEmail("ops@sannidhi.app", "")).toBe(false);
    expect(isOperatorEmail("", " , ")).toBe(false);
  });
});
