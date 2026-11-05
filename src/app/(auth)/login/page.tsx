import Link from "next/link";

import { PersonaPicker } from "@/app/(auth)/login/impersonation-buttons";
import { LoginMethods } from "@/app/(auth)/login/login-methods";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";
import { ROLES, type Role } from "@/lib/auth/session";

function parseHighlightRole(value: string | string[] | undefined): Role | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  return ROLES.includes(raw as Role) ? (raw as Role) : null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string | string[] }>;
}) {
  const { as } = await searchParams;
  const highlightRole = parseHighlightRole(as);
  const devLoginEnabled = isDevLoginEnabled();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center sm:text-left">
        <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
          Welcome back
        </p>
        <h1 className="font-display text-4xl tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Prefer a passkey for phishing-resistant sign-in — or fall back to your USN/email and
          password on shared devices.
        </p>
      </div>

      <LoginMethods />

      {devLoginEnabled ? (
        <div className="flex flex-col gap-3" data-testid="dev-login">
          <div className="flex items-center gap-3">
            <div className="border-border/70 h-px flex-1 border-t" />
            <span className="text-muted-foreground font-mono text-[11px] tracking-[0.14em] uppercase">
              Development sign-in
            </span>
            <div className="border-border/70 h-px flex-1 border-t" />
          </div>
          <p className="text-muted-foreground text-sm">
            Switch roles against the local test fixtures. Never available in production.
          </p>
          <PersonaPicker highlightRole={highlightRole} />
        </div>
      ) : null}

      <p className="text-muted-foreground text-sm">
        Invited by your institution? Open the link from your invite email to activate your passkey.
      </p>

      <p className="text-muted-foreground text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="hover:text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </p>

      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
