import { FACE_MATCH_THRESHOLD } from "./constants";
import { cosineSimilarity } from "./embedding";
import type { LivenessAssessment } from "./liveness";

export type FaceAttemptVerdict = "match" | "mismatch" | "spoof_suspected" | "inconclusive";

export type FaceClassification = { verdict: FaceAttemptVerdict; similarity: number | null };

export function classifyFaceAttempt(args: {
  template: number[] | null;
  embedding: number[];
  liveness: LivenessAssessment;
}): FaceClassification {
  if (args.liveness.verdict === "insufficient")
    return { verdict: "inconclusive", similarity: null };
  if (args.liveness.verdict === "static") return { verdict: "spoof_suspected", similarity: null };
  if (args.template === null) return { verdict: "inconclusive", similarity: null };

  const similarity = cosineSimilarity(args.template, args.embedding);
  if (similarity >= FACE_MATCH_THRESHOLD) return { verdict: "match", similarity };
  return { verdict: "mismatch", similarity };
}

export function verdictToReasonCode(verdict: FaceAttemptVerdict): string | null {
  switch (verdict) {
    case "spoof_suspected":
      return "person_spoof_suspected";
    case "mismatch":
      return "person_face_mismatch";
    case "inconclusive":
      return "person_check_inconclusive";
    case "match":
      return null;
  }
}
