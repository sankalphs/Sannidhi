import { describe, expect, it } from "vitest";

import {
  classifyRedeem,
  mintChallengeToken,
  nonceDigest,
  verifyChallengeToken,
  type MintOutput,
  type SessionContextState,
  type StoredChallengeState,
} from "@/lib/session-challenge";

const CLASS_SIZE = 250;
const T0 = 1_700_000_000_000;

describe("session challenge classroom scale", () => {
  it("mints and redeems a full classroom exactly once each within the latency budget", async () => {
    const startedAt = Date.now();
    const store = new Map<string, StoredChallengeState>();
    const session: SessionContextState = {
      institutionId: "inst-1",
      sessionId: "perf-session",
      courseId: "course-1",
      sectionId: "sec-1",
      venueId: "venue-1",
      windowEndsAt: T0 + 45 * 60 * 1000,
      status: "active",
    };
    const minted: MintOutput[] = await Promise.all(
      Array.from({ length: CLASS_SIZE }, () =>
        mintChallengeToken({
          sessionId: "perf-session",
          institutionId: "inst-1",
          courseId: "course-1",
          sectionId: "sec-1",
          venueId: "venue-1",
          now: T0,
        }),
      ),
    );
    for (const row of minted) {
      store.set(row.nonceHash, {
        nonceHash: row.nonceHash,
        issuedAt: T0,
        expiresAt: row.expiresAt,
      });
    }
    let validCount = 0;
    const firstPassNow = T0 + 1000;
    for (const row of minted) {
      const verified = await verifyChallengeToken(row.token);
      const digest = verified.ok ? await nonceDigest(verified.payload.n) : "";
      const outcome = await classifyRedeem({
        verified,
        stored: store.get(digest),
        session,
        now: firstPassNow,
      });
      expect(outcome.verdict).toBe("valid");
      validCount += 1;
      const consumed = store.get(digest);
      if (consumed !== undefined) {
        store.set(digest, { ...consumed, consumedAt: firstPassNow });
      }
    }
    expect(validCount).toBe(CLASS_SIZE);
    for (const row of minted) {
      const verified = await verifyChallengeToken(row.token);
      const digest = verified.ok ? await nonceDigest(verified.payload.n) : "";
      const outcome = await classifyRedeem({
        verified,
        stored: store.get(digest),
        session,
        now: T0 + 2000,
      });
      expect(outcome.verdict).toBe("replayed");
      expect(outcome.reasonCodes).toEqual(["nonce_reused"]);
    }
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(2000);
  });
});
