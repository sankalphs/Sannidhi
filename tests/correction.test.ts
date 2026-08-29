// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CORRECTION_FALLBACK_POLICY_VERSION,
  FACULTY_CORRECTION_REASON_CODE,
  buildCorrectionDecision,
  foldCorrectionNote,
} from "@/lib/attendance/correction";
import { outcomeToAttendanceState } from "@/lib/risk/engine";
import type { Decision } from "@/lib/decision";

const ORIGINAL_DECISION: Decision = {
  outcome: "flag",
  evidence: {
    signals: [{ category: "presence", source: "session_challenge", status: "failed" }],
  },
  reasonCodes: ["presence_unverified"],
  policyVersion: "risk-engine/v1",
  decidedAt: 1_000,
};

describe("buildCorrectionDecision", () => {
  it("projects to a verified attendance state", () => {
    const decision = buildCorrectionDecision(ORIGINAL_DECISION, { decidedAt: 2_000 });
    expect(decision.outcome).toBe("accept");
    expect(outcomeToAttendanceState(decision.outcome)).toBe("verified");
  });

  it("preserves the original event's policy context", () => {
    expect(buildCorrectionDecision(ORIGINAL_DECISION, { decidedAt: 2_000 }).policyVersion).toBe(
      "risk-engine/v1",
    );
  });

  it("falls back when the disputed event carries no decision", () => {
    const decision = buildCorrectionDecision(undefined, { decidedAt: 2_000 });
    expect(decision.policyVersion).toBe(CORRECTION_FALLBACK_POLICY_VERSION);
    expect(
      buildCorrectionDecision({ ...ORIGINAL_DECISION, policyVersion: undefined }, { decidedAt: 0 })
        .policyVersion,
    ).toBe(CORRECTION_FALLBACK_POLICY_VERSION);
  });

  it("stamps the faculty_correction reason code and nothing else", () => {
    const decision = buildCorrectionDecision(ORIGINAL_DECISION, { decidedAt: 2_000 });
    expect(decision.reasonCodes).toEqual([FACULTY_CORRECTION_REASON_CODE]);
    expect(FACULTY_CORRECTION_REASON_CODE).toBe("faculty_correction");
  });

  it("carries the review time as decidedAt", () => {
    expect(buildCorrectionDecision(ORIGINAL_DECISION, { decidedAt: 5_555 }).decidedAt).toBe(5_555);
  });

  it("attests identity and presence via faculty sources", () => {
    const { signals } = buildCorrectionDecision(ORIGINAL_DECISION, { decidedAt: 2_000 }).evidence;
    expect(signals).toEqual([
      { category: "identity", source: "faculty_attestation", status: "verified" },
      { category: "presence", source: "faculty_observation", status: "verified" },
    ]);
  });

  it("never inherits the original decision's verdict or reasons", () => {
    const decision = buildCorrectionDecision(ORIGINAL_DECISION, { decidedAt: 2_000 });
    expect(decision.outcome).not.toBe(ORIGINAL_DECISION.outcome);
    expect(decision.reasonCodes).not.toEqual(ORIGINAL_DECISION.reasonCodes);
    expect(decision.evidence.signals).not.toEqual(ORIGINAL_DECISION.evidence.signals);
  });
});

describe("foldCorrectionNote", () => {
  it("keeps the student reason verbatim when there is no reviewer note", () => {
    expect(foldCorrectionNote("I was present, marked absent by mistake.")).toBe(
      "I was present, marked absent by mistake.",
    );
  });

  it("appends a trimmed reviewer note on its own line", () => {
    expect(foldCorrectionNote("student reason", "  confirmed with registers.  ")).toBe(
      "student reason\nReviewer: confirmed with registers.",
    );
  });

  it("treats whitespace-only notes as absent", () => {
    expect(foldCorrectionNote("student reason", "   ")).toBe("student reason");
    expect(foldCorrectionNote("student reason", undefined)).toBe("student reason");
  });
});
