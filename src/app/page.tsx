import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LiveSessionDemo } from "@/components/marketing/live-session-demo";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { VerdictStamp, type Verdict } from "@/components/marketing/verdict-stamp";
import { Button } from "@/components/ui/button";

const VERDICTS: { verdict: Verdict; description: string }[] = [
  { verdict: "accept", description: "Evidence is strong. The student is checked in." },
  { verdict: "step-up", description: "Evidence is thin. Liveness or face match is requested." },
  { verdict: "flag", description: "Something is off. A faculty member reviews the attempt." },
  { verdict: "reject", description: "Replay or tampering detected. The attempt is refused." },
];

const STEPS = [
  {
    number: "1",
    title: "Start the session",
    description:
      "Faculty open the timetable and tap once. A rotating QR appears — it refreshes every few seconds, so screenshots and replays are worthless.",
  },
  {
    number: "2",
    title: "Check in",
    description:
      "Students scan and confirm with their passkey. Most are accepted instantly; the rest get a challenge proportionate to the risk.",
  },
  {
    number: "3",
    title: "Stand by the record",
    description:
      "Every decision is appended to a hash-chained ledger with reason codes. Auditors can read it; nobody can rewrite it.",
  },
];

const PANELS = [
  {
    eyebrow: "Student panel",
    title: "Check in and move on.",
    description:
      "A fast passkey check-in, a clear calendar of where you stand, and corrections without chasing faculty around campus.",
    points: [
      "Check in against a rotating session QR",
      "Attendance per subject, with threshold projections",
      "File corrections, exemptions, and on-duty requests",
    ],
    href: "/login?as=student",
    cta: "Explore the student panel",
  },
  {
    eyebrow: "Faculty panel",
    title: "Run the room, not the register.",
    description:
      "Start a session from your timetable in one tap and watch the verification board fill in while you teach.",
    points: [
      "One-tap sessions with rotating QR challenges",
      "A live board with reason codes per check-in",
      "Spot re-checks and manual overrides, fully audited",
    ],
    href: "/login?as=faculty",
    cta: "Explore the faculty panel",
  },
  {
    eyebrow: "Admin panel",
    title: "Admit people, not doubts.",
    description:
      "Import users, issue invites, approve devices, and set the policies the risk engine enforces every day.",
    points: [
      "CSV imports and invite management",
      "Device approvals and replacement flows",
      "Course, section, and policy controls",
    ],
    href: "/login?as=admin",
    cta: "Explore the admin panel",
  },
  {
    eyebrow: "Auditor panel",
    title: "Read everything. Change nothing.",
    description:
      "Read-only access to the append-only event ledger, with the full evidence trail behind every decision.",
    points: [
      "Hash-chained event history",
      "Decision evidence with reason codes",
      "Corrections that link forward, never erase",
    ],
    href: "/login?as=auditor",
    cta: "Explore the auditor panel",
  },
];

const TRUST = [
  {
    title: "Passkeys, not passwords",
    description:
      "Accounts activate with a passkey bound to the student's own device. Nothing to phish, nothing to share.",
  },
  {
    title: "Challenges that expire",
    description:
      "Session QRs rotate every few seconds behind single-use nonces. A screenshot from last week proves nothing.",
  },
  {
    title: "A ledger that remembers",
    description:
      "Every state change is hash-chained and append-only. Corrections link forward; history cannot be quietly rewritten.",
  },
  {
    title: "Verification in proportion",
    description:
      "Strong checks run only when risk demands them. Routine check-ins stay fast, and biometrics are opt-in with consent.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-grid border-border/70 border-b">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-24">
            <div className="flex flex-col items-start gap-6">
              <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
                Adaptive trust-based attendance
              </p>
              <h1 className="font-display text-5xl leading-[1.04] tracking-tight text-balance sm:text-6xl">
                Attendance that holds up under audit.
              </h1>
              <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
                Sannidhi replaces the roll call. Students check in with a passkey in seconds, the
                risk engine asks for more proof only when evidence is thin, and every decision
                lands in a tamper-evident ledger.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/login">Sign in with a passkey</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/request-access">Request institution access</Link>
                </Button>
              </div>
              <p className="text-muted-foreground/80 font-mono text-xs tracking-[0.1em] uppercase">
                No passwords · No shared secrets · No blind trust
              </p>
            </div>
            <LiveSessionDemo />
          </div>
        </section>

        {/* Verdict band */}
        <section className="border-border/70 border-b">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="flex max-w-2xl flex-col gap-3">
              <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
                Four verdicts, one honest record.
              </h2>
              <p className="text-muted-foreground">
                Every check-in attempt is judged on evidence — identity, device, and physical
                presence — never on trust alone.
              </p>
            </div>
            <ul className="mt-10 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
              {VERDICTS.map((item) => (
                <li key={item.verdict} className="bg-card flex flex-col gap-3 p-5">
                  <VerdictStamp verdict={item.verdict} />
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-border/70 scroll-mt-16 border-b">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="flex max-w-2xl flex-col gap-3">
              <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
                How it works
              </p>
              <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
                From roll call to record in three steps.
              </h2>
            </div>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.number} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md font-mono text-sm font-semibold">
                      {step.number}
                    </span>
                    <div className="border-border/70 h-px flex-1 border-t border-dashed" />
                  </div>
                  <h3 className="font-display text-xl tracking-tight">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Role panels */}
        <section id="panels" className="border-border/70 scroll-mt-16 border-b">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="flex max-w-2xl flex-col gap-3">
              <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
                Role panels
              </p>
              <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
                One ecosystem. Four ways in.
              </h2>
              <p className="text-muted-foreground">
                Every role gets its own surface with exactly the powers it needs — and nothing
                more. Demo access lets you walk each one with seeded data.
              </p>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border/70 md:grid-cols-2">
              {PANELS.map((panel, index) => (
                <Link
                  key={panel.eyebrow}
                  href={panel.href}
                  className="group hover:bg-accent relative flex flex-col gap-4 bg-card p-6 transition-colors focus-visible:bg-accent focus-visible:outline-none sm:p-8"
                >
                  <span
                    className="absolute top-6 right-6 font-mono text-[11px] text-muted-foreground/60 sm:top-8 sm:right-8"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.16em] uppercase">
                    {panel.eyebrow}
                  </p>
                  <h3 className="font-display text-2xl tracking-tight">{panel.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {panel.description}
                  </p>
                  <ul className="mt-1 flex flex-col gap-2">
                    {panel.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm">
                        <span
                          className="border-border bg-background mt-1 size-1.5 shrink-0 rounded-full border"
                          aria-hidden="true"
                        />
                        <span className="text-muted-foreground">{point}</span>
                      </li>
                    ))}
                  </ul>
                  <span className="text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
                    {panel.cta}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Trust model */}
        <section id="trust" className="border-border/70 scroll-mt-16 border-b">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div className="flex max-w-md flex-col gap-3">
              <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
                Trust model
              </p>
              <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
                Trust is earned per check-in.
              </h2>
              <p className="text-muted-foreground">
                Sannidhi never assumes a face, a phone, or a QR screenshot is enough on its own.
                Signals are fused, decisions are explained, and the evidence is kept.
              </p>
            </div>
            <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {TRUST.map((item) => (
                <div key={item.title} className="flex flex-col gap-2 border-t pt-4">
                  <dt className="font-display text-lg tracking-tight">{item.title}</dt>
                  <dd className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-xl flex-col gap-2">
              <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
                Bring honest attendance to your institution.
              </h2>
              <p className="text-primary-foreground/80">
                Tell us about your campus and we will set up your departments, courses, and
                policies — then invite your people.
              </p>
            </div>
            <Button
              size="lg"
              variant="secondary"
              asChild
              className="bg-background text-foreground hover:bg-background/90"
            >
              <Link href="/request-access">
                Request access
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
