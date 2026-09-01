import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import { validateFaceEmbedding } from "@/lib/enrollment/face-template";
import { convexRouteErrorResponse } from "@/lib/api/route-errors";

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

  if (action === "enroll-face") {
    if (body.consentAcknowledged !== true) {
      return NextResponse.json({ error: "consent_not_acknowledged" }, { status: 400 });
    }
    if (validateFaceEmbedding(body.embedding) !== null) {
      return NextResponse.json({ error: "invalid_embedding" }, { status: 400 });
    }
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
    // Consent is only ever auto-recorded for requests that carried an explicit
    // consentAcknowledged flag; an active record is reused as-is.
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
    return convexRouteErrorResponse(
      "biometrics",
      error,
      "Biometric action failed. Please try again.",
    );
  }
}
