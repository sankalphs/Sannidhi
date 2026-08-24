import { NextResponse } from "next/server";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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

  const action = body.action;
  if (action !== "verify" && action !== "verify-successor" && action !== "activate") {
    return NextResponse.json(
      { error: "action must be verify, verify-successor or activate" },
      { status: 400 },
    );
  }
  const deviceId = body.deviceId;
  if (typeof deviceId !== "string" || deviceId.length === 0) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });
    const args = { actorToken, deviceId: deviceId as Id<"devices"> };
    if (action === "verify") {
      const code = typeof body.code === "string" ? body.code : "";
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: "code must be six digits" }, { status: 400 });
      }
      const result = await client.mutation(api.devices.verifyPossession, { ...args, code });
      return NextResponse.json(result);
    }
    if (action === "verify-successor") {
      const fresh = (await client.query(api.sessions.getSessionFreshAuth, { actorToken })) as {
        lastSeenAt: number | null;
      };
      const freshAuth =
        fresh.lastSeenAt !== null && Date.now() - fresh.lastSeenAt <= FRESH_AUTH_WINDOW_MS;
      if (!freshAuth && session.role !== "admin") {
        return NextResponse.json(
          { error: "identity re-verification required", code: "step-up-required" },
          { status: 403 },
        );
      }
      const result = await client.mutation(api.devices.verifySuccessorDevice, {
        ...args,
        identityReverified: true,
      });
      return NextResponse.json(result);
    }
    const result = await client.mutation(api.devices.activateDevice, args);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Device action failed";
    return NextResponse.json(
      { error: message },
      { status: message.includes("unauthorized") ? 403 : 400 },
    );
  }
}
