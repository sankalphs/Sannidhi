import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

const FRESH_AUTH_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (session === null) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const oldDeviceId = body.deviceId;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (typeof oldDeviceId !== "string" || oldDeviceId.length === 0) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  if (reason.length === 0 || reason.length > 500) {
    return NextResponse.json({ error: "reason required (1-500 characters)" }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });

    if (session.role !== "admin") {
      const fresh = (await client.query(api.sessions.getSessionFreshAuth, { actorToken })) as {
        lastSeenAt: number | null;
      };
      const freshAuth =
        fresh.lastSeenAt !== null && Date.now() - fresh.lastSeenAt <= FRESH_AUTH_WINDOW_MS;
      if (!freshAuth) {
        return NextResponse.json(
          { error: "identity re-verification required", code: "step-up-required" },
          { status: 403 },
        );
      }
    }

    const result = await client.mutation(api.devices.requestReplacement, {
      actorToken,
      oldDeviceId: oldDeviceId as Id<"devices">,
      reason,
      identityReverified: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replacement request failed";
    return NextResponse.json(
      { error: message },
      { status: message.includes("unauthorized") ? 403 : 400 },
    );
  }
}
