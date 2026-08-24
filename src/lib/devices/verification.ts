const textEncoder = new TextEncoder();

export const POSSESSION_CODE_TTL_MS = 10 * 60 * 1000;

export const POSSESSION_MAX_ATTEMPTS = 5;

export const POSSESSION_CODE_LENGTH = 6;

export type PossessionVerificationState = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  consumedAt?: number;
};

export function generatePossessionCode(): string {
  const max = 10 ** POSSESSION_CODE_LENGTH;
  const limit = Math.floor(4294967296 / max) * max;
  const value = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return (value[0] % max).toString().padStart(POSSESSION_CODE_LENGTH, "0");
}

export async function hashPossessionCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isPossessionExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now;
}

export function hasAttemptsLeft(attempts: number): boolean {
  return attempts < POSSESSION_MAX_ATTEMPTS;
}

export function isPossessionConsumed(consumedAt: number | undefined): boolean {
  return consumedAt !== undefined;
}

export type PossessionCheckResult = "ok" | "expired" | "attempts-exhausted" | "consumed";

export function checkPossessionUsable(
  state: PossessionVerificationState,
  now: number,
): PossessionCheckResult {
  if (isPossessionConsumed(state.consumedAt)) return "consumed";
  if (isPossessionExpired(state.expiresAt, now)) return "expired";
  if (!hasAttemptsLeft(state.attempts)) return "attempts-exhausted";
  return "ok";
}
