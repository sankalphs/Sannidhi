import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

import { api } from "../../../../../convex/_generated/api";
import { errorResponse, readJsonBody } from "@/lib/auth/http";
import { getConvexClient } from "@/lib/convex/server-client";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Missing signup details" }, { status: 400 });
  }

  const text = (key: string): string =>
    typeof body[key] === "string" ? (body[key] as string) : "";
  const website = text("website");
  // Honeypot: real users never fill this hidden field.
  if (website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  if (text("password") !== text("confirmPassword")) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  try {
    await getConvexClient().action(api.accounts.signUpWithPassword, {
      institutionCode: text("institutionCode"),
      name: text("name"),
      email: text("email"),
      usn: text("usn"),
      password: text("password"),
      inviteToken: text("inviteToken"),
    });

    // Account created but not activated: the invite link the student holds
    // is the activation path (passkey enrollment), so no session is minted.
    return NextResponse.json({
      ok: true,
      pendingActivation: true,
      redirect: "/signup/pending",
    });
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") {
      if (error.data === "account_exists") {
        return NextResponse.json(
          { error: "An account with this email already exists. Try signing in instead." },
          { status: 409 },
        );
      }
      if (error.data === "usn_taken") {
        return NextResponse.json(
          { error: "This USN is already registered at your institution." },
          { status: 409 },
        );
      }
      if (error.data === "signup_rate_limited") {
        return NextResponse.json(
          { error: "Too many signups for this institution right now. Try again later." },
          { status: 429 },
        );
      }
      if (error.data === "signup_requires_invite") {
        return NextResponse.json(
          {
            error:
              "Signups need an invite from your institution. Ask your admin office for an invite link, then sign up with the same email.",
          },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: error.data }, { status: 400 });
    }
    return errorResponse(error);
  }
}
