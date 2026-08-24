import Link from "next/link";

import { Wordmark } from "@/components/marketing/wordmark";

const LINK_GROUPS = [
  {
    heading: "Product",
    links: [
      { href: "#how-it-works", label: "How it works" },
      { href: "#panels", label: "Role panels" },
      { href: "#trust", label: "Trust model" },
    ],
  },
  {
    heading: "Institution",
    links: [
      { href: "/request-access", label: "Request access" },
      { href: "/login", label: "Sign in" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-border/70 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
          <div className="flex max-w-xs flex-col gap-3">
            <Wordmark href={null} />
            <p className="text-muted-foreground text-sm">
              Adaptive trust-based attendance for classrooms, departments, and audits.
            </p>
          </div>
          <div className="flex gap-16">
            {LINK_GROUPS.map((group) => (
              <div key={group.heading} className="flex flex-col gap-3">
                <p className="font-mono text-[11px] font-medium tracking-[0.14em] uppercase">
                  {group.heading}
                </p>
                <ul className="flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="border-border/70 text-muted-foreground flex flex-col gap-1 border-t pt-6 font-mono text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Sannidhi</span>
          <span>Every decision recorded. Every record auditable.</span>
        </div>
      </div>
    </footer>
  );
}
