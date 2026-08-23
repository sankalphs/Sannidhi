import { NextResponse, type NextRequest } from "next/server";

import { evaluateAccess } from "@/lib/auth/guard";
import { COOKIE_NAME, verifySession } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  const decision = evaluateAccess(request.nextUrl.pathname, session?.role ?? null);
  if (decision.status === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.to;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/faculty/:path*", "/admin/:path*", "/audit/:path*"],
};
