import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { convexRouteErrorResponse } from "@/lib/api/route-errors";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { ROLES, type Role } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

/** Body: `{ userId, status: "active" | "suspended" }` or `{ userId, role }`. */
export async function PATCH(request: Request) {
  const session = await getActiveSession({ allowEnrollment: false });
  if (session === null || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { userId, status, role } = body;
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
    const target = userId as Id<"users">;
    if (status === "active" || status === "suspended") {
      await client.mutation(api.users.setUserStatus, { actorToken, userId: target, status });
    } else if (typeof role === "string" && ROLES.includes(role as Role)) {
      await client.mutation(api.users.setUserRole, {
        actorToken,
        userId: target,
        role: role as Role,
      });
    } else {
      return NextResponse.json({ error: "Provide a status or a role" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return convexRouteErrorResponse("admin-users", error, "User update failed. Please try again.");
  }
}

/** Body: `{ userId }`. Removes someone who never activated; the mutation refuses anyone else. */
export async function DELETE(request: Request) {
  const session = await getActiveSession({ allowEnrollment: false });
  if (session === null || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = body?.userId;
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
    await getConvexClient().mutation(api.users.removeInvitedUser, {
      actorToken,
      userId: userId as Id<"users">,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return convexRouteErrorResponse(
      "admin-users",
      error,
      "Removing this person failed. Please try again.",
    );
  }
}
