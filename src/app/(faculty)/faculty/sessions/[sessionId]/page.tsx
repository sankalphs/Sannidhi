import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ScanLine } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getCachedConvexClient } from "@/lib/convex/server-client";

import { SessionControl } from "./session-control";

export const dynamic = "force-dynamic";

export default async function FacultySessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const session = await getActiveSession();
  if (session === null) {
    return (
      <EmptyState
        icon={ScanLine}
        title="Sign in required"
        description="Sign in with your passkey to manage class sessions."
      />
    );
  }

  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });

  let snapshot;
  try {
    snapshot = await getCachedConvexClient().query(api.classSessions.getBoard, {
      actorToken,
      sessionId: sessionId as Id<"class_sessions">,
    });
  } catch (cause) {
    console.error("[faculty-session] board query failed", cause);
    return (
      <EmptyState
        icon={ScanLine}
        title="Session not found"
        description="This session does not exist or you are not authorized to view it."
      />
    );
  }

  return (
    <SessionControl
      actorToken={actorToken}
      sessionId={sessionId as Id<"class_sessions">}
      initialSnapshot={snapshot}
    />
  );
}
