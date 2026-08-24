import { api } from "../../../../../convex/_generated/api";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getCachedConvexClient } from "@/lib/convex/server-client";

import { ScheduleList } from "./schedule-list";

export const dynamic = "force-dynamic";

export default async function FacultySessionsPage() {
  const session = await getActiveSession();
  if (session === null) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Sign in required"
        description="Sign in with your passkey to view and run your class sessions."
      />
    );
  }

  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });

  let rows;
  try {
    rows = await getCachedConvexClient().query(api.classSessions.listMySchedule, { actorToken });
  } catch (cause) {
    console.error("[faculty-sessions] schedule query failed", cause);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Faculty panel"
          title="Class sessions"
          description="Start, monitor, and close your class sessions."
        />
        <EmptyState
          icon={CalendarDays}
          title="Could not load your schedule"
          description="Something went wrong while loading your timetable. Please refresh the page and try again."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Faculty panel"
        title="Class sessions"
        description="Start, monitor, and close your class sessions."
      />
      <ScheduleList actorToken={actorToken} initialRows={rows} />
    </div>
  );
}
