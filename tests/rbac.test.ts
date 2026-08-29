import { describe, expect, it } from "vitest";

import { evaluateAccess } from "@/lib/auth/guard";
import { ROLES, type Role } from "@/lib/auth/session";

const GROUP_PREFIXES = ["/student", "/faculty", "/admin", "/audit"] as const;

function allowedRolesFor(prefix: string): Role[] {
  const decisions = ROLES.map((role) => evaluateAccess(`${prefix}/deep/path`, role));
  return ROLES.filter((_, index) => decisions[index].status === "allow");
}

describe("evaluateAccess", () => {
  it("redirects unauthenticated users to / for every guarded group", () => {
    for (const prefix of GROUP_PREFIXES) {
      expect(evaluateAccess(prefix, null)).toEqual({ status: "redirect", to: "/" });
      expect(evaluateAccess(`${prefix}/sub`, null)).toEqual({ status: "redirect", to: "/" });
    }
  });

  it("enforces the access matrix", () => {
    expect(allowedRolesFor("/student")).toEqual(["student"]);
    expect(allowedRolesFor("/faculty")).toEqual(["faculty"]);
    expect(allowedRolesFor("/admin")).toEqual(["department_authority", "admin"]);
    expect(allowedRolesFor("/audit")).toEqual(["admin", "auditor"]);
  });

  it("restricts admin child routes to the admin role", () => {
    expect(allowedRolesFor("/admin/users")).toEqual(["admin"]);
    expect(evaluateAccess("/admin/users", "department_authority")).toEqual({
      status: "redirect",
      to: "/admin",
    });
    expect(allowedRolesFor("/admin/courses")).toEqual(["department_authority", "admin"]);
    expect(allowedRolesFor("/admin/policies")).toEqual(["department_authority", "admin"]);
  });

  it("serves analytics surfaces to admin and department authority only", () => {
    expect(allowedRolesFor("/admin/analytics")).toEqual(["department_authority", "admin"]);
    expect(allowedRolesFor("/admin/review")).toEqual(["department_authority", "admin"]);
    expect(allowedRolesFor("/admin/reports")).toEqual(["department_authority", "admin"]);
    expect(evaluateAccess("/admin/analytics", "student")).toEqual({
      status: "redirect",
      to: "/student",
    });
  });

  it("sends wrong-role users to their own role home", () => {
    expect(evaluateAccess("/student", "faculty")).toEqual({ status: "redirect", to: "/faculty" });
    expect(evaluateAccess("/admin/users", "student")).toEqual({
      status: "redirect",
      to: "/student",
    });
    expect(evaluateAccess("/audit/events", "auditor")?.status).toBe("allow");
    expect(evaluateAccess("/audit", "faculty")).toEqual({ status: "redirect", to: "/faculty" });
    expect(evaluateAccess("/faculty/sessions", "department_authority")).toEqual({
      status: "redirect",
      to: "/admin",
    });
    expect(evaluateAccess("/admin", "auditor")).toEqual({ status: "redirect", to: "/audit" });
  });

  it("matches group prefixes exactly without swallowing lookalike paths", () => {
    expect(evaluateAccess("/students", "faculty").status).toBe("allow");
    expect(evaluateAccess("/student", "student").status).toBe("allow");
    expect(evaluateAccess("/student/requests", "student").status).toBe("allow");
    expect(evaluateAccess("/", "student").status).toBe("allow");
    expect(evaluateAccess("/login", null).status).toBe("allow");
  });
});
