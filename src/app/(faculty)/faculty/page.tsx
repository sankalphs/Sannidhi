import { Presentation } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";

import { ReviewQueue } from "./review-queue";

export const dynamic = "force-dynamic";

export default async function FacultyPage() {
  const session = await getActiveSession();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Faculty panel"
        title="Faculty dashboard"
        description="Run and review your class sessions."
      />
      {session === null ? (
        <EmptyState
          icon={Presentation}
          title="Sign in required"
          description="Sign in with your passkey to view and run your class sessions."
        />
      ) : (
        <ReviewQueue
          actorToken={await mintActorToken({
            userId: session.userId,
            role: session.role,
            ...(session.sid !== undefined ? { sid: session.sid } : {}),
          })}
        />
      )}
    </div>
  );
}
