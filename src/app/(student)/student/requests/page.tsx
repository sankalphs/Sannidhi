import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { LockedEmptyState } from "@/components/shell/locked-empty-state";
import { loadMissingEnrollmentSteps } from "@/lib/enrollment/load";

export const dynamic = "force-dynamic";

export default async function StudentRequestsPage() {
  const missingSteps = await loadMissingEnrollmentSteps();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="text-muted-foreground text-sm">Corrections, exemptions and on-duty.</p>
      </div>
      {missingSteps.length > 0 ? (
        <LockedEmptyState missingSteps={missingSteps} />
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Requests"
          description="Correction and exemption requests you file will show up here."
        />
      )}
    </div>
  );
}
