import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { SESSION_COOKIE_OPTIONS, getActiveSession, getSessionExpiresAt } from "@/lib/auth/server";
import { COOKIE_NAME, isEnrollmentSession, verifySession } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

export async function GET() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token === undefined) {
    return NextResponse.json({ authenticated: false });
  }

  const parsed = await verifySession(token);
  if (parsed === null) {
    return NextResponse.json({ authenticated: false });
  }

  if (isEnrollmentSession(parsed)) {
    return NextResponse.json({
      authenticated: false,
      enrollment: true,
      role: parsed.role,
      userId: parsed.userId,
    });
  }

  try {
    const session = await getActiveSession();
    if (session === null) {
      return NextResponse.json({ authenticated: false });
    }
    const expiresAt = await getSessionExpiresAt(session);
    return NextResponse.json({
      authenticated: true,
      role: session.role,
      userId: session.userId,
      expiresAt,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

export async function DELETE() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;

  let revocationFailed = false;
  if (token !== undefined) {
    const parsed = await verifySession(token);
    if (parsed !== null && !isEnrollmentSession(parsed) && parsed.sid !== undefined) {
      try {
        const actorToken = await mintActorToken({
          userId: parsed.userId,
          role: parsed.role,
          sid: parsed.sid,
        });
        await getConvexClient().mutation(api.sessions.revokeMySession, { actorToken });
      } catch {
        revocationFailed = true;
      }
    }
  }

  store.set(COOKIE_NAME, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  if (revocationFailed) {
    return NextResponse.json(
      { ok: false, error: "Server-side sign-out incomplete" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
