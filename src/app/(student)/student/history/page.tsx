import { api } from "../../../../../convex/_generated/api";
import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { LockedEmptyState } from "@/components/shell/locked-empty-state";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import type { MissingEnrollmentStep } from "@/lib/enrollment/gate";
import { ENROLLMENT_STEPS } from "@/lib/enrollment/ui";

export const dynamic = "force-dynamic";

export default async function StudentHistoryPage() {
  const session = await getActiveSession();

  let missingSteps: MissingEnrollmentStep[] = [...ENROLLMENT_STEPS];
  if (session !== null) {
    try {
      const client = getConvexClient();
      const actorToken = await mintActorToken({
        userId: session.userId,
        role: session.role,
        ...(session.sid !== undefined ? { sid: session.sid } : {}),
      });
      const status = await client.query(api.enrollment.getMyEnrollmentStatus, { actorToken });
      missingSteps = status.locked ? [...status.missingSteps] : [];
    } catch {
      missingSteps = [...ENROLLMENT_STEPS];
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance history</h1>
        <p className="text-muted-foreground text-sm">Calendar and subject-wise views.</p>
      </div>
      {missingSteps.length > 0 ? (
        <LockedEmptyState missingSteps={missingSteps} />
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Attendance history"
          description="Calendar and subject-wise attendance views arrive with sessions in Phase 2."
        />
      )}
    </div>
  );
}
