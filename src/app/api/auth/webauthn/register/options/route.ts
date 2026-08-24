import { NextResponse } from "next/server";

import { api } from "../../../../../../../convex/_generated/api";
import { errorResponse, unauthorized } from "@/lib/auth/http";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST() {
  const session = await getActiveSession({ allowEnrollment: true });
  if (session === null) return unauthorized();

  try {
    const actorToken = await mintActorToken({ userId: session.userId, role: session.role });
    const options = await getConvexClient().action(api.passkeys.registerOptions, { actorToken });
    return NextResponse.json(options);
  } catch (error) {
    return errorResponse(error);
  }
}
