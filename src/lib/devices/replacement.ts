import type { DeviceState } from "./lifecycle";

export const FRESH_AUTH_WINDOW_MS = 5 * 60 * 1000;

export const REPLACEMENT_REASON_MAX_LENGTH = 500;

export function isFreshAuth(
  lastSeenAt: number | undefined,
  now: number,
  windowMs: number = FRESH_AUTH_WINDOW_MS,
): boolean {
  if (lastSeenAt === undefined) return false;
  return now - lastSeenAt <= windowMs;
}

export type ReplacementEligibilityInput = {
  deviceState: DeviceState;
  freshAuth: boolean;
  hasPendingReplacementForDevice?: boolean;
  reasonLength: number;
};

export type ReplacementEligibilityResult =
  "ok" | "device-not-active" | "auth-stale" | "replacement-pending" | "reason-missing";

export function checkReplacementEligibility(
  input: ReplacementEligibilityInput,
): ReplacementEligibilityResult {
  if (input.deviceState !== "active") return "device-not-active";
  if (!input.freshAuth) return "auth-stale";
  if (input.hasPendingReplacementForDevice === true) return "replacement-pending";
  if (input.reasonLength === 0 || input.reasonLength > REPLACEMENT_REASON_MAX_LENGTH) {
    return "reason-missing";
  }
  return "ok";
}

export const REPLACEMENT_DECISIONS = ["approve", "reject"] as const;

export type ReplacementDecision = (typeof REPLACEMENT_DECISIONS)[number];
