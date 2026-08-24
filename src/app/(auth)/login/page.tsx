import Link from "next/link";

import { PersonaPicker } from "@/app/(auth)/login/impersonation-buttons";
import { PasskeyLoginButton } from "@/app/(auth)/login/passkey-login-button";
import { isDemoLoginEnabled } from "@/lib/auth/dev-login";
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
  const demoLoginEnabled = isDemoLoginEnabled();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center sm:text-left">
        <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
          Welcome back
        </p>
        <h1 className="font-display text-4xl tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Use the passkey registered to your Sannidhi account — no passwords, no shared secrets.
        </p>
      </div>

      <PasskeyLoginButton />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="border-border/70 h-px flex-1 border-t" />
          <span className="text-muted-foreground font-mono text-[11px] tracking-[0.14em] uppercase">
            Demo access
          </span>
          <div className="border-border/70 h-px flex-1 border-t" />
        </div>
        {demoLoginEnabled ? (
          <>
            <p className="text-muted-foreground text-sm">
              Explore any panel with seeded data — sessions, check-ins, and history are preloaded
              for this deployment.
            </p>
            <PersonaPicker highlightRole={highlightRole} />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Demo access is disabled on this deployment. Set <code>ENABLE_DEMO_LOGIN=1</code> to turn
            it on.
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-sm">
        Invited by your institution? Open the link from your invite email to activate your passkey.
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
