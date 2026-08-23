import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { mintActorToken } from "@/lib/auth/actor-token";
import { COOKIE_NAME, ROLES, verifySession, type Role } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";
import { EMAIL_PATTERN } from "@/lib/invites/csv";

type SessionPayload = NonNullable<Awaited<ReturnType<typeof verifySession>>>;

async function getAdminSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token === undefined) return null;
  const session = await verifySession(token);
  if (session === null || session.role !== "admin") return null;
  return session;
}

type InviteInput = { email?: unknown; name?: unknown; role?: unknown };

function parseInvites(value: unknown): { email: string; name: string; role: Role }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const invites: { email: string; name: string; role: Role }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { email, name, role } = item as InviteInput;
    if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) return null;
    if (typeof name !== "string" || name.trim().length === 0) return null;
    if (typeof role !== "string" || !ROLES.includes(role as Role)) return null;
    invites.push({ email: email.trim().toLowerCase(), name: name.trim(), role: role as Role });
  }
  return invites;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Invite request failed";
  const status = message.includes("unauthorized") ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (session === null) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const institutionId = body.institutionId;
  if (typeof institutionId !== "string" || institutionId.length === 0) {
    return NextResponse.json({ error: "Missing institutionId" }, { status: 400 });
  }

  const invites = parseInvites(body.invites ?? body.rows);
  if (invites === null) {
    return NextResponse.json(
      { error: "invites must be a non-empty array of {email, name, role}" },
      { status: 400 },
    );
  }

  let ttlDays: number | undefined;
  if (body.ttlDays !== undefined) {
    if (typeof body.ttlDays !== "number") {
      return NextResponse.json({ error: "ttlDays must be a number" }, { status: 400 });
    }
    ttlDays = body.ttlDays;
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({ userId: session.userId, role: session.role });
    const created = await client.mutation(api.invites.createInvites, {
      actorToken,
      institutionId: institutionId as Id<"institutions">,
      invites,
      ...(ttlDays !== undefined ? { ttlDays } : {}),
    });
    return NextResponse.json({ invites: created });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (session === null) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const inviteId = body.inviteId;
  if (typeof inviteId !== "string" || inviteId.length === 0) {
    return NextResponse.json({ error: "Missing inviteId" }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({ userId: session.userId, role: session.role });
    await client.mutation(api.invites.revokeInvite, {
      actorToken,
      inviteId: inviteId as Id<"invites">,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
