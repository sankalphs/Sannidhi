import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex/server-client";

const REQUESTED_ROLES = ["administrator", "faculty", "department_authority", "other"] as const;
type RequestedRole = (typeof REQUESTED_ROLES)[number];

type AccessRequestInput = {
  institution?: unknown;
  name?: unknown;
  email?: unknown;
  requestedRole?: unknown;
  note?: unknown;
  website?: unknown;
};

export async function POST(request: Request) {
  let body: AccessRequestInput;
  try {
    body = (await request.json()) as AccessRequestInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const institution = typeof body.institution === "string" ? body.institution : "";
  const name = typeof body.name === "string" ? body.name : "";
  const email = typeof body.email === "string" ? body.email : "";
  const note = typeof body.note === "string" ? body.note : undefined;
  const website = typeof body.website === "string" ? body.website : undefined;
  const requestedRole = REQUESTED_ROLES.includes(body.requestedRole as RequestedRole)
    ? (body.requestedRole as RequestedRole)
    : null;

  if (institution.trim().length === 0 || name.trim().length === 0 || email.trim().length === 0) {
    return NextResponse.json({ error: "All required fields must be filled in." }, { status: 400 });
  }
  if (requestedRole === null) {
    return NextResponse.json({ error: "Choose a role that fits you." }, { status: 400 });
  }

  try {
    await getConvexClient().mutation(api.accessRequests.submit, {
      institution,
      name,
      email,
      requestedRole,
      ...(note !== undefined ? { note } : {}),
      ...(website !== undefined ? { website } : {}),
    });
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") {
      const status = error.data.includes("Too many requests") ? 429 : 400;
      return NextResponse.json({ error: error.data }, { status });
    }
    console.warn("access-requests: submission failed", error);
    return NextResponse.json(
      { error: "Could not submit the request right now. Try again shortly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
