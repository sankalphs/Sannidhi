import { describe, expect, it } from "vitest";

import {
  FACE_MATCH_THRESHOLD,
  classifyFaceAttempt,
  verdictToReasonCode,
  type LivenessAssessment,
} from "../src/lib/biometry";

const TEMPLATE = [0.6, 0.8, 0, 0];

function liveness(overrides?: Partial<LivenessAssessment>): LivenessAssessment {
  return {
    verdict: "live",
    motionScore: 0.02,
    brightnessScore: 0.4,
    frameCount: 10,
    ...overrides,
  };
}

// Vector whose cosine with TEMPLATE is exactly s:
// b = s*TEMPLATE + sqrt(1-s^2)*[-0.8, 0.6] where [-0.8, 0.6] is unit and orthogonal to TEMPLATE.
function withSimilarity(s: number): number[] {
  const perpScale = Math.sqrt(1 - s * s);
  return [s * 0.6 - perpScale * 0.8, s * 0.8 + perpScale * 0.6, 0, 0];
}

describe("classifyFaceAttempt", () => {
  it("returns inconclusive with null similarity for insufficient liveness", () => {
    const result = classifyFaceAttempt({
      template: TEMPLATE,
      embedding: TEMPLATE,
      liveness: liveness({ verdict: "insufficient", brightnessScore: 0.001 }),
    });
    expect(result).toEqual({ verdict: "inconclusive", similarity: null });
  });

  it("returns spoof_suspected with null similarity for a static presentation", () => {
    const result = classifyFaceAttempt({
      template: TEMPLATE,
      embedding: TEMPLATE,
      liveness: liveness({ verdict: "static" }),
    });
    expect(result).toEqual({ verdict: "spoof_suspected", similarity: null });
  });

  it("returns inconclusive when no template is enrolled yet", () => {
    const result = classifyFaceAttempt({
      template: null,
      embedding: TEMPLATE,
      liveness: liveness(),
    });
    expect(result).toEqual({ verdict: "inconclusive", similarity: null });
  });

  it("matches identical live embeddings at similarity 1", () => {
    const result = classifyFaceAttempt({
      template: TEMPLATE,
      embedding: [...TEMPLATE],
      liveness: liveness(),
    });
    expect(result.verdict).toBe("match");
    expect(result.similarity).not.toBeNull();
    expect(result.similarity).toBeGreaterThan(FACE_MATCH_THRESHOLD);
  });

  it("mismatches clearly different live embeddings", () => {
    const result = classifyFaceAttempt({
      template: [1, 0],
      embedding: [-1, 0],
      liveness: liveness(),
    });
    expect(result.verdict).toBe("mismatch");
    expect(result.similarity).toBeCloseTo(-1, 10);
  });

  it("matches just above the threshold boundary", () => {
    const embedding = withSimilarity(FACE_MATCH_THRESHOLD + 0.002);
    const result = classifyFaceAttempt({ template: TEMPLATE, embedding, liveness: liveness() });
    expect(result.verdict).toBe("match");
    expect(result.similarity).toBeGreaterThanOrEqual(FACE_MATCH_THRESHOLD);
  });

  it("mismatches just below the threshold boundary", () => {
    const embedding = withSimilarity(FACE_MATCH_THRESHOLD - 0.002);
    const result = classifyFaceAttempt({ template: TEMPLATE, embedding, liveness: liveness() });
    expect(result.verdict).toBe("mismatch");
    expect(result.similarity).toBeLessThan(FACE_MATCH_THRESHOLD);
  });

  it("treats zero-norm embeddings conservatively as mismatch", () => {
    const result = classifyFaceAttempt({
      template: TEMPLATE,
      embedding: [0, 0, 0, 0],
      liveness: liveness(),
    });
    expect(result.verdict).toBe("mismatch");
    expect(result.similarity).toBe(0);
  });
});

describe("verdictToReasonCode", () => {
  it("maps every verdict to its evidence reason code", () => {
    expect(verdictToReasonCode("spoof_suspected")).toBe("person_spoof_suspected");
    expect(verdictToReasonCode("mismatch")).toBe("person_face_mismatch");
    expect(verdictToReasonCode("inconclusive")).toBe("person_check_inconclusive");
    expect(verdictToReasonCode("match")).toBeNull();
  });
});
