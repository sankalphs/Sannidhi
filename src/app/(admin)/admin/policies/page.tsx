import { Landmark } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function AdminPoliciesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
        <p className="text-muted-foreground text-sm">Thresholds and step-up rules.</p>
      </div>
      <EmptyState
        icon={Landmark}
        title="Policies"
        description="Institution policy configuration arrives in Phase 5."
      />
    </div>
  );
}
