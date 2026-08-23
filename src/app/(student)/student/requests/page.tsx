import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function StudentRequestsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="text-muted-foreground text-sm">Leave, on-duty, and corrections.</p>
      </div>
      <EmptyState
        icon={ClipboardList}
        title="Requests"
        description="Leave, on-duty, and correction requests arrive in Phase 2."
      />
    </div>
  );
}
