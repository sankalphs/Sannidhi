import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
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

  const action = body.action;
  if (action !== "suspend" && action !== "revoke" && action !== "activate") {
    return NextResponse.json(
      { error: "action must be suspend, revoke or activate" },
      { status: 400 },
    );
  }
  const deviceId = body.deviceId;
  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });
    const args = {
      actorToken,
      deviceId: deviceId as Id<"devices">,
      ...(reason !== undefined && reason.length > 0 ? { reason } : {}),
    };
    if (action === "suspend") {
      await client.mutation(api.devices.suspendDevice, args);
    } else if (action === "revoke") {
      await client.mutation(api.devices.revokeDevice, args);
    } else {
      await client.mutation(api.devices.adminActivateDevice, {
        actorToken,
        deviceId: deviceId as Id<"devices">,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return deviceErrorResponse(`admin:${action}`, error);
  }
}
