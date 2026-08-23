import { ShieldX } from "lucide-react";
import Link from "next/link";

import { api } from "../../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex/server-client";

import { PasskeyEnrollmentStep } from "./passkey-enrollment-step";

const REASON_COPY: Record<string, string> = {
  not_found: "This invite link is not valid.",
  accepted: "This invite has already been used.",
  revoked: "This invite was revoked by your institution.",
  expired: "This invite has expired. Ask your administrator to send a new one.",
};

function formatRole(role: string): string {
  return role.replace("_", " ");
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function InviteRedemptionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const client = getConvexClient();
  const result = await client.query(api.invites.validateInviteToken, { token }).catch(() => null);

  if (result === null || result.valid === false) {
    const reason = result !== null ? REASON_COPY[result.reason] : undefined;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="bg-card flex max-w-md flex-col items-center gap-3 rounded-xl border p-8">
          <ShieldX className="text-destructive size-8" />
          <h1 className="text-xl font-semibold tracking-tight">Invite unavailable</h1>
          <p className="text-muted-foreground text-sm">
            {reason ?? "This invite link could not be verified."}
          </p>
          <Link href="/" className="text-primary text-sm underline-offset-4 hover:underline">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="bg-card flex w-full max-w-md flex-col gap-5 rounded-xl border p-8">
        <div className="flex flex-col gap-1 text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {result.institutionName ?? "Your institution"} invites you
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Activate your account</h1>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border p-4 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate font-mono text-xs">{result.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>{formatRole(result.role)}</dd>
          <dt className="text-muted-foreground">Link expires</dt>
          <dd>{formatDate(result.expiresAt)}</dd>
        </dl>

        <p className="text-muted-foreground text-sm">
          Set up your passkey to activate your account. Your passkey stays on your device — no
          passwords, no shared secrets.
        </p>

        <PasskeyEnrollmentStep token={token} />
      </div>
    </main>
  );
}
