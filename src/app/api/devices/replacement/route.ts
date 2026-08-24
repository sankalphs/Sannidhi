import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { deviceErrorResponse } from "@/lib/api/device-errors";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { isFreshAuth, REPLACEMENT_REASON_MAX_LENGTH } from "@/lib/devices/replacement";
import { getConvexClient } from "@/lib/convex/server-client";

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
  if (reason.length === 0 || reason.length > REPLACEMENT_REASON_MAX_LENGTH) {
    return NextResponse.json(
      { error: `reason required (1-${REPLACEMENT_REASON_MAX_LENGTH} characters)` },
      { status: 400 },
    );
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });

    if (session.role !== "admin") {
      const stepUp = (await client.query(api.sessions.getSessionStepUpStatus, {
        actorToken,
      })) as { lastStepUpAt: number | null };
      if (!isFreshAuth(stepUp.lastStepUpAt ?? undefined, Date.now())) {
        return NextResponse.json(
          { error: "Identity re-verification required.", code: "step-up-required" },
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
    return deviceErrorResponse("replacement", error);
  }
}
