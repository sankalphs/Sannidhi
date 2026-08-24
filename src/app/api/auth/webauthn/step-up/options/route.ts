import { NextResponse } from "next/server";

import { api } from "../../../../../../../convex/_generated/api";
import type { SessionPayload } from "@/lib/auth/session";
import { mintActorToken } from "@/lib/auth/actor-token";
import { errorResponse } from "@/lib/auth/http";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST() {
  const session = await getActiveSession();
  if (session === null || session.sid === undefined) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });
    const options = await getConvexClient().action(api.stepup.stepUpOptions, { actorToken });
    return NextResponse.json(options);
  } catch (error) {
    return errorResponse(error);
  }
}

export type StepUpSession = SessionPayload;
