export type NavIcon =
  | "dashboard"
  | "qr"
  | "book"
  | "smartphone"
  | "clipboard"
  | "graduation"
  | "landmark"
  | "users"
  | "scroll"
  | "inbox";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
};

import type { Role } from "@/lib/auth/session";

export const ROLE_NAV: Record<Role, NavItem[]> = {
  student: [
    { label: "Overview", href: "/student", icon: "dashboard" },
    { label: "Check in", href: "/student/check-in", icon: "qr" },
    { label: "Attendance history", href: "/student/history", icon: "book" },
    { label: "Devices", href: "/student/devices", icon: "smartphone" },
    { label: "Requests", href: "/student/requests", icon: "clipboard" },
  ],
  faculty: [
    { label: "Overview", href: "/faculty", icon: "dashboard" },
    { label: "Class sessions", href: "/faculty/sessions", icon: "graduation" },
  ],
  department_authority: [
    { label: "Overview", href: "/admin", icon: "dashboard" },
    { label: "Courses & sections", href: "/admin/courses", icon: "book" },
    { label: "Policies", href: "/admin/policies", icon: "landmark" },
  ],
  admin: [
    { label: "Overview", href: "/admin", icon: "dashboard" },
    { label: "Users", href: "/admin/users", icon: "users" },
    { label: "Access requests", href: "/admin/requests", icon: "inbox" },
    { label: "Devices", href: "/admin/devices", icon: "smartphone" },
    { label: "Courses & sections", href: "/admin/courses", icon: "book" },
    { label: "Policies", href: "/admin/policies", icon: "landmark" },
    { label: "Event ledger", href: "/audit/events", icon: "scroll" },
  ],
  auditor: [
    { label: "Overview", href: "/audit", icon: "dashboard" },
    { label: "Event ledger", href: "/audit/events", icon: "scroll" },
  ],
};
