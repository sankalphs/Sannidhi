import { NextResponse } from "next/server";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { deviceErrorResponse } from "@/lib/api/device-errors";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (session === null || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestId = body.requestId;
  const decision = body.decision;
  if (typeof requestId !== "string" || requestId.length === 0) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });
    const result = await client.mutation(api.devices.decideReplacement, {
      actorToken,
      requestId: requestId as Id<"replacement_requests">,
      decision,
    });
    return NextResponse.json(result);
  } catch (error) {
    return deviceErrorResponse("admin-replacement-decision", error);
  }
}
