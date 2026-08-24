import { createHash, randomBytes } from "node:crypto";

import { SESSION_CHALLENGE_TTL_MS } from "./config";
import { type ChallengePayload, signChallengeToken } from "./signer";

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

export function mintChallengeToken(input: MintInput): MintOutput {
  const nonce = randomBytes(NONCE_BYTES).toString("base64url");
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
    token: signChallengeToken(payload),
    nonce,
    nonceHash: nonceDigest(nonce),
    expiresAt,
  };
}

export function nonceDigest(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}
