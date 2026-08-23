export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const CHALLENGE_PURPOSES = ["registration", "authentication"] as const;

export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number];

export type ChallengeState = {
  purpose: ChallengePurpose;
  userId?: string;
  expiresAt: number;
  consumedAt?: number;
};

export function isChallengeExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now;
}

export function isChallengeConsumed(consumedAt: number | undefined): boolean {
  return consumedAt !== undefined;
}

export function isChallengeUsable(
  challenge: Pick<ChallengeState, "purpose" | "expiresAt" | "consumedAt">,
  expectedPurpose: ChallengePurpose,
  now: number,
): boolean {
  if (challenge.purpose !== expectedPurpose) return false;
  if (isChallengeConsumed(challenge.consumedAt)) return false;
  return !isChallengeExpired(challenge.expiresAt, now);
}
