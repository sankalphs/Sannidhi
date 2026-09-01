import { MailCheck } from "lucide-react";
import Link from "next/link";

export default function SignupPendingPage() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <MailCheck className="size-8" />
      </div>
      <h1 className="text-xl font-semibold" data-testid="signup-pending-title">
        Account created — one step left
      </h1>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        Your password is set, but the account activates when you finish the invite link it was
        issued for: open it and register a passkey. Until then you cannot sign in.
      </p>
      <Link
        href="/login"
        className="text-primary text-sm underline underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
