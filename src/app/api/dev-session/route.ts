import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_NAME, ROLES, signSession, type Role } from "@/lib/auth/session";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.ENABLE_DEV_LOGIN !== "1") return notFound();
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
  const token = await signSession({ userId: `dev-${role}`, role: role as Role });
  const store = await cookies();
  store.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", path: "/" });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (process.env.ENABLE_DEV_LOGIN !== "1") return notFound();
  const store = await cookies();
  store.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
