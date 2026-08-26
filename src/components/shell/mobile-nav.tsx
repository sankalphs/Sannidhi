"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { SideNav } from "@/components/shell/side-nav";
import { SignOutButton } from "@/components/shell/sign-out-button";
import type { NavItem } from "@/lib/auth/nav";

export function MobileNav({ roleLabel, nav }: { roleLabel: string; nav: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-accent focus-visible:ring-ring/50 -ml-2 flex size-9 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open ? (
        <div
          id="mobile-nav-menu"
          className="bg-background absolute top-11 left-0 z-50 min-w-56 rounded-lg border p-2 shadow-lg"
        >
          <p className="text-muted-foreground px-3 pb-2 font-mono text-[10px] tracking-[0.16em] uppercase">
            {roleLabel} panel
          </p>
          <SideNav nav={nav} variant="paper" onNavigate={() => setOpen(false)} />
          <div className="border-border mt-2 border-t pt-2">
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </>
  );
}
