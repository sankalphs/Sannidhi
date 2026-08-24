import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

export async function PATCH(request: Request) {
  const session = await getActiveSession({ allowEnrollment: false });
  if (session === null || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { requestId?: unknown };
  try {
    body = (await request.json()) as { requestId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.requestId !== "string") {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  try {
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
    await getConvexClient().mutation(api.accessRequests.markReviewed, {
      actorToken,
      requestId: body.requestId as Id<"access_requests">,
    });
  } catch (error) {
    if (error instanceof ConvexError && error.data === "unauthorized") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.warn("access-requests: mark reviewed failed", error);
    return NextResponse.json({ error: "Could not update the request." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
