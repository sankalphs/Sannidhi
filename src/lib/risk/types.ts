import type { EvidenceSignal } from "@/lib/decision";

export const RISK_POLICY_VERSION = "risk-engine/v1";

export const SIGNAL_STATUSES = [
  "verified",
  "weak",
  "missing",
  "unavailable",
  "failed",
] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export type AnomalyContext = {
  recentSecurityFailures: number;
};

export type RiskInput = {
  signals: EvidenceSignal[];
  anomalies?: AnomalyContext;
  now?: number;
};

export type RiskExplanationTier = "student" | "faculty" | "admin";

export type DecisionExplanation = {
  headline: string;
  message: string;
  actions: string[];
  reasons: string[];
  signals: EvidenceSignal[];
};
