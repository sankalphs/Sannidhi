import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
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

  const action = body.action;
  if (action !== "consent-and-enroll" && action !== "withdraw") {
    return NextResponse.json(
      { error: "action must be consent-and-enroll or withdraw" },
      { status: 400 },
    );
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
    if (action === "withdraw") {
      const result = await client.mutation(api.enrollment.withdrawBiometricConsent, { actorToken });
      return NextResponse.json(result);
    }
    await client.mutation(api.enrollment.recordBiometricConsent, { actorToken });
    const result = await client.mutation(api.enrollment.enrollFaceStub, { actorToken });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Biometric action failed";
    return NextResponse.json(
      { error: message },
      { status: message.includes("unauthorized") ? 403 : 400 },
    );
  }
}
