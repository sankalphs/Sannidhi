import { createHash } from "node:crypto";

import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex/server-client";

const REQUESTED_ROLES = ["administrator", "faculty", "department_authority", "other"] as const;
type RequestedRole = (typeof REQUESTED_ROLES)[number];

/** Machine-readable ConvexError codes mapped to retriable statuses and user copy. */
const RETRIABLE_ERRORS: Record<string, { status: 429 | 503; message: string }> = {
  rate_limited_email: {
    status: 429,
    message: "Too many requests from this email. Try again tomorrow.",
  },
  rate_limited_ip: {
    status: 429,
    message: "Too many requests from this network. Try again tomorrow.",
  },
  queue_full: {
    status: 503,
    message: "The request queue is full right now. Please try again in a few days.",
  },
};

type AccessRequestInput = {
  institution?: unknown;
  name?: unknown;
  email?: unknown;
  requestedRole?: unknown;
  note?: unknown;
  website?: unknown;
};

/**
 * Best-effort client IP for abuse control. Only a salted hash of this value ever
 * reaches storage — the raw IP is never persisted. Loopback addresses are exempt:
 * they are the server itself, not a network client, and rate-limiting them would
 * only break local development and smoke tests.
 */
function clientIpHash(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded !== null
      ? (forwarded.split(",")[0]?.trim() ?? "")
      : (request.headers.get("x-real-ip")?.trim() ?? "");
  if (ip.length === 0) return undefined;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return undefined;
  const salt = process.env.SESSION_SECRET ?? "sannidhi-access-request-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

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
    const ipHash = clientIpHash(request);
    await getConvexClient().mutation(api.accessRequests.submit, {
      // Server-held shared secret: the Convex mutation rejects direct client calls.
      submitSecret: process.env.SESSION_SECRET ?? "",
      institution,
      name,
      email,
      requestedRole,
      ...(note !== undefined ? { note } : {}),
      ...(website !== undefined ? { website } : {}),
      ...(ipHash !== undefined ? { ipHash } : {}),
    });
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") {
      const retriable = RETRIABLE_ERRORS[error.data];
      if (retriable !== undefined) {
        return NextResponse.json({ error: retriable.message }, { status: retriable.status });
      }
      if (error.data === "unauthorized") {
        console.error("access-requests: submit secret rejected by Convex");
        return NextResponse.json(
          { error: "Could not submit the request right now. Try again shortly." },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: error.data }, { status: 400 });
    }
    console.warn("access-requests: submission failed", error);
    return NextResponse.json(
      { error: "Could not submit the request right now. Try again shortly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
