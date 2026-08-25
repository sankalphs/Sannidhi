import { Landmark } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function AdminPoliciesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Admin" title="Policies" description="Thresholds and step-up rules." />
      <EmptyState
        icon={Landmark}
        title="Policies"
        description="Institution policy configuration arrives in a later phase."
      />
    </div>
  );
}
