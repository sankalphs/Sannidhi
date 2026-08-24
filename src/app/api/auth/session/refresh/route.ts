import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { api } from "../../../../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { setSessionCookie } from "@/lib/auth/server";
import {
  COOKIE_NAME,
  isEnrollmentSession,
  signSession,
  verifySession,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token === undefined) {
    return NextResponse.json({ ok: true, refreshed: false });
  }

  const parsed = await verifySession(token);
  if (parsed === null || isEnrollmentSession(parsed) || parsed.sid === undefined) {
    return NextResponse.json({ ok: true, refreshed: false });
  }

  try {
    const actorToken = await mintActorToken({
      userId: parsed.userId,
      role: parsed.role,
      sid: parsed.sid,
    });
    const client = getConvexClient();
    const status = await client.query(api.sessions.getSessionStatus, { actorToken });
    if (status.active !== true || status.expiresAt === null) {
      return NextResponse.json({ ok: true, refreshed: false });
    }
    if (status.expiresAt - Date.now() >= REFRESH_WINDOW_MS) {
      return NextResponse.json({ ok: true, refreshed: false });
    }

    const renewed = await client.mutation(api.sessions.renewMySession, { actorToken });
    if (!renewed.renewed) {
      return NextResponse.json({ ok: true, refreshed: false });
    }

    const freshToken = await signSession(
      { userId: parsed.userId, role: parsed.role, sid: parsed.sid },
      { expiresIn: `${SESSION_TTL_SECONDS}s` },
    );
    await setSessionCookie(freshToken);
    return NextResponse.json({ ok: true, refreshed: true, expiresAt: renewed.expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh failed";
    if (/secret|token/i.test(message) && /invalid|missing/i.test(message)) {
      return NextResponse.json({ ok: true, refreshed: false });
    }
    throw error;
  }
}
