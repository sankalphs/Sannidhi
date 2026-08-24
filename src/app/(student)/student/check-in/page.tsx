import { api } from "../../../../../convex/_generated/api";
import { ScanLine } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { LockedEmptyState } from "@/components/shell/locked-empty-state";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import { loadMissingEnrollmentSteps } from "@/lib/enrollment/load";

import { CheckInPanel, type ActiveClassSession } from "./check-in-panel";

export const dynamic = "force-dynamic";

async function loadActiveSession(): Promise<{
  actorToken: string;
  active: ActiveClassSession | null;
} | null> {
  try {
    const session = await getActiveSession();
    if (session === null) return null;
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
    const active = await getConvexClient().query(api.checkin.getActiveForStudent, {
      actorToken,
    });
    return { actorToken, active };
  } catch (cause) {
    console.error("[student-check-in] could not load active session", cause);
    return null;
  }
}

export default async function StudentCheckInPage() {
  const missingSteps = await loadMissingEnrollmentSteps();

  if (missingSteps.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check in</h1>
          <p className="text-muted-foreground text-sm">Scan or paste the class check-in code.</p>
        </div>
        <LockedEmptyState missingSteps={missingSteps} />
      </div>
    );
  }

  const loaded = await loadActiveSession();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check in</h1>
        <p className="text-muted-foreground text-sm">Scan or paste the class check-in code.</p>
      </div>
      {loaded === null ? (
        <EmptyState
          icon={ScanLine}
          title="Could not load check-in"
          description="Something went wrong while preparing check-in. Please refresh the page and try again."
        />
      ) : (
        <CheckInPanel actorToken={loaded.actorToken} active={loaded.active} />
      )}
    </div>
  );
}
