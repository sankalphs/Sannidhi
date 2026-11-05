import { api } from "../../../../convex/_generated/api";
import { CalendarDays, Presentation } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getCachedConvexClient } from "@/lib/convex/server-client";

import { ReviewQueue } from "./review-queue";
import { ScheduleList, type ScheduleRow } from "./sessions/schedule-list";

export const dynamic = "force-dynamic";

async function loadSchedule(actorToken: string): Promise<ScheduleRow[] | null> {
  try {
    return await getCachedConvexClient().query(api.classSessions.listMySchedule, { actorToken });
  } catch (cause) {
    console.error("[faculty-dashboard] schedule query failed", cause);
    return null;
  }
}

export default async function FacultyPage() {
  const session = await getActiveSession();
  const actorToken =
    session === null
      ? null
      : await mintActorToken({
          userId: session.userId,
          role: session.role,
          ...(session.sid !== undefined ? { sid: session.sid } : {}),
        });
  const schedule = actorToken === null ? null : await loadSchedule(actorToken);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Faculty panel"
        title="Faculty dashboard"
        description="Run and review your class sessions."
      />
      {actorToken === null ? (
        <EmptyState
          icon={Presentation}
          title="Sign in required"
          description="Sign in with your passkey to see today's classes and your review queue."
        />
      ) : (
        <>
          {schedule === null ? (
            <EmptyState
              icon={CalendarDays}
              title="Could not load your schedule"
              description="Something went wrong while loading your timetable. Please refresh the page and try again."
            />
          ) : (
            <ScheduleList actorToken={actorToken} initialRows={schedule} />
          )}
          <ReviewQueue actorToken={actorToken} />
        </>
      )}
    </div>
  );
}
