import { NextResponse } from "next/server";

import { api } from "../../../../../../convex/_generated/api";
import { errorResponse, readJsonBody } from "@/lib/auth/http";
import { setSessionCookie } from "@/lib/auth/server";
import { ENROLLMENT_SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const token = typeof body?.token === "string" ? body.token : undefined;
  if (token === undefined || token.trim().length === 0) {
    return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const result = await client.query(api.invites.validateInviteToken, { token });
    if (!result.valid || result.userId === null) {
      return NextResponse.json({ error: "Invite is not valid" }, { status: 403 });
    }

    const enrollmentToken = await signSession(
      { userId: result.userId, role: result.role, scope: "enrollment" },
      { expiresIn: `${ENROLLMENT_SESSION_TTL_SECONDS}s` },
    );
    await setSessionCookie(enrollmentToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
