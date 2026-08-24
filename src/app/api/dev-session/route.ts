import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { api } from "../../../../convex/_generated/api";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";
import { COOKIE_NAME, ROLES, signSession, type Role } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function resolveDemoUserId(role: Role): Promise<string | null> {
  if (role !== "student" && role !== "faculty") return null;
  try {
    const actor = await getConvexClient().query(api.demo.getDemoActor, { role });
    return actor?.userId ?? null;
  } catch (error) {
    console.warn("dev-session: demo actor lookup failed", error);
    return null;
  }
}

export async function POST(request: Request) {
  if (!isDevLoginEnabled()) return notFound();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const role =
    typeof body === "object" && body !== null ? (body as { role?: unknown }).role : undefined;
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }
  const demoUserId = await resolveDemoUserId(role as Role);
  const token = await signSession({ userId: demoUserId ?? `dev-${role}`, role: role as Role });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!isDevLoginEnabled()) return notFound();
  const store = await cookies();
  store.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
