import { describe, expect, it } from "vitest";

import {
  RISK_ANOMALY_FLAG_THRESHOLD,
  RISK_POLICY_VERSION,
  RISK_REASON_CODES,
  challengePresenceSignal,
  decide,
  deviceTrustSignal,
  explainDecision,
  faceMatchSignal,
  geolocationSignal,
  identitySessionSignal,
  manualAttestationSignals,
  type RiskInput,
} from "@/lib/risk";
import type { Decision } from "@/lib/decision";

const NOW = 1724400000000;

function input(signals: RiskInput["signals"], anomalies?: RiskInput["anomalies"]): RiskInput {
  return { signals, now: NOW, ...(anomalies ? { anomalies } : {}) };
}

function acceptedDecision(): Decision {
  return decide(
    input([
      identitySessionSignal(),
      challengePresenceSignal("session_1"),
      deviceTrustSignal({ state: "active" }),
      geolocationSignal({ verdict: "consistent", distanceMeters: 40 }),
    ]),
  );
}

function steppedUpDecision(): Decision {
  return decide(
    input([
      identitySessionSignal(),
      challengePresenceSignal("session_1"),
      deviceTrustSignal(null),
      geolocationSignal({ verdict: "mismatch", distanceMeters: 950 }),
    ]),
  );
}

function flaggedDecision(): Decision {
  return decide(
    input([
      identitySessionSignal(),
      challengePresenceSignal("session_1"),
      deviceTrustSignal({ state: "suspended" }),
    ]),
  );
}

function anomalyFlaggedDecision(): Decision {
  return decide(
    input(
      [
        identitySessionSignal(),
        challengePresenceSignal("session_1"),
        deviceTrustSignal({ state: "active" }),
      ],
      { recentSecurityFailures: RISK_ANOMALY_FLAG_THRESHOLD },
    ),
  );
}

describe("student tier", () => {
  it("never exposes raw reason codes or signals", () => {
    const decision = flaggedDecision();
    const explanation = explainDecision(decision, "student");
    expect(explanation.reasons).toEqual([]);
    expect(explanation.signals).toEqual([]);
    for (const code of decision.reasonCodes) {
      expect(JSON.stringify(explanation)).not.toContain(code);
    }
    for (const signal of decision.evidence.signals) {
      expect(JSON.stringify(explanation)).not.toContain(signal.source);
    }
  });

  it("greets an accept as checked in without actions", () => {
    const explanation = explainDecision(acceptedDecision(), "student");
    expect(explanation.headline).toContain("checked in");
    expect(explanation.actions).toEqual([]);
  });

  it("asks for an extra quick check on step_up", () => {
    const explanation = explainDecision(steppedUpDecision(), "student");
    expect(explanation.headline.toLowerCase()).toContain("extra quick check");
    expect(explanation.message).toContain("extra quick check");
  });

  it("maps device_missing and location_mismatch to concrete guidance", () => {
    const explanation = explainDecision(steppedUpDecision(), "student");
    expect(explanation.actions).toContain("Activate your registered device from the Devices page.");
    expect(explanation.actions).toContain(
      "Make sure you are inside the classroom venue, then retry check-in.",
    );
  });

  it("guides on repeated_anomaly and stays quiet on manual override", () => {
    const anomalyExplanation = explainDecision(anomalyFlaggedDecision(), "student");
    expect(anomalyExplanation.actions).toEqual([
      "Several recent attempts were blocked — wait a few minutes or contact your faculty member.",
    ]);

    const overrideDecision = decide(input(manualAttestationSignals("in room")));
    const overrideExplanation = explainDecision(overrideDecision, "student");
    expect(overrideExplanation.headline).toContain("checked in");
    expect(overrideExplanation.actions).toEqual([]);
  });

  it("tells students when verification failed outright", () => {
    const rejected = decide(input([identitySessionSignal()]));
    const explanation = explainDecision(rejected, "student");
    expect(explanation.headline.toLowerCase()).toContain("could not verify");
    expect(explanation.actions).toEqual([]);
  });

  describe("person and spot re-check codes", () => {
    function strongSignals(): RiskInput["signals"] {
      return [
        identitySessionSignal(),
        challengePresenceSignal("session_1"),
        deviceTrustSignal({ state: "active" }),
      ];
    }

    function codesStayHidden(decision: Decision): void {
      const explanation = explainDecision(decision, "student");
      for (const code of decision.reasonCodes) {
        expect(JSON.stringify(explanation)).not.toContain(code);
      }
      expect(explanation.reasons).toEqual([]);
      expect(explanation.signals).toEqual([]);
    }

    it("explains a suspected spoof as sent to faculty review", () => {
      const decision = decide(
        input([...strongSignals(), faceMatchSignal({ verdict: "spoof_suspected" })]),
      );
      const explanation = explainDecision(decision, "student");
      expect(explanation.headline).toContain("faculty review");
      expect(explanation.actions).toEqual([
        "A photo or video was detected instead of a live face — your attendance was sent to your faculty member for review.",
      ]);
      codesStayHidden(decision);
    });

    it("explains a face mismatch as sent to faculty review", () => {
      const decision = decide(
        input([...strongSignals(), faceMatchSignal({ verdict: "mismatch", similarity: 0.4 })]),
      );
      const explanation = explainDecision(decision, "student");
      expect(explanation.headline).toContain("faculty review");
      expect(explanation.actions).toEqual([
        "Your face did not match your enrolled profile — your attendance was sent to your faculty member for review.",
      ]);
      codesStayHidden(decision);
    });

    it("suggests better light for an inconclusive face check", () => {
      const signals = [
        ...strongSignals(),
        geolocationSignal({ verdict: "mismatch", distanceMeters: 900 }),
        faceMatchSignal({ verdict: "inconclusive" }),
      ];
      const decision = decide(input(signals));
      expect(decision.outcome).toBe("step_up");
      const explanation = explainDecision(decision, "student");
      expect(explanation.actions).toContain(
        "Lighting or visibility made the face check inconclusive — try again in better light if prompted.",
      );
      codesStayHidden(decision);
    });

    it("points to faculty after an expired spot re-check", () => {
      const decision = decide(
        input(strongSignals(), { recentSecurityFailures: 0, missedSpotRecheck: true }),
      );
      const explanation = explainDecision(decision, "student");
      expect(explanation.actions).toEqual([
        "A spot re-check request expired — contact your faculty member.",
      ]);
      codesStayHidden(decision);
    });
  });
});

describe("faculty tier", () => {
  it("exposes reason codes verbatim but never raw signals", () => {
    const decision = steppedUpDecision();
    const explanation = explainDecision(decision, "faculty");
    expect(explanation.reasons).toEqual(decision.reasonCodes);
    expect(explanation.signals).toEqual([]);
    expect(explanation.actions).toEqual([]);
  });

  it("summarizes challenged factors in plain language", () => {
    const explanation = explainDecision(steppedUpDecision(), "faculty");
    expect(explanation.message).toContain("Challenged factors:");
    expect(explanation.message).toContain("device missing");
    expect(explanation.message).toContain("location mismatch");
  });

  it("renders device_state suffix codes readably", () => {
    const decision = flaggedDecision();
    const explanation = explainDecision(decision, "faculty");
    expect(explanation.reasons).toContain(`${RISK_REASON_CODES.deviceStatePrefix}suspended`);
    expect(explanation.reasons).toContain(RISK_REASON_CODES.deviceDistrusted);
    expect(explanation.message).toContain("device state suspended");
  });

  it("names person and spot re-check factors in plain language", () => {
    const spoofDecision = decide(
      input([
        identitySessionSignal(),
        challengePresenceSignal("session_1"),
        deviceTrustSignal({ state: "active" }),
        faceMatchSignal({ verdict: "spoof_suspected" }),
      ]),
    );
    const mismatchDecision = decide(
      input([
        identitySessionSignal(),
        challengePresenceSignal("session_1"),
        deviceTrustSignal({ state: "active" }),
        faceMatchSignal({ verdict: "mismatch", similarity: 0.4 }),
      ]),
    );
    const inconclusiveDecision = decide(
      input([
        identitySessionSignal(),
        challengePresenceSignal("session_1"),
        deviceTrustSignal({ state: "active" }),
        geolocationSignal({ verdict: "mismatch", distanceMeters: 900 }),
        faceMatchSignal({ verdict: "inconclusive" }),
      ]),
    );
    const spotDecision = decide(
      input(
        [
          identitySessionSignal(),
          challengePresenceSignal("session_1"),
          deviceTrustSignal({ state: "active" }),
        ],
        { recentSecurityFailures: 0, missedSpotRecheck: true },
      ),
    );

    expect(explainDecision(spoofDecision, "faculty").message).toContain(
      "Face check: suspected photo/video",
    );
    expect(explainDecision(mismatchDecision, "faculty").message).toContain("Face check: no match");
    expect(explainDecision(inconclusiveDecision, "faculty").message).toContain(
      "Face check inconclusive",
    );
    expect(explainDecision(spotDecision, "faculty").message).toContain("Spot re-check missed");
  });
});

describe("admin tier", () => {
  it("preserves reasons and deep-copied signals plus policy version and outcome", () => {
    const decision = flaggedDecision();
    const explanation = explainDecision(decision, "admin");

    expect(explanation.reasons).toEqual(decision.reasonCodes);
    expect(explanation.signals).toEqual(decision.evidence.signals);
    expect(explanation.signals[0]).not.toBe(decision.evidence.signals[0]);
    expect(explanation.message).toContain(RISK_POLICY_VERSION);
    expect(explanation.message).toContain(decision.outcome);
    expect(explanation.actions).toEqual([]);
  });

  it("deep copies are isolated from the persisted evidence", () => {
    const decision = flaggedDecision();
    const explanation = explainDecision(decision, "admin");
    const firstSignal = explanation.signals[0];
    if (firstSignal) firstSignal.status = "tampered";
    expect(decision.evidence.signals[0]?.status).not.toBe("tampered");
  });
});
