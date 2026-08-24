import { NextResponse } from "next/server";

import { api } from "../../../../../../../convex/_generated/api";
import { errorResponse, readJsonBody } from "@/lib/auth/http";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const email =
    typeof body?.email === "string" && body.email.trim().length > 0 ? body.email.trim() : undefined;

  try {
    const options = await getConvexClient().action(api.passkeys.authenticateOptions, {
      ...(email !== undefined ? { email } : {}),
    });
    return NextResponse.json(options);
  } catch (error) {
    return errorResponse(error);
  }
}
