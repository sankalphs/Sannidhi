import { canonicalEventJson } from "@/lib/ledger/hash";

/**
 * Offline capture crypto for the faculty device queue (spec §13+§20).
 *
 * Client contract:
 * 1. Online, before losing connectivity: call `mintOfflineBundle(actorToken,
 *    sessionId)` and store the returned `{sessionId, key}` on the device.
 * 2. Offline, per attested student: build an `OfflineRecord` with a fresh
 *    random `nonce` (unique per queued record, never reused) and the device
 *    clock as `capturedAt`, then `signRecord(key, record)` and persist the
 *    `SignedOfflineRecord`.
 * 3. Back online: send the queued signed records to
 *    `syncOfflineBatch(actorToken, records)`. The server re-verifies each HMAC
 *    against the key it stored at mint time, dedupes replays via
 *    `nonceHash(sessionId, nonce)`, and appends survivors to the same ledger
 *    append seam online check-in uses, tagged origin "offline-faculty".
 *
 * `capturedAt` is display-only device-clock evidence; server time stays
 * authoritative for everything the ledger stamps.
 */

export type OfflineBundle = {
  sessionId: string;
  key: string;
};

export type OfflineRecord = {
  sessionId: string;
  sectionId: string;
  studentId: string;
  capturedAt: number;
  nonce: string;
  note?: string;
};

export type SignedOfflineRecord = OfflineRecord & { signature: string };

const BUNDLE_KEY_BYTES = 32;

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("malformed hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** 32 random bytes as hex — the per-session pre-authorization secret held by faculty device and server. */
export function mintBundleKey(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(BUNDLE_KEY_BYTES)));
}

async function hmacSha256Hex(key: string, payload: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    hexToBytes(key) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload)),
  );
  return bytesToHex(mac);
}

/** Signs the canonical JSON of the record fields; the signature field itself never enters the MAC. */
export async function signRecord(key: string, record: OfflineRecord): Promise<SignedOfflineRecord> {
  const signature = await hmacSha256Hex(key, canonicalEventJson({ ...record }));
  return { ...record, signature };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a[i] ^ b[i];
  }
  return difference === 0;
}

/** Recomputes the HMAC over the received fields and compares digests without early-exiting on content. */
export async function verifySignature(key: string, signed: SignedOfflineRecord): Promise<boolean> {
  const { signature, ...record } = signed;
  let expected: string;
  try {
    expected = await hmacSha256Hex(key, canonicalEventJson(record));
    return timingSafeEqual(hexToBytes(expected), hexToBytes(signature));
  } catch {
    return false;
  }
}

/** Replay-dedupe key stored as attendance_events.syncNonceHash; scoped to the session. */
export async function nonceHash(sessionId: string, nonce: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sessionId}:${nonce}`)),
  );
  return bytesToHex(digest);
}
