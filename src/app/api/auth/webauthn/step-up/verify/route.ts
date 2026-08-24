import { NextResponse } from "next/server";

import { api } from "../../../../../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { errorResponse, readJsonBody } from "@/lib/auth/http";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (session === null || session.sid === undefined) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonBody(request);
  if (body === null || typeof body.response !== "object" || body.response === null) {
    return NextResponse.json({ error: "Missing ceremony response" }, { status: 400 });
  }

  try {
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      sid: session.sid,
    });
    const result = await getConvexClient().action(api.stepup.stepUpVerify, {
      actorToken,
      response: body.response,
    });
    return NextResponse.json({ ok: true, verifiedAt: result.verifiedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
