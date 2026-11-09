import { api } from "../../../../../convex/_generated/api";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

import { ReviewInbox } from "./review-inbox";

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const session = await getActiveSession();
  if (session === null || (session.role !== "admin" && session.role !== "department_authority")) {
    return (
      <EmptyState
        icon={Users}
        title="Administrator access required"
        description="The review inbox is visible to administrators and department authority."
      />
    );
  }

  const client = getConvexClient();
  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });
  const rows = await client.query(api.reviewAlerts.listReviewAlerts, { actorToken });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Review inbox"
        description="Early-warning alerts from the analytics scan. Human review before any action — never automatic punishment."
      />
      <ReviewInbox initialRows={rows} actorToken={actorToken} canScan={session.role === "admin"} />
    </div>
  );
}
