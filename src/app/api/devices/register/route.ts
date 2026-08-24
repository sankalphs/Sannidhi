import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import { deviceErrorResponse } from "@/lib/api/device-errors";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (session === null || session.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (label.length === 0 || label.length > 80) {
    return NextResponse.json({ error: "label required (1-80 characters)" }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });
    const result = await client.mutation(api.devices.registerDevice, {
      actorToken,
      label,
      platform: request.headers.get("user-agent")?.slice(0, 120),
    });
    return NextResponse.json(result);
  } catch (error) {
    return deviceErrorResponse("register", error);
  }
}
