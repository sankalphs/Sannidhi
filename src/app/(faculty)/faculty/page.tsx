import { Presentation } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
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
      <EmptyState
        icon={Presentation}
        title="No active session"
        description="Start one from your timetable when class begins — the rotating QR and live verification board take over from there."
        action={
          <Link href="/faculty/sessions" className={buttonVariants({ size: "sm" })}>
            Open class sessions
          </Link>
        }
      />
      {session !== null ? (
        <ReviewQueue
          actorToken={await mintActorToken({
            userId: session.userId,
            role: session.role,
            ...(session.sid !== undefined ? { sid: session.sid } : {}),
          })}
        />
      ) : null}
    </div>
  );
}
