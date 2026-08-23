import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit dashboard</h1>
        <p className="text-muted-foreground text-sm">Read-only visibility into system events.</p>
      </div>
      <EmptyState
        icon={ScrollText}
        title="Event ledger"
        description="An append-only trail of attendance decisions and administrative actions will stream in here."
      />
    </div>
  );
}
