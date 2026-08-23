import Link from "next/link";

import { ImpersonationButtons } from "@/app/(auth)/login/impersonation-buttons";
import { PasskeyLoginButton } from "@/app/(auth)/login/passkey-login-button";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";

export default function LoginPage() {
  const devLoginEnabled = isDevLoginEnabled();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Use the passkey registered to your Sannidhi account — no passwords, no shared secrets.
        </p>
      </div>
      <PasskeyLoginButton />
      <div className="flex flex-col items-center gap-3">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">Dev exploration</p>
        {devLoginEnabled ? (
          <ImpersonationButtons enabled={devLoginEnabled} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Dev impersonation is disabled (set ENABLE_DEV_LOGIN=1 to turn it on).
          </p>
        )}
      </div>
      <Link href="/" className="text-primary text-sm underline-offset-4 hover:underline">
        Back to home
      </Link>
    </main>
  );
}
