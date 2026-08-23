import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function AuditEventsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Event ledger</h1>
        <p className="text-muted-foreground text-sm">Append-only attendance event history.</p>
      </div>
      <EmptyState
        icon={ScrollText}
        title="Event ledger"
        description="The append-only ledger viewer arrives in Phase 3."
      />
    </div>
  );
}
