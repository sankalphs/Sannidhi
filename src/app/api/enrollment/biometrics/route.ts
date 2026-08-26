import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import { validateFaceEmbedding } from "@/lib/enrollment/face-template";

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
  if (action !== "enroll-face" && action !== "withdraw") {
    return NextResponse.json({ error: "action must be enroll-face or withdraw" }, { status: 400 });
  }

  if (action === "enroll-face" && validateFaceEmbedding(body.embedding) !== null) {
    return NextResponse.json({ error: "invalid_embedding" }, { status: 400 });
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
    // One-click enrollment stays legal because consent is recorded here first
    // whenever no active one exists; an active record is reused as-is.
    const current = await client.query(api.enrollment.getMyBiometricRecord, { actorToken });
    if (current === null || current.withdrawnAt !== null) {
      await client.mutation(api.enrollment.recordBiometricConsent, { actorToken });
    }
    await client.mutation(api.enrollment.enrollFaceTemplate, {
      actorToken,
      embedding: body.embedding as number[],
    });
    const record = await client.query(api.enrollment.getMyBiometricRecord, { actorToken });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Biometric action failed";
    return NextResponse.json(
      { error: message },
      { status: message.includes("unauthorized") ? 403 : 400 },
    );
  }
}
