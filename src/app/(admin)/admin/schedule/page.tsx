import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { CalendarClock } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

import { TimetableManager } from "./timetable-manager";
import { VenueManager } from "./venue-manager";

type ScheduleOverview = FunctionReturnType<typeof api.schedule.getScheduleOverview>;

export default async function AdminSchedulePage() {
  const session = await getActiveSession();
  if (session === null || session.role !== "admin") {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Administration access required"
        description="Venues and the timetable are managed by institution administrators."
      />
    );
  }

  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });

  let overview: ScheduleOverview | null = null;
  try {
    overview = await getConvexClient().query(api.schedule.getScheduleOverview, { actorToken });
  } catch {
    overview = null;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Venues & timetable"
        description="Where classes meet and when. Faculty start sessions from these slots, and the presence check measures against each venue's geofence."
      />
      {overview === null ? (
        <EmptyState
          icon={CalendarClock}
          title="Schedule unavailable"
          description="The schedule could not be loaded. Refresh the page to try again."
        />
      ) : (
        <>
          <VenueManager actorToken={actorToken} venues={overview.venues} />
          <TimetableManager
            actorToken={actorToken}
            slots={overview.slots}
            sections={overview.sections}
            venues={overview.venues.map((venue) => ({ id: venue.id, name: venue.name }))}
            faculty={overview.faculty}
          />
        </>
      )}
    </div>
  );
}
