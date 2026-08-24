import { SESSION_CHALLENGE_TTL_MS } from "./config";
import { bytesToBase64url, type ChallengePayload, signChallengeToken } from "./signer";

const NONCE_BYTES = 16;

export type MintInput = {
  sessionId: string;
  institutionId: string;
  courseId: string;
  sectionId: string;
  venueId: string;
  now: number;
};

export type MintOutput = {
  token: string;
  nonce: string;
  nonceHash: string;
  expiresAt: number;
};

export async function mintChallengeToken(input: MintInput): Promise<MintOutput> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const nonce = bytesToBase64url(nonceBytes);
  const expiresAt = input.now + SESSION_CHALLENGE_TTL_MS;
  const payload: ChallengePayload = {
    sid: input.sessionId,
    iid: input.institutionId,
    cs: input.courseId,
    sec: input.sectionId,
    ven: input.venueId,
    exp: expiresAt,
    n: nonce,
  };
  return {
    token: await signChallengeToken(payload),
    nonce,
    nonceHash: await nonceDigest(nonce),
    expiresAt,
  };
}

export async function nonceDigest(nonce: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce)),
  );
  let hex = "";
  for (const byte of digest) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
