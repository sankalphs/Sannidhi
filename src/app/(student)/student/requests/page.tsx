import { api } from "../../../../../convex/_generated/api";
import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { LockedEmptyState } from "@/components/shell/locked-empty-state";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import type { MissingEnrollmentStep } from "@/lib/enrollment/gate";
import { ENROLLMENT_STEPS } from "@/lib/enrollment/ui";

export const dynamic = "force-dynamic";

export default async function StudentRequestsPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="text-muted-foreground text-sm">Leave, on-duty, and corrections.</p>
      </div>
      {missingSteps.length > 0 ? (
        <LockedEmptyState missingSteps={missingSteps} />
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Requests"
          description="Leave, on-duty, and correction requests arrive in Phase 2."
        />
      )}
    </div>
  );
}
