import { MailCheck } from "lucide-react";
import Link from "next/link";

/**
 * Where signup lands an account that still needs its invite passkey. The
 * signup route adds `?created=1`; reached any other way, the copy stays
 * generic instead of claiming an account was just created.
 */
export default async function SignupPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const justCreated = created === "1";

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <MailCheck className="size-8" />
      </div>
      <h1 className="text-xl font-semibold" data-testid="signup-pending-title">
        {justCreated ? "Account created — one step left" : "Finish activating your account"}
      </h1>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
        {justCreated
          ? "Your password is set, but the account activates when you finish the invite link it was issued for: open it and register a passkey. Until then you cannot sign in."
          : "New accounts activate through the invite link your institution issued: open it and register a passkey. Until then you cannot sign in."}
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
