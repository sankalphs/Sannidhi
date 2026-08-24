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
      <div className="border-border bg-card flex flex-col items-center gap-4 rounded-xl border p-8 text-center">
        <span className="border-destructive/35 text-destructive bg-destructive/10 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium tracking-[0.12em] uppercase">
          <ShieldX className="size-3.5" />
          Invite unavailable
        </span>
        <h1 className="font-display text-2xl tracking-tight">This link does not check out.</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {reason ?? "This invite link could not be verified."}
        </p>
        <Link href="/" className="text-primary text-sm underline-offset-4 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3 text-center sm:text-left">
        <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
          {result.institutionName ?? "Your institution"} invites you
        </p>
        <h1 className="font-display text-4xl tracking-tight">Activate your account</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Set up your passkey to finish enrolling. Your passkey stays on your device — no passwords,
          no shared secrets.
        </p>
      </div>

      <dl className="border-border bg-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 rounded-xl border p-5 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate font-mono text-xs">{result.email}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd className="capitalize">{formatRole(result.role)}</dd>
        <dt className="text-muted-foreground">Link expires</dt>
        <dd className="font-mono text-xs">{formatDate(result.expiresAt)}</dd>
      </dl>

      <PasskeyEnrollmentStep token={token} />
    </div>
  );
}
