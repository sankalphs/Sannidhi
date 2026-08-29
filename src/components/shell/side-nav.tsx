"use client";

import {
  BookOpen,
  ChartColumn,
  ClipboardList,
  FileText,
  GraduationCap,
  Inbox,
  Landmark,
  LayoutDashboard,
  QrCode,
  ScrollText,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "@/lib/auth/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  qr: QrCode,
  book: BookOpen,
  smartphone: Smartphone,
  clipboard: ClipboardList,
  graduation: GraduationCap,
  landmark: Landmark,
  users: Users,
  scroll: ScrollText,
  inbox: Inbox,
  insights: ChartColumn,
  file: FileText,
};

type SideNavProps = {
  nav: NavItem[];
  className?: string;
  variant?: "board" | "paper";
  onNavigate?: () => void;
};

export function SideNav({ nav, className, variant = "board", onNavigate }: SideNavProps) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {nav.map((item) => {
        const Icon = ICONS[item.icon];
        const isSectionRoot = item.href.split("/").length <= 2;
        const active = isSectionRoot
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              variant === "board"
                ? active
                  ? "bg-chalk text-chalk-foreground font-medium"
                  : "text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                : active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
