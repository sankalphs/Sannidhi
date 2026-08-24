import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function AuditEventsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Auditor panel"
        title="Event ledger"
        description="Append-only attendance event history."
      />
      <EmptyState
        icon={ScrollText}
        title="Event ledger"
        description="The append-only ledger viewer arrives in Phase 3."
      />
    </div>
  );
}
