import { NextResponse } from "next/server";

import { api } from "../../../../../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { errorResponse, readJsonBody, unauthorized } from "@/lib/auth/http";
import { getActiveSession, setSessionCookie } from "@/lib/auth/server";
import { isEnrollmentSession, ROLE_TO_HOME, signSession } from "@/lib/auth/session";
import { isFreshAuth } from "@/lib/devices/replacement";
import { getConvexClient } from "@/lib/convex/server-client";

const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const session = await getActiveSession({ allowEnrollment: true });
  if (session === null) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null || typeof body.response !== "object" || body.response === null) {
    return NextResponse.json({ error: "Missing ceremony response" }, { status: 400 });
  }

  try {
    if (!isEnrollmentSession(session) && session.sid !== undefined) {
      const actorToken = await mintActorToken({
        userId: session.userId,
        role: session.role,
        sid: session.sid,
      });
      const stepUp = (await getConvexClient().query(api.sessions.getSessionStepUpStatus, {
        actorToken,
      })) as { lastStepUpAt: number | null };
      if (!isFreshAuth(stepUp.lastStepUpAt ?? undefined, Date.now(), STEP_UP_WINDOW_MS)) {
        return NextResponse.json(
          { error: "Identity re-verification required.", code: "step-up-required" },
          { status: 403 },
        );
      }
    }

    // The sid-carrying token lets the Convex action re-verify freshness and
    // suspension itself; enrollment sessions (no sid) are exempt by design.
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
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
