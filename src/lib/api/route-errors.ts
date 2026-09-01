import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

/**
 * Route handlers that proxy authored ConvexError messages to the UI: the
 * convex client rethrows server-side ConvexError instances with the authored
 * message in `error.data` (plain `Error` otherwise), so only those pass
 * through — with 403/400 semantics. Infrastructure faults (network errors,
 * stray exceptions, internal strings) collapse to a generic 500 and never
 * reach the screen.
 */
export function convexRouteErrorResponse(
  scope: string,
  error: unknown,
  fallback: string,
): NextResponse {
  console.error(`[${scope}]`, error);
  if (error instanceof ConvexError && typeof error.data === "string" && error.data.length > 0) {
    const status = /unauthorized|forbidden|wrong role|suspended/i.test(error.data) ? 403 : 400;
    return NextResponse.json({ error: error.data }, { status });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
