import { NextResponse } from "next/server";

import { api } from "../../../../../../../convex/_generated/api";
import { errorResponse, readJsonBody } from "@/lib/auth/http";
import { setSessionCookie } from "@/lib/auth/server";
import { ROLE_TO_HOME, signSession } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (body === null || typeof body.response !== "object" || body.response === null) {
    return NextResponse.json({ error: "Missing ceremony response" }, { status: 400 });
  }

  try {
    const result = await getConvexClient().action(api.passkeys.authenticateVerify, {
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
