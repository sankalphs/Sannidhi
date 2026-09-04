import { ROLE_TO_HOME, type Role } from "@/lib/auth/session";

export type RouteGroup = {
  prefix: string;
  roles: readonly Role[];
};

export const ROUTE_GROUPS: readonly RouteGroup[] = [
  { prefix: "/student", roles: ["student"] },
  { prefix: "/faculty", roles: ["faculty"] },
  { prefix: "/admin", roles: ["admin", "department_authority"] },
  { prefix: "/admin/users", roles: ["admin"] },
  { prefix: "/admin/requests", roles: ["admin"] },
  { prefix: "/admin/devices", roles: ["admin"] },
  { prefix: "/admin/analytics", roles: ["admin", "department_authority"] },
  { prefix: "/admin/review", roles: ["admin", "department_authority"] },
  { prefix: "/admin/reports", roles: ["admin", "department_authority"] },
  { prefix: "/audit", roles: ["auditor", "admin"] },
];

export type AccessDecision = { status: "allow" } | { status: "redirect"; to: string };

function matchGroup(pathname: string): RouteGroup | undefined {
  const matches = ROUTE_GROUPS.filter(
    (group) => pathname === group.prefix || pathname.startsWith(`${group.prefix}/`),
  );
  if (matches.length === 0) return undefined;
  return matches.reduce((most, group) => (group.prefix.length > most.prefix.length ? group : most));
}

export function evaluateAccess(pathname: string, role: Role | null): AccessDecision {
  const group = matchGroup(pathname);
  if (!group) return { status: "allow" };
  if (!role) return { status: "redirect", to: "/" };
  if (group.roles.includes(role)) return { status: "allow" };
  return { status: "redirect", to: ROLE_TO_HOME[role] };
}
