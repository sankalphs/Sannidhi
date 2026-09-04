import Link from "next/link";
import type { ReactNode } from "react";

import { Seal, Wordmark } from "@/components/marketing/wordmark";
import { MobileNav } from "@/components/shell/mobile-nav";
import { SessionRefresher } from "@/components/shell/session-refresher";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { SideNav } from "@/components/shell/side-nav";
import type { NavItem } from "@/lib/auth/nav";
import type { Role } from "@/lib/auth/session";

type AppShellProps = {
  role: Role;
  nav: NavItem[];
  children: ReactNode;
};

function roleLabel(role: Role): string {
  return role.replace("_", " ");
}

export function AppShell({ role, nav, children }: AppShellProps) {
  return (
    <div className="bg-background min-h-screen">
      <SessionRefresher />
      {/* Chalkboard sidebar — desktop */}
      <aside className="bg-primary text-primary-foreground border-primary-foreground/10 fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <Seal className="size-6" />
            <span className="font-display text-lg leading-none tracking-tight">Sannidhi</span>
          </Link>
        </div>
        <div className="border-primary-foreground/10 mx-5 border-t pt-4">
          <p className="text-primary-foreground/65 px-3 pb-2 font-mono text-[10px] font-medium tracking-[0.16em] uppercase">
            {roleLabel(role)} panel
          </p>
          <SideNav nav={nav} variant="board" className="px-1 pb-4" />
        </div>
        <div className="border-primary-foreground/10 mt-auto flex items-center justify-between gap-2 border-t px-5 py-4">
          <span className="text-primary-foreground/75 font-mono text-[11px] tracking-[0.1em] uppercase">
            {roleLabel(role)}
          </span>
          <SignOutButton onBoard />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:hidden">
        <MobileNav roleLabel={roleLabel(role)} nav={nav} />
        <Wordmark />
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tracking-[0.1em] uppercase">
          {roleLabel(role)}
        </span>
      </header>

      <main id="main-content" tabIndex={-1} className="lg:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
