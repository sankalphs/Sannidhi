import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";

import { stripServerErrorFraming } from "@/lib/client/describe-error";

type KnownError = { pattern: RegExp; message: string; status: number };

/**
 * Authored Convex messages that are accurate but technical, mapped to copy a
 * person can act on. First match wins; unmatched authored messages pass
 * through sentence-cased.
 */
const KNOWN_ERRORS: KnownError[] = [
  {
    pattern: /verification failed: .*(origin|rp ?id)/i,
    message:
      "Passkeys only work on Sannidhi's main web address. Open Sannidhi from your usual link and try again.",
    status: 400,
  },
  {
    pattern:
      /^(registration|authentication) verification failed|^malformed ceremony response|clientDataJSON/i,
    message: "We couldn't verify your passkey. Please try again.",
    status: 400,
  },
  {
    pattern: /^challenge (not found|invalid or expired|(not )?bound)/i,
    message: "This passkey prompt expired. Please try again.",
    status: 403,
  },
  {
    pattern: /^credential not recognized/i,
    message:
      "This passkey isn't registered with Sannidhi. Try another passkey or sign in with your password.",
    status: 403,
  },
  {
    pattern: /^no passkey available/i,
    message: "No passkey is registered for this account yet.",
    status: 400,
  },
  {
    pattern: /^(account suspended|account unavailable)$/i,
    message: "This account is suspended. Contact your institution's admin office.",
    status: 403,
  },
  {
    pattern: /^unauthorized/i,
    message: "You don't have access to do that. Sign in again and retry.",
    status: 403,
  },
  {
    pattern: /^invite expired$/i,
    message: "This invite has expired. Ask your admin office for a new link.",
    status: 400,
  },
  {
    pattern: /^invite revoked$/i,
    message: "This invite was revoked. Ask your admin office for a new link.",
    status: 400,
  },
  {
    pattern: /^invite already accepted$/i,
    message: "This invite has already been used. Sign in instead.",
    status: 400,
  },
  {
    pattern: /^invite (not found|is not pending)$/i,
    message: "This invite is no longer valid. Refresh the page and try again.",
    status: 400,
  },
];

/** Never forwarded even though authored: deployment configuration detail. */
const INTERNAL_ONLY = /NEXT_PUBLIC_|CONVEX_|secret|token (invalid|missing)/i;

function sentenceCase(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1);
}

/**
 * The person-facing message and status for an authored ConvexError, or null
 * for anything else (infrastructure faults, stray exceptions) — those must
 * collapse to a generic fallback. The HTTP client folds "[Request ID: …]
 * Server Error Uncaught ConvexError:" into `error.message`; only `error.data`
 * is read, and it is stripped again defensively.
 */
export function publicConvexError(error: unknown): { message: string; status: number } | null {
  if (!(error instanceof ConvexError) || typeof error.data !== "string") return null;
  const raw = stripServerErrorFraming(error.data);
  if (raw.length === 0 || INTERNAL_ONLY.test(raw)) return null;
  for (const entry of KNOWN_ERRORS) {
    if (entry.pattern.test(raw)) return { message: entry.message, status: entry.status };
  }
  const status = /forbidden|wrong role|suspended|re-verification/i.test(raw) ? 403 : 400;
  return { message: sentenceCase(raw), status };
}

/**
 * Route-handler catch block: logs the raw error server-side, then answers
 * with a human message. Authored ConvexErrors pass through (mapped by
 * KNOWN_ERRORS); everything else becomes `fallback` with a 500.
 */
export function convexRouteErrorResponse(
  scope: string,
  error: unknown,
  fallback: string,
): NextResponse {
  console.error(`[${scope}]`, error);
  const known = publicConvexError(error);
  if (known !== null) return NextResponse.json({ error: known.message }, { status: known.status });
  return NextResponse.json({ error: fallback }, { status: 500 });
}
