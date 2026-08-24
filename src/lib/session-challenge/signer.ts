import { createHmac, timingSafeEqual } from "node:crypto";

const KEY_DOMAIN = "sannidhi:session-challenge:v1";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type ChallengePayload = {
  sid: string;
  iid: string;
  cs: string;
  sec: string;
  ven: string;
  exp: number;
  n: string;
};

export type SignedChallengeVerification =
  { ok: true; payload: ChallengePayload } | { ok: false; reasonCode: string };

function getSecretBytes(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret === undefined) {
    throw new Error("SESSION_SECRET must be set");
  }
  const encoded = new TextEncoder().encode(secret);
  if (encoded.byteLength < 16) {
    throw new Error("SESSION_SECRET must be at least 16 bytes");
  }
  return new Uint8Array(encoded);
}

function deriveSigningKey(): Buffer {
  return createHmac("sha256", getSecretBytes()).update(KEY_DOMAIN).digest();
}

function signPayloadString(payloadString: string): string {
  return createHmac("sha256", deriveSigningKey()).update(payloadString, "utf8").digest("base64url");
}

export function signChallengeToken(payload: ChallengePayload): string {
  const payloadString = JSON.stringify(payload);
  const encodedPayload = Buffer.from(payloadString, "utf8").toString("base64url");
  return `${encodedPayload}.${signPayloadString(payloadString)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isChallengePayload(value: unknown): value is ChallengePayload {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.sid) &&
    isNonEmptyString(candidate.iid) &&
    isNonEmptyString(candidate.cs) &&
    isNonEmptyString(candidate.sec) &&
    isNonEmptyString(candidate.ven) &&
    typeof candidate.exp === "number" &&
    Number.isFinite(candidate.exp) &&
    isNonEmptyString(candidate.n)
  );
}

export function verifyChallengeSignature(token: string): SignedChallengeVerification {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, reasonCode: "token_malformed" };
  }
  const encodedPayload = parts[0];
  const signature = parts[1];
  if (!BASE64URL_PATTERN.test(encodedPayload) || !BASE64URL_PATTERN.test(signature)) {
    return { ok: false, reasonCode: "token_malformed" };
  }
  const payloadString = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const expected = Buffer.from(signPayloadString(payloadString), "base64url");
  const provided = Buffer.from(signature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reasonCode: "signature_invalid" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadString);
  } catch {
    return { ok: false, reasonCode: "payload_invalid" };
  }
  if (!isChallengePayload(parsed)) {
    return { ok: false, reasonCode: "payload_invalid" };
  }
  return { ok: true, payload: parsed };
}
