import { NextResponse } from "next/server";

import { convexRouteErrorResponse } from "@/lib/api/route-errors";

/** Auth-route catch block: authored Convex errors become human copy, anything else a generic 500. */
export function errorResponse(
  error: unknown,
  fallbackMessage = "Something went wrong. Please try again.",
) {
  return convexRouteErrorResponse("auth", error, fallbackMessage);
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
