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
  { prefix: "/admin/schedule", roles: ["admin"] },
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

/** Signed-out visitors go to sign-in and come back to `pathname + search` afterwards. */
export function evaluateAccess(pathname: string, role: Role | null, search = ""): AccessDecision {
  const group = matchGroup(pathname);
  if (!group) return { status: "allow" };
  if (!role) {
    return { status: "redirect", to: `/login?next=${encodeURIComponent(pathname + search)}` };
  }
  if (group.roles.includes(role)) return { status: "allow" };
  return { status: "redirect", to: ROLE_TO_HOME[role] };
}

/** A post-sign-in `next` target, kept only when it is a same-origin relative path. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  // Control characters can smuggle a scheme past URL parsers (`/\t/evil.example`).
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
