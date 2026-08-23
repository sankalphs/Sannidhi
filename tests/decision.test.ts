import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DECISION_OUTCOMES,
  EVIDENCE_CATEGORIES,
  decisionValidator,
  type Decision,
  type DecisionOutcome,
  type EvidenceCategory,
  type EvidenceSignal,
} from "@/lib/decision";

function literalValues(union: {
  kind: string;
  members: ReadonlyArray<{ kind: string; value?: unknown }>;
}): string[] {
  return union.members.filter((m) => m.kind === "literal").map((m) => String(m.value));
}

describe("decision constants", () => {
  it("exposes exactly the four outcome codes", () => {
    expect([...DECISION_OUTCOMES]).toEqual(["accept", "step_up", "flag", "reject"]);
  });

  it("exposes exactly the four evidence categories", () => {
    expect([...EVIDENCE_CATEGORIES]).toEqual(["identity", "device", "presence", "person"]);
  });
});

describe("decisionValidator structure", () => {
  it("is an object validator with exactly the Decision fields", () => {
    expect(decisionValidator.kind).toBe("object");
    expect(Object.keys(decisionValidator.fields).sort()).toEqual(
      ["decidedAt", "evidence", "outcome", "policyVersion", "reasonCodes"].sort(),
    );
  });

  it("requires scalar fields of the right kinds", () => {
    expect(decisionValidator.fields.outcome.kind).toBe("union");
    expect(decisionValidator.fields.reasonCodes.kind).toBe("array");
    expect(decisionValidator.fields.reasonCodes.element.kind).toBe("string");
    expect(decisionValidator.fields.policyVersion.kind).toBe("string");
    expect(decisionValidator.fields.policyVersion.isOptional).toBe("required");
    expect(decisionValidator.fields.decidedAt.kind).toBe("float64");
    expect(decisionValidator.fields.decidedAt.isOptional).toBe("required");
  });

  it("only accepts the four outcome literals, so other strings are not valid outcomes", () => {
    const accepted = literalValues(decisionValidator.fields.outcome);
    expect(accepted).toEqual(["accept", "step_up", "flag", "reject"]);
    expect(accepted).not.toContain("deny");
    expect(accepted).not.toContain("");
  });

  it("mirrors evidence.signals as an array of signal objects", () => {
    const signals = decisionValidator.fields.evidence.fields.signals;
    expect(signals.kind).toBe("array");
    expect(signals.element.kind).toBe("object");

    const elementFields = (
      signals.element as unknown as { fields: Record<string, { kind: string; isOptional: string }> }
    ).fields;
    expect(Object.keys(elementFields).sort()).toEqual(
      ["category", "detail", "source", "status"].sort(),
    );
    expect(elementFields.source.kind).toBe("string");
    expect(elementFields.status.kind).toBe("string");
    expect(elementFields.detail.kind).toBe("string");
    expect(elementFields.detail.isOptional).toBe("optional");
  });

  it("restricts signal categories to the evidence category literals", () => {
    const category = (
      decisionValidator.fields.evidence.fields.signals.element as unknown as {
        fields: { category: { kind: string; members: Array<{ kind: string; value?: unknown }> } };
      }
    ).fields.category;
    expect(category.kind).toBe("union");
    expect(literalValues(category)).toEqual([...EVIDENCE_CATEGORIES]);
  });

  it("marks every top-level field required (Decision has no optional keys)", () => {
    for (const field of Object.values(decisionValidator.fields)) {
      expect(field.isOptional).toBe("required");
    }
  });
});

describe("type-level shape", () => {
  const validDecision: Decision = {
    outcome: "step_up",
    evidence: {
      signals: [
        {
          category: "identity",
          source: "passkey",
          status: "verified",
          detail: "WebAuthn assertion passed",
        },
        { category: "presence", source: "ble", status: "weak" },
      ],
    },
    reasonCodes: ["IDENTITY_OK", "PRESENCE_WEAK"],
    policyVersion: "p0",
    decidedAt: 1724400000000,
  };

  it("accepts a well-formed decision", () => {
    expect(validDecision.outcome).toBe("step_up");
    expect(validDecision.evidence.signals).toHaveLength(2);
  });

  it("keeps Decision aligned with the constant sets", () => {
    expectTypeOf<DecisionOutcome>().toEqualTypeOf<(typeof DECISION_OUTCOMES)[number]>();
    expectTypeOf<EvidenceCategory>().toEqualTypeOf<(typeof EVIDENCE_CATEGORIES)[number]>();
    expectTypeOf(validDecision.outcome).toEqualTypeOf<DecisionOutcome>();
    expectTypeOf(validDecision.evidence.signals).toEqualTypeOf<EvidenceSignal[]>();
  });
});
