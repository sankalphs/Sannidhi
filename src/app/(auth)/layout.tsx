import Link from "next/link";
import type { ReactNode } from "react";

import { VerdictStamp } from "@/components/marketing/verdict-stamp";
import { Wordmark } from "@/components/marketing/wordmark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen lg:grid lg:grid-cols-[1fr_1.1fr] xl:grid-cols-[1.1fr_1fr]">
      <aside className="bg-primary text-primary-foreground relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, transparent 0 1px, currentColor 1px 1px, transparent 1px calc(3rem + 1px)), repeating-linear-gradient(to bottom, transparent 0 1px, currentColor 1px 1px, transparent 1px calc(3rem + 1px))",
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <Wordmark className="text-primary-foreground" href={null} />
        </div>
        <div className="relative flex max-w-md flex-col gap-6">
          <p className="font-display text-4xl leading-[1.1] tracking-tight text-balance">
            Trust is earned per check-in.
          </p>
          <p className="text-primary-foreground/80 text-sm leading-relaxed">
            Passkeys first, passwords as a safety net. Session challenges that expire in seconds. A
            ledger that remembers every decision — and explains it.
          </p>
          <div className="flex flex-wrap gap-2">
            <VerdictStamp
              verdict="accept"
              className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground"
            />
            <VerdictStamp
              verdict="step-up"
              className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground"
            />
            <VerdictStamp
              verdict="flag"
              className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground"
            />
            <VerdictStamp
              verdict="reject"
              className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground"
            />
          </div>
        </div>
        <p className="text-primary-foreground/50 relative font-mono text-xs tracking-[0.12em] uppercase">
          Sannidhi · Adaptive attendance ecosystem
        </p>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-8"
      >
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="inline-flex rounded-md">
              <Wordmark href={null} />
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
