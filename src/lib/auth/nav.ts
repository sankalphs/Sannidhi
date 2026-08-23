import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/auth/session";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const ROLE_NAV: Record<Role, NavItem[]> = {
  student: [
    { label: "Overview", href: "/student", icon: LayoutDashboard },
    { label: "Attendance history", href: "/student/history", icon: BookOpen },
    { label: "Requests", href: "/student/requests", icon: ClipboardList },
  ],
  faculty: [
    { label: "Overview", href: "/faculty", icon: LayoutDashboard },
    { label: "Class sessions", href: "/faculty/sessions", icon: GraduationCap },
  ],
  department_authority: [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Courses & sections", href: "/admin/courses", icon: BookOpen },
    { label: "Policies", href: "/admin/policies", icon: Landmark },
  ],
  admin: [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "Courses & sections", href: "/admin/courses", icon: BookOpen },
    { label: "Policies", href: "/admin/policies", icon: Landmark },
  ],
  auditor: [
    { label: "Overview", href: "/audit", icon: LayoutDashboard },
    { label: "Event ledger", href: "/audit/events", icon: ScrollText },
  ],
};
