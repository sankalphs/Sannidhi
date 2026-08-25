import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";

import { LedgerEventsView } from "./ledger-events-view";

export const dynamic = "force-dynamic";

export default async function AuditEventsPage() {
  const session = await getActiveSession();
  if (session === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Auditor panel"
          title="Event ledger"
          description="Tamper-evident, append-only record of attendance decisions."
        />
        <EmptyState
          icon={ScrollText}
          title="Sign in required"
          description="Sign in with your passkey to inspect the event ledger."
        />
      </div>
    );
  }

  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });

  return <LedgerEventsView actorToken={actorToken} />;
}
