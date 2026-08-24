import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { LockedEmptyState } from "@/components/shell/locked-empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { loadMissingEnrollmentSteps } from "@/lib/enrollment/load";

export const dynamic = "force-dynamic";

export default async function StudentRequestsPage() {
  const missingSteps = await loadMissingEnrollmentSteps();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Student panel"
        title="Requests"
        description="Corrections, exemptions and on-duty."
      />
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
