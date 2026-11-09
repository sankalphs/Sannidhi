import { NextResponse, type NextRequest } from "next/server";

import { evaluateAccess } from "@/lib/auth/guard";
import { COOKIE_NAME, isFullSession, verifySession } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  const role = session !== null && isFullSession(session) ? session.role : null;
  const { pathname, search } = request.nextUrl;
  const decision = evaluateAccess(pathname, role, search);
  if (decision.status === "redirect") {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/faculty/:path*", "/admin/:path*", "/audit/:path*"],
};
