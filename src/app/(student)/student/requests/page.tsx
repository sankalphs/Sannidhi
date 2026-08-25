import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { LockedEmptyState } from "@/components/shell/locked-empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { loadMissingEnrollmentSteps } from "@/lib/enrollment/load";

import { RequestsManager } from "./requests-manager";

export const dynamic = "force-dynamic";

async function loadActorToken(): Promise<string | null> {
  try {
    const session = await getActiveSession();
    if (session === null) return null;
    return await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
  } catch {
    return null;
  }
}

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
        <RequestsLoader />
      )}
    </div>
  );
}

async function RequestsLoader() {
  const actorToken = await loadActorToken();
  if (actorToken === null) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Could not load requests"
        description="Something went wrong while loading your requests. Please refresh the page and try again."
      />
    );
  }
  return <RequestsManager actorToken={actorToken} />;
}
