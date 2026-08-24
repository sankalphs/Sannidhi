import { Lock } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { buttonVariants } from "@/components/ui/button";
import type { MissingEnrollmentStep } from "@/lib/enrollment/gate";
import { missingStepCopy } from "@/lib/enrollment/ui";

export function LockedEmptyState({ missingSteps }: { missingSteps: MissingEnrollmentStep[] }) {
  return (
    <EmptyState
      icon={Lock}
      title="Enrollment incomplete"
      description="Attendance features stay locked until every enrollment step below is complete."
      action={
        <div className="flex flex-col items-center gap-3">
          <ul className="text-muted-foreground space-y-1 text-left text-sm">
            {missingSteps.map((step) => (
              <li key={step}>{missingStepCopy(step)}</li>
            ))}
          </ul>
          <Link href="/student/devices" className={buttonVariants()}>
            Finish enrollment on your devices page
          </Link>
        </div>
      }
    />
  );
}
