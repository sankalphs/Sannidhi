"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Wordmark } from "@/components/marketing/wordmark";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#panels", label: "Panels" },
  { href: "#trust", label: "Trust" },
] as const;

export function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark />
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex min-h-10 items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/request-access">Request access</Link>
          </Button>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-nav-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 -mr-2 flex size-10 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav
          id="site-nav-menu"
          aria-label="Site"
          className="border-border/70 bg-background/95 supports-[backdrop-filter]:bg-background/90 border-t backdrop-blur md:hidden"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="border-border/70 mt-1 border-t pt-2 sm:hidden">
              <Link
                href="/login"
                onClick={closeMenu}
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors"
              >
                Sign in
              </Link>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
