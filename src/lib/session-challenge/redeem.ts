import { nonceDigest } from "./mint";
import { type ChallengePayload, verifyChallengeSignature } from "./signer";

export const REDEEM_VERDICTS = [
  "valid",
  "expired",
  "replayed",
  "wrong_session",
  "malformed",
] as const;

export type RedeemVerdict = (typeof REDEEM_VERDICTS)[number];

export type StoredChallengeState = {
  nonceHash: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt?: number;
};

export type SessionContextState = {
  institutionId: string;
  sessionId: string;
  courseId: string;
  sectionId: string;
  venueId: string;
  windowEndsAt: number;
  status: "active" | "paused" | "closed";
};

export type RedeemOutcome = {
  verdict: RedeemVerdict;
  reasonCodes: string[];
};

type ClassifyArgs = {
  verified: ReturnType<typeof verifyChallengeToken>;
  stored: StoredChallengeState | undefined;
  session: SessionContextState;
  now: number;
};

export function verifyChallengeToken(
  token: string,
): { ok: true; payload: ChallengePayload } | { ok: false; reasonCode: string } {
  return verifyChallengeSignature(token);
}

export function classifyRedeem(args: ClassifyArgs): RedeemOutcome {
  const { verified, stored, session, now } = args;
  if (!verified.ok) {
    return { verdict: "malformed", reasonCodes: [verified.reasonCode] };
  }
  const payload = verified.payload;
  if (payload.exp <= now) {
    return { verdict: "expired", reasonCodes: ["challenge_expired"] };
  }
  if (session.status !== "active") {
    return {
      verdict: "wrong_session",
      reasonCodes: [session.status === "paused" ? "session_paused" : "session_closed"],
    };
  }
  const mismatchReasonCodes: string[] = [];
  if (payload.iid !== session.institutionId) mismatchReasonCodes.push("institution_mismatch");
  if (payload.sid !== session.sessionId) mismatchReasonCodes.push("session_mismatch");
  if (payload.cs !== session.courseId) mismatchReasonCodes.push("course_mismatch");
  if (payload.sec !== session.sectionId) mismatchReasonCodes.push("section_mismatch");
  if (payload.ven !== session.venueId) mismatchReasonCodes.push("venue_mismatch");
  if (mismatchReasonCodes.length > 0) {
    return { verdict: "wrong_session", reasonCodes: mismatchReasonCodes };
  }
  if (now >= session.windowEndsAt) {
    return { verdict: "expired", reasonCodes: ["session_window_closed"] };
  }
  if (stored === undefined) {
    return { verdict: "replayed", reasonCodes: ["challenge_unknown"] };
  }
  if (stored.consumedAt !== undefined) {
    return { verdict: "replayed", reasonCodes: ["nonce_reused"] };
  }
  if (stored.nonceHash !== nonceDigest(payload.n)) {
    return { verdict: "replayed", reasonCodes: ["nonce_mismatch"] };
  }
  return { verdict: "valid", reasonCodes: [] };
}
