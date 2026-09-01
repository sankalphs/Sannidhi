import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

import { api } from "../../../../../../convex/_generated/api";
import { errorResponse, readJsonBody } from "@/lib/auth/http";
import { setSessionCookie } from "@/lib/auth/server";
import { ROLE_TO_HOME, signSession } from "@/lib/auth/session";
import { getConvexClient } from "@/lib/convex/server-client";

const LOGIN_ERROR_COPY: Record<string, string> = {
  invalid_credentials: "Incorrect credentials. Check your details and try again.",
  rate_limited: "Too many failed attempts. Wait a minute and try again.",
  account_not_active:
    "This account has not been activated yet. Open your invite link and register a passkey to activate it.",
  "account suspended": "This account is suspended. Contact your institution's admin office.",
};

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Missing login details" }, { status: 400 });
  }

  const text = (key: string): string =>
    typeof body[key] === "string" ? (body[key] as string) : "";

  try {
    const result = await getConvexClient().action(api.accounts.loginWithPassword, {
      identifier: text("identifier"),
      password: text("password"),
      ...(text("institutionCode").length > 0 ? { institutionCode: text("institutionCode") } : {}),
    });

    const token = await signSession({
      userId: result.userId,
      role: result.role,
      sid: result.sid,
    });
    await setSessionCookie(token);
    return NextResponse.json({
      ok: true,
      userId: result.userId,
      role: result.role,
      redirect: ROLE_TO_HOME[result.role],
    });
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") {
      const copy = LOGIN_ERROR_COPY[error.data];
      if (copy !== undefined) {
        return NextResponse.json(
          { error: copy },
          { status: error.data === "rate_limited" ? 429 : 400 },
        );
      }
      return NextResponse.json({ error: error.data }, { status: 400 });
    }
    return errorResponse(error);
  }
}
