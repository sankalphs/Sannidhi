import { NextResponse } from "next/server";

import { api } from "../../../../../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { errorResponse, readJsonBody, unauthorized } from "@/lib/auth/http";
import { getActiveSession, setSessionCookie } from "@/lib/auth/server";
import { ROLE_TO_HOME, signSession } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const session = await getActiveSession({ allowEnrollment: true });
  if (session === null) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null || typeof body.response !== "object" || body.response === null) {
    return NextResponse.json({ error: "Missing ceremony response" }, { status: 400 });
  }

  try {
    const actorToken = await mintActorToken({ userId: session.userId, role: session.role });
    const result = await getConvexClient().action(api.passkeys.registerVerify, {
      actorToken,
      response: body.response,
    });

    const token = await signSession({
      userId: result.userId,
      role: result.role,
      sid: result.sid,
    });
    await setSessionCookie(token);
    return NextResponse.json({
      ok: true,
      userId: result.userId,
      role: result.role,
      redirect: ROLE_TO_HOME[result.role],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
