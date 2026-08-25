import { describe, expect, it } from "vitest";

import type { EvidenceSignal } from "@/lib/decision";
import {
  MANUAL_ATTESTATION_IDENTITY_SOURCE,
  RISK_ANOMALY_FLAG_THRESHOLD,
  RISK_POLICY_VERSION,
  RISK_REASON_CODES,
  challengePresenceSignal,
  decide,
  deviceTrustSignal,
  faceMatchSignal,
  failurePresenceSignal,
  geolocationSignal,
  identitySessionSignal,
  manualAttestationSignals,
  outcomeToAttendanceState,
  type LocationOutcome,
  type RiskInput,
} from "@/lib/risk";

const NOW = 1724400000000;

function baseSignals(): EvidenceSignal[] {
  return [
    identitySessionSignal(),
    challengePresenceSignal("session_1"),
    deviceTrustSignal({ state: "active" }),
    geolocationSignal({ verdict: "consistent", distanceMeters: 42 }),
  ];
}

function cleanInput(overrides?: Partial<RiskInput>): RiskInput {
  return { signals: baseSignals(), now: NOW, ...overrides };
}

describe("decide happy path", () => {
  it("accepts fully verified evidence with policy version and decidedAt stamped", () => {
    const decision = decide(cleanInput());
    expect(decision.outcome).toBe("accept");
    expect(decision.reasonCodes).toEqual([]);
    expect(decision.policyVersion).toBe(RISK_POLICY_VERSION);
    expect(decision.policyVersion).toBe("risk-engine/v1");
    expect(decision.decidedAt).toBe(NOW);
    expect(decision.evidence.signals).toEqual(baseSignals());
  });

  it("maps all face match outcomes to person signals", () => {
    expect(faceMatchSignal({ verdict: "match", similarity: 0.912345 })).toEqual({
      category: "person",
      source: "face_match",
      status: "verified",
      detail: "similarity:0.912",
    });
    expect(faceMatchSignal({ verdict: "mismatch", similarity: 0.41 })).toEqual({
      category: "person",
      source: "face_match",
      status: "failed",
      detail: "mismatch:0.410",
    });
    expect(faceMatchSignal({ verdict: "spoof_suspected" })).toEqual({
      category: "person",
      source: "face_match",
      status: "failed",
      detail: "spoof_suspected",
    });
    expect(faceMatchSignal({ verdict: "inconclusive" })).toEqual({
      category: "person",
      source: "face_match",
      status: "weak",
      detail: "inconclusive",
    });
  });
});

describe("person evidence (face match)", () => {
  it("flags a suspected spoof among otherwise-strong signals", () => {
    const signals = [...baseSignals(), faceMatchSignal({ verdict: "spoof_suspected" })];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.personSpoofSuspected]);
    expect(decision.evidence.signals).toEqual(signals);
  });

  it("flags a face mismatch and dedupes codes in spoof-first priority order", () => {
    const signals = [
      ...baseSignals(),
      faceMatchSignal({ verdict: "mismatch", similarity: 0.42 }),
      { category: "person", source: "face_match", status: "failed", detail: "spoof_suspected" },
    ] as EvidenceSignal[];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([
      RISK_REASON_CODES.personSpoofSuspected,
      RISK_REASON_CODES.personFaceMismatch,
    ]);
  });

  it("flags a plain mismatch", () => {
    const signals = [...baseSignals(), faceMatchSignal({ verdict: "mismatch", similarity: 0.37 })];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.personFaceMismatch]);
  });

  it("steps up for an inconclusive check, ordered after location_mismatch", () => {
    const signals = baseSignals().map((signal) =>
      signal.category === "presence" && signal.source === "geolocation"
        ? geolocationSignal({ verdict: "mismatch", distanceMeters: 940 })
        : signal,
    );
    signals.push(faceMatchSignal({ verdict: "inconclusive" }));
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("step_up");
    expect(decision.reasonCodes).toEqual([
      RISK_REASON_CODES.locationMismatch,
      RISK_REASON_CODES.personCheckInconclusive,
    ]);
  });

  it("ignores verified, missing, and unavailable person signals", () => {
    const verified = decide(
      cleanInput({
        signals: [...baseSignals(), faceMatchSignal({ verdict: "match", similarity: 0.95 })],
      }),
    );
    expect(verified.outcome).toBe("accept");
    expect(verified.reasonCodes).toEqual([]);

    const missing = decide(
      cleanInput({
        signals: [
          ...baseSignals(),
          { category: "person", source: "face_match", status: "missing", detail: "no_capture" },
        ] as EvidenceSignal[],
      }),
    );
    expect(missing.outcome).toBe("accept");
    expect(missing.reasonCodes).toEqual([]);

    const unavailable = decide(
      cleanInput({
        signals: [
          ...baseSignals(),
          { category: "person", source: "face_match", status: "unavailable" },
        ] as EvidenceSignal[],
      }),
    );
    expect(unavailable.outcome).toBe("accept");
    expect(unavailable.reasonCodes).toEqual([]);
  });
});

describe("missed spot re-check escalation", () => {
  it("escalates an otherwise-clean accept to flag", () => {
    const decision = decide(
      cleanInput({ anomalies: { recentSecurityFailures: 0, missedSpotRecheck: true } }),
    );
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.spotRecheckMissed]);
  });

  it("escalates a would-be step_up to flag", () => {
    const signals = baseSignals().map((signal) =>
      signal.category === "device" ? deviceTrustSignal({ state: "new" }) : signal,
    );
    const decision = decide(
      cleanInput({ signals, anomalies: { recentSecurityFailures: 0, missedSpotRecheck: true } }),
    );
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.spotRecheckMissed]);
  });

  it("keeps repeated_anomaly ahead of spot_recheck_missed when both apply", () => {
    const decision = decide(
      cleanInput({ anomalies: { recentSecurityFailures: 5, missedSpotRecheck: true } }),
    );
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.repeatedAnomaly]);
  });

  it("still rejects on unverified identity even with a failed person signal", () => {
    const signals = baseSignals().filter((signal) => signal.category !== "identity");
    signals.push(faceMatchSignal({ verdict: "spoof_suspected" }));
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("reject");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.identityUnverified]);
  });
});

describe("hard rejection rules", () => {
  it("rejects when no identity signal is verified", () => {
    const signals = baseSignals().filter((signal) => signal.category !== "identity");
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("reject");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.identityUnverified]);
  });

  it("rejects when an identity signal exists but is weak", () => {
    const signals = [
      { category: "identity", source: "passkey_session", status: "weak" },
      ...baseSignals().filter((signal) => signal.category !== "identity"),
    ] as EvidenceSignal[];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("reject");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.identityUnverified]);
  });

  it("rejects when only a weak geolocation signal exists for presence", () => {
    const signals = [
      identitySessionSignal(),
      failurePresenceSignal("expired"),
      deviceTrustSignal({ state: "active" }),
      geolocationSignal({ verdict: "mismatch", distanceMeters: 900 }),
    ];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("reject");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.presenceUnverified]);
  });

  it("rejects on missing presence even with a verified identity and active device", () => {
    const signals = [identitySessionSignal(), deviceTrustSignal({ state: "active" })];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("reject");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.presenceUnverified]);
  });
});

describe("device distrust flagging", () => {
  it.each(["suspended", "revoked", "replaced"] as const)(
    "flags a %s device with the device_state suffix code",
    (state) => {
      const signals = baseSignals().map((signal) =>
        signal.category === "device" ? deviceTrustSignal({ state }) : signal,
      );
      const decision = decide(cleanInput({ signals }));
      expect(decision.outcome).toBe("flag");
      expect(decision.reasonCodes).toEqual([
        RISK_REASON_CODES.deviceDistrusted,
        `${RISK_REASON_CODES.deviceStatePrefix}${state}`,
      ]);
    },
  );

  it("uses an empty state suffix when the failed device signal has no detail", () => {
    const signals = baseSignals().map((signal) =>
      signal.category === "device"
        ? ({ category: "device", source: "trust", status: "failed" } as EvidenceSignal)
        : signal,
    );
    const decision = decide(cleanInput({ signals }));
    expect(decision.reasonCodes).toEqual([
      RISK_REASON_CODES.deviceDistrusted,
      RISK_REASON_CODES.deviceStatePrefix,
    ]);
  });

  it("flags before anomaly escalation when both apply", () => {
    const signals = baseSignals().map((signal) =>
      signal.category === "device" ? deviceTrustSignal({ state: "revoked" }) : signal,
    );
    const decision = decide(cleanInput({ signals, anomalies: { recentSecurityFailures: 10 } }));
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes[0]).toBe(RISK_REASON_CODES.deviceDistrusted);
  });
});

describe("repeated anomaly threshold", () => {
  it("does not escalate just below the threshold", () => {
    const decision = decide(
      cleanInput({
        anomalies: { recentSecurityFailures: RISK_ANOMALY_FLAG_THRESHOLD - 1 },
      }),
    );
    expect(decision.outcome).toBe("accept");
    expect(decision.reasonCodes).toEqual([]);
  });

  it("flags at the threshold for otherwise-clean evidence", () => {
    const decision = decide(cleanInput({ anomalies: { recentSecurityFailures: 3 } }));
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.repeatedAnomaly]);
  });

  it("escalates would-be step-up inputs to flag at the threshold", () => {
    const signals = baseSignals().map((signal) =>
      signal.category === "device" ? deviceTrustSignal({ state: "enrolled" }) : signal,
    );
    const decision = decide(cleanInput({ signals, anomalies: { recentSecurityFailures: 5 } }));
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.repeatedAnomaly]);
  });

  it("treats absent anomaly context as zero failures", () => {
    const decision = decide({ signals: baseSignals(), now: NOW });
    expect(decision.outcome).toBe("accept");
  });
});

describe("weakness collection to step_up", () => {
  function withDevice(state: Parameters<typeof deviceTrustSignal>[0]): EvidenceSignal[] {
    return baseSignals().map((signal) =>
      signal.category === "device" ? deviceTrustSignal(state) : signal,
    );
  }

  it("steps up for a weak device only", () => {
    const decision = decide(cleanInput({ signals: withDevice({ state: "new" }) }));
    expect(decision.outcome).toBe("step_up");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.deviceUntrusted]);
  });

  it("steps up for a weak enrolled device too", () => {
    const decision = decide(cleanInput({ signals: withDevice({ state: "enrolled" }) }));
    expect(decision.outcome).toBe("step_up");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.deviceUntrusted]);
  });

  it("steps up for a missing device only", () => {
    const decision = decide(cleanInput({ signals: withDevice(null) }));
    expect(decision.outcome).toBe("step_up");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.deviceMissing]);
  });

  it("steps up for a weak geolocation only", () => {
    const signals = baseSignals().map((signal) =>
      signal.category === "presence" && signal.source === "geolocation"
        ? geolocationSignal({ verdict: "mismatch", distanceMeters: 980 })
        : signal,
    );
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("step_up");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.locationMismatch]);
  });

  it("combines weaknesses in stable order regardless of signal order", () => {
    const signals = [
      geolocationSignal({ verdict: "mismatch", distanceMeters: 700 }),
      identitySessionSignal(),
      challengePresenceSignal("session_1"),
      deviceTrustSignal({ state: "new" }),
    ];
    const first = decide(cleanInput({ signals }));
    const reordered = [...signals].reverse();
    const second = decide(cleanInput({ signals: reordered }));
    expect(first.outcome).toBe("step_up");
    expect(first.reasonCodes).toEqual([
      RISK_REASON_CODES.deviceUntrusted,
      RISK_REASON_CODES.locationMismatch,
    ]);
    expect(second.reasonCodes).toEqual(first.reasonCodes);
  });

  it("collects device weak then missing then location mismatch across groups", () => {
    const signals = [
      geolocationSignal({ verdict: "mismatch", distanceMeters: 700 }),
      deviceTrustSignal(null),
      identitySessionSignal(),
      challengePresenceSignal("session_1"),
      deviceTrustSignal({ state: "new" }),
    ];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("step_up");
    expect(decision.reasonCodes).toEqual([
      RISK_REASON_CODES.deviceUntrusted,
      RISK_REASON_CODES.deviceMissing,
      RISK_REASON_CODES.locationMismatch,
    ]);
  });
});

describe("geolocation neutrality", () => {
  it.each([
    { verdict: "inconclusive", distanceMeters: 340 },
    { verdict: "no_reference" },
    { verdict: "unavailable" },
    { verdict: "not_consented" },
  ] as LocationOutcome[])("stays accept for geolocation %j", (outcome) => {
    const signals = baseSignals().map((signal) =>
      signal.category === "presence" && signal.source === "geolocation"
        ? geolocationSignal(outcome)
        : signal,
    );
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("accept");
    expect(decision.reasonCodes).toEqual([]);
  });
});

describe("faculty manual attestation override", () => {
  it("accepts via override despite a distrusted device", () => {
    const signals = [
      deviceTrustSignal({ state: "revoked" }),
      ...manualAttestationSignals("present in room C204"),
    ];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("accept");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.facultyManualOverride]);
  });

  it("override absorbs repeated anomalies too", () => {
    const decision = decide(
      cleanInput({
        signals: manualAttestationSignals("visibly present"),
        anomalies: { recentSecurityFailures: 9 },
      }),
    );
    expect(decision.outcome).toBe("accept");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.facultyManualOverride]);
  });

  it("manual identity without manual presence falls back to normal rules", () => {
    const signals = [
      { category: "identity", source: "faculty_attestation", status: "verified", detail: "note" },
      deviceTrustSignal({ state: "active" }),
    ] as EvidenceSignal[];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("reject");
    expect(decision.reasonCodes).toEqual([RISK_REASON_CODES.presenceUnverified]);
  });

  it("manual identity without its presence half still routes through device distrust", () => {
    const signals = [
      {
        category: "identity",
        source: MANUAL_ATTESTATION_IDENTITY_SOURCE,
        status: "verified",
        detail: "note",
      },
      challengePresenceSignal("session_2"),
      deviceTrustSignal({ state: "suspended" }),
    ] as EvidenceSignal[];
    const decision = decide(cleanInput({ signals }));
    expect(decision.outcome).toBe("flag");
    expect(decision.reasonCodes).toEqual([
      RISK_REASON_CODES.deviceDistrusted,
      `${RISK_REASON_CODES.deviceStatePrefix}suspended`,
    ]);
  });
});

describe("determinism and reproducibility", () => {
  it("produces deep-equal decisions for identical fixed-now input", () => {
    const input = cleanInput({ anomalies: { recentSecurityFailures: 1 } });
    expect(decide(input)).toEqual(decide(input));
    expect(JSON.stringify(decide(input))).toBe(JSON.stringify(decide(input)));
  });

  it("rebuilds the persisted decision exactly from stored evidence", () => {
    const input: RiskInput = {
      signals: [
        identitySessionSignal(),
        challengePresenceSignal("session_9"),
        deviceTrustSignal(null),
        geolocationSignal({ verdict: "no_reference" }),
      ],
      anomalies: { recentSecurityFailures: 2 },
      now: NOW,
    };
    const persisted = decide(input);
    const rebuilt: RiskInput = {
      signals: persisted.evidence.signals,
      anomalies: { recentSecurityFailures: 2 },
      now: persisted.decidedAt,
    };
    expect(rebuilt.signals).toEqual(persisted.evidence.signals);
    expect(decide(rebuilt)).toEqual(persisted);
  });

  it("falls back to Date.now() only when now is undefined", () => {
    const before = Date.now();
    const decision = decide({ signals: baseSignals() });
    const after = Date.now();
    expect(decision.decidedAt).toBeGreaterThanOrEqual(before);
    expect(decision.decidedAt).toBeLessThanOrEqual(after);
  });
});

describe("outcomeToAttendanceState", () => {
  it("maps all four outcomes to attendance states", () => {
    expect(outcomeToAttendanceState("accept")).toBe("verified");
    expect(outcomeToAttendanceState("step_up")).toBe("step_up");
    expect(outcomeToAttendanceState("flag")).toBe("flagged");
    expect(outcomeToAttendanceState("reject")).toBe("rejected");
  });
});
