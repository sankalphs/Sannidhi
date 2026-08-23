import { v } from "convex/values";

export const DECISION_OUTCOMES = ["accept", "step_up", "flag", "reject"] as const;

export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const EVIDENCE_CATEGORIES = ["identity", "device", "presence", "person"] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export type EvidenceSignal = {
  category: EvidenceCategory;
  source: string;
  status: string;
  detail?: string;
};

export type Decision = {
  outcome: DecisionOutcome;
  evidence: {
    signals: EvidenceSignal[];
  };
  reasonCodes: string[];
  policyVersion: string;
  decidedAt: number;
};

export const evidenceSignalValidator = v.object({
  category: v.union(
    v.literal("identity"),
    v.literal("device"),
    v.literal("presence"),
    v.literal("person"),
  ),
  source: v.string(),
  status: v.string(),
  detail: v.optional(v.string()),
});

export const decisionValidator = v.object({
  outcome: v.union(
    v.literal("accept"),
    v.literal("step_up"),
    v.literal("flag"),
    v.literal("reject"),
  ),
  evidence: v.object({
    signals: v.array(evidenceSignalValidator),
  }),
  reasonCodes: v.array(v.string()),
  policyVersion: v.string(),
  decidedAt: v.number(),
});
