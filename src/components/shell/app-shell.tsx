import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/auth/nav";
import type { Role } from "@/lib/auth/session";

type AppShellProps = {
  role: Role;
  nav: NavItem[];
  children: ReactNode;
};

function SidebarNav({ nav, className }: { nav: NavItem[]; className?: string }) {
  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ role, nav, children }: AppShellProps) {
  return (
    <div className="bg-background min-h-screen">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:pl-60">
        <details className="group relative lg:hidden">
          <summary className="hover:bg-accent -ml-2 flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col gap-1">
              <span className="bg-foreground h-0.5 w-4 rounded-full" />
              <span className="bg-foreground h-0.5 w-4 rounded-full" />
              <span className="bg-foreground h-0.5 w-4 rounded-full" />
            </span>
          </summary>
          <div className="bg-background absolute top-11 left-0 z-50 min-w-52 rounded-lg border p-2 shadow-lg">
            <SidebarNav nav={nav} />
          </div>
        </details>
        <div className="ml-auto flex items-center gap-3">
          <Badge variant="outline" className="capitalize">
            {role.replace("_", " ")}
          </Badge>
          <SignOutButton devLoginEnabled={process.env.ENABLE_DEV_LOGIN === "1"} />
        </div>
      </header>
      <aside className="bg-background fixed inset-y-0 left-0 z-30 hidden w-56 border-r pt-14 lg:flex lg:flex-col">
        <SidebarNav nav={nav} className="p-3" />
      </aside>
      <main className="lg:pl-56">
        <div className="mx-auto w-full max-w-5xl px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
