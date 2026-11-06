import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { verifySession, ROLES, type Role } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";
import { EMAIL_PATTERN } from "@/lib/invites/csv";
import { convexRouteErrorResponse } from "@/lib/api/route-errors";

type SessionPayload = NonNullable<Awaited<ReturnType<typeof verifySession>>>;

async function getAdminSession(): Promise<SessionPayload | null> {
  const session = await getActiveSession({ allowEnrollment: false });
  if (session === null || session.role !== "admin") return null;
  return session;
}

type InviteInput = { email?: unknown; name?: unknown; role?: unknown };

type ParsedInvite = { email: string; name: string; role: Role };

/** Validates the invite rows, naming the first problem in words an admin can fix. */
function parseInvites(value: unknown): { invites: ParsedInvite[] } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Add at least one person to invite." };
  }
  const invites: ParsedInvite[] = [];
  for (const item of value) {
    const { email, name, role } = (
      typeof item === "object" && item !== null ? item : {}
    ) as InviteInput;
    if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
      const shown =
        typeof email === "string" && email.trim().length > 0 ? `"${email.trim()}"` : "An email";
      return { error: `${shown} is not a valid email address. Use the form name@example.com.` };
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      return { error: `Add a name for ${email.trim()}.` };
    }
    if (typeof role !== "string" || !ROLES.includes(role as Role)) {
      return { error: `Choose a valid role for ${email.trim()}.` };
    }
    invites.push({ email: email.trim().toLowerCase(), name: name.trim(), role: role as Role });
  }
  return { invites };
}

function errorResponse(error: unknown) {
  return convexRouteErrorResponse(
    "admin-invites",
    error,
    "Invite request failed. Please try again.",
  );
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

  const parsed = parseInvites(body.invites ?? body.rows);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { invites } = parsed;
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

/** Re-issues a fresh link for an email that has not activated yet; returns the new token once. */
export async function PATCH(request: Request) {
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

  const email = body.email;
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({ userId: session.userId, role: session.role });
    const invite = await client.mutation(api.invites.reissueInvite, { actorToken, email });
    return NextResponse.json({ invite });
  } catch (error) {
    return errorResponse(error);
  }
}
