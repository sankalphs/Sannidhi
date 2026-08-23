import Link from "next/link";

import { ImpersonationButtons } from "@/app/(auth)/login/impersonation-buttons";

export default function LoginPage() {
  const devLoginEnabled = process.env.ENABLE_DEV_LOGIN === "1";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Authentication arrives in Phase 1 — passkey ceremonies will land here. For now you can
          explore each surface with a stubbed dev session.
        </p>
      </div>
      {devLoginEnabled ? (
        <ImpersonationButtons enabled={devLoginEnabled} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Dev impersonation is disabled (set ENABLE_DEV_LOGIN=1 to turn it on).
        </p>
      )}
      <Link href="/" className="text-primary text-sm underline-offset-4 hover:underline">
        Back to home
      </Link>
    </main>
  );
}
