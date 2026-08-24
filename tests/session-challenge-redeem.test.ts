import { describe, expect, it } from "vitest";

import {
  SESSION_CHALLENGE_TTL_MS,
  classifyRedeem,
  mintChallengeToken,
  nonceDigest,
  verifyChallengeToken,
  type RedeemOutcome,
  type SessionContextState,
  type StoredChallengeState,
} from "@/lib/session-challenge";

const T0 = 1_700_000_000_000;

type StoredVariant = "fresh" | "unknown" | "consumed" | "hash_mismatch";

type ClassificationCase = {
  name: string;
  now?: number;
  status?: SessionContextState["status"];
  bindings?: Partial<
    Pick<SessionContextState, "institutionId" | "sessionId" | "courseId" | "sectionId" | "venueId">
  >;
  stored?: StoredVariant;
  token?: string;
  verdict: RedeemOutcome["verdict"];
  reasonCodes: string[];
};

function buildFixture() {
  return (async () => {
    const minted = await mintChallengeToken({
      sessionId: "sess-1",
      institutionId: "inst-1",
      courseId: "course-1",
      sectionId: "sec-1",
      venueId: "venue-1",
      now: T0,
    });
    const verified = await verifyChallengeToken(minted.token);
    if (!verified.ok) throw new Error("fixture token failed verification");
    const stored: StoredChallengeState = {
      nonceHash: await nonceDigest(minted.nonce),
      issuedAt: T0,
      expiresAt: minted.expiresAt,
    };
    const session: SessionContextState = {
      institutionId: "inst-1",
      sessionId: "sess-1",
      courseId: "course-1",
      sectionId: "sec-1",
      venueId: "venue-1",
      windowEndsAt: T0 + 30 * 1000,
      status: "active",
    };
    return { minted, verified, stored, session };
  })();
}

function resolveStored(
  fixtureStored: StoredChallengeState,
  variant: StoredVariant = "fresh",
): StoredChallengeState | undefined {
  if (variant === "unknown") return undefined;
  if (variant === "consumed") return { ...fixtureStored, consumedAt: T0 + 500 };
  if (variant === "hash_mismatch") return { ...fixtureStored, nonceHash: "f".repeat(64) };
  return fixtureStored;
}

const CASES: ClassificationCase[] = [
  {
    name: "accepts a fresh valid redemption inside the window",
    verdict: "valid",
    reasonCodes: [],
  },
  {
    name: "expires once the challenge TTL lapses",
    now: T0 + SESSION_CHALLENGE_TTL_MS + 1,
    verdict: "expired",
    reasonCodes: ["challenge_expired"],
  },
  {
    name: "rejects while the session is paused",
    status: "paused",
    verdict: "wrong_session",
    reasonCodes: ["session_paused"],
  },
  {
    name: "rejects once the session is closed",
    status: "closed",
    verdict: "wrong_session",
    reasonCodes: ["session_closed"],
  },
  {
    name: "rejects an institution binding mismatch",
    bindings: { institutionId: "inst-other" },
    verdict: "wrong_session",
    reasonCodes: ["institution_mismatch"],
  },
  {
    name: "rejects a class session binding mismatch",
    bindings: { sessionId: "sess-other" },
    verdict: "wrong_session",
    reasonCodes: ["session_mismatch"],
  },
  {
    name: "rejects a course binding mismatch",
    bindings: { courseId: "course-other" },
    verdict: "wrong_session",
    reasonCodes: ["course_mismatch"],
  },
  {
    name: "rejects a section binding mismatch",
    bindings: { sectionId: "sec-other" },
    verdict: "wrong_session",
    reasonCodes: ["section_mismatch"],
  },
  {
    name: "rejects a venue binding mismatch",
    bindings: { venueId: "venue-other" },
    verdict: "wrong_session",
    reasonCodes: ["venue_mismatch"],
  },
  {
    name: "expires at the session window boundary while the TTL is still live",
    now: T0 + 30 * 1000,
    verdict: "expired",
    reasonCodes: ["session_window_closed"],
  },
  {
    name: "treats an unknown stored challenge as replayed",
    stored: "unknown",
    verdict: "replayed",
    reasonCodes: ["challenge_unknown"],
  },
  {
    name: "treats an already consumed nonce as replayed",
    stored: "consumed",
    verdict: "replayed",
    reasonCodes: ["nonce_reused"],
  },
  {
    name: "treats a stored hash mismatch as replayed",
    stored: "hash_mismatch",
    verdict: "replayed",
    reasonCodes: ["nonce_mismatch"],
  },
  {
    name: "marks structurally invalid tokens malformed",
    token: "garbage-token",
    verdict: "malformed",
    reasonCodes: ["token_malformed"],
  },
];

describe("session challenge redeem classification", () => {
  it.each(CASES)("$name", async (testCase) => {
    const fixture = await buildFixture();
    const session: SessionContextState = {
      ...fixture.session,
      ...(testCase.status !== undefined ? { status: testCase.status } : {}),
      ...(testCase.bindings ?? {}),
    };
    const verified =
      testCase.token === undefined ? fixture.verified : await verifyChallengeToken(testCase.token);
    const outcome = await classifyRedeem({
      verified,
      stored: resolveStored(fixture.stored, testCase.stored),
      session,
      now: testCase.now ?? T0 + 1000,
    });
    expect(outcome.verdict).toBe(testCase.verdict);
    expect(outcome.reasonCodes).toEqual(testCase.reasonCodes);
  });

  it("surfaces the verification reason code for signature failures", async () => {
    const fixture = await buildFixture();
    const tampered = `${fixture.minted.token.slice(0, -3)}abc`;
    const outcome = await classifyRedeem({
      verified: await verifyChallengeToken(tampered),
      stored: fixture.stored,
      session: fixture.session,
      now: T0 + 1000,
    });
    expect(outcome.verdict).toBe("malformed");
    expect(outcome.reasonCodes).toEqual(["signature_invalid"]);
  });

  it("collects every binding mismatch into one wrong_session outcome", async () => {
    const fixture = await buildFixture();
    const outcome = await classifyRedeem({
      verified: fixture.verified,
      stored: fixture.stored,
      session: {
        ...fixture.session,
        courseId: "course-other",
        venueId: "venue-other",
      },
      now: T0 + 1000,
    });
    expect(outcome.verdict).toBe("wrong_session");
    expect(outcome.reasonCodes).toEqual(["course_mismatch", "venue_mismatch"]);
  });
});
