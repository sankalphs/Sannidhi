const textEncoder = new TextEncoder();

export const SID_BYTES = 32;

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const SESSION_ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export const ENROLLMENT_SESSION_TTL_MS = 15 * 60 * 1000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomSid(): string {
  const bytes = new Uint8Array(SID_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function hashSessionSid(sid: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(sid));
  return toHex(new Uint8Array(digest));
}
