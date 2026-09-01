import { NextResponse } from "next/server";

/**
 * Route handlers that proxy authored ConvexError messages to the UI: messages
 * authored with ConvexError (surfaced by the convex client in `error.data`)
 * pass through with 403/400 semantics, while infrastructure failures (network
 * faults degrade to a generic "Server Error", stray exceptions carry internal
 * text) collapse to a generic 500 so internal strings never reach the screen.
 */
export function convexRouteErrorResponse(
  scope: string,
  error: unknown,
  fallback: string,
): NextResponse {
  console.error(`[${scope}]`, error);
  const authored =
    typeof error === "object" && error !== null && "data" in error
      ? (error as { data?: unknown }).data
      : undefined;
  if (typeof authored === "string" && authored.length > 0 && !/^server error$/i.test(authored)) {
    const status = /unauthorized|forbidden|wrong role|suspended/i.test(authored) ? 403 : 400;
    return NextResponse.json({ error: authored }, { status });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
