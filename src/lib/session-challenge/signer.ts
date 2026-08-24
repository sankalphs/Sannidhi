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
  return encoded;
}

async function importHmacKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedKeySecret: string | undefined;
let cachedSigningKey: Promise<CryptoKey> | undefined;

async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET ?? "";
  if (cachedSigningKey !== undefined && cachedKeySecret === secret) {
    return cachedSigningKey;
  }
  const rawKey = await importHmacKey(getSecretBytes());
  const domainMac = new Uint8Array(
    await crypto.subtle.sign("HMAC", rawKey, new TextEncoder().encode(KEY_DOMAIN)),
  );
  const derived = importHmacKey(domainMac);
  cachedKeySecret = secret;
  cachedSigningKey = derived;
  return derived;
}

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeBase64urlDecode(value: string): Uint8Array | null {
  try {
    return base64urlToBytes(value);
  } catch {
    return null;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a[i] ^ b[i];
  }
  return difference === 0;
}

async function signPayloadString(payloadString: string): Promise<string> {
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await getSigningKey(),
      new TextEncoder().encode(payloadString),
    ),
  );
  return bytesToBase64url(mac);
}

export async function signChallengeToken(payload: ChallengePayload): Promise<string> {
  const payloadString = JSON.stringify(payload);
  const encodedPayload = bytesToBase64url(new TextEncoder().encode(payloadString));
  return `${encodedPayload}.${await signPayloadString(payloadString)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isChallengePayload(value: unknown): value is ChallengePayload {
  if (value === null || typeof value !== "object") {
    return false;
  }
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

export async function verifyChallengeSignature(
  token: string,
): Promise<SignedChallengeVerification> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, reasonCode: "token_malformed" };
  }
  const encodedPayload = parts[0];
  const signature = parts[1];
  if (!BASE64URL_PATTERN.test(encodedPayload) || !BASE64URL_PATTERN.test(signature)) {
    return { ok: false, reasonCode: "token_malformed" };
  }
  const payloadBytes = safeBase64urlDecode(encodedPayload);
  const provided = safeBase64urlDecode(signature);
  if (payloadBytes === null || provided === null) {
    return { ok: false, reasonCode: "token_malformed" };
  }
  const payloadString = new TextDecoder().decode(payloadBytes);
  let expected: Uint8Array;
  try {
    expected = base64urlToBytes(await signPayloadString(payloadString));
  } catch {
    return { ok: false, reasonCode: "token_malformed" };
  }
  if (!timingSafeEqual(provided, expected)) {
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
