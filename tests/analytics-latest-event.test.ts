import { describe, expect, it } from "vitest";

import { latestEventBySession } from "../convex/lib/analytics_projection";
import type { Doc, Id } from "../convex/_generated/dataModel";

type FakeEvent = Doc<"attendance_events">;

let seqCounter = 0;

function event(overrides: {
  _id: string;
  sessionId?: string;
  state: FakeEvent["state"];
  capturedAt: number;
}): FakeEvent {
  seqCounter += 1;
  return {
    _id: overrides._id as Id<"attendance_events">,
    _creationTime: 1,
    institutionId: "inst1" as Id<"institutions">,
    studentId: "s1" as Id<"users">,
    sectionId: "sec1" as Id<"sections">,
    ...(overrides.sessionId !== undefined
      ? { sessionId: overrides.sessionId as Id<"class_sessions"> }
      : {}),
    state: overrides.state,
    origin: "online",
    seq: seqCounter,
    eventHash: "hash",
    capturedAt: overrides.capturedAt,
  } as FakeEvent;
}

describe("latestEventBySession", () => {
  it("resolves one record per session no matter how many events it emitted", () => {
    const latest = latestEventBySession([
      event({ _id: "e1", sessionId: "sess1", state: "step_up", capturedAt: 100 }),
      event({ _id: "e2", sessionId: "sess1", state: "flagged", capturedAt: 200 }),
      event({ _id: "e3", sessionId: "sess1", state: "verified", capturedAt: 300 }),
    ]);
    expect(latest.size).toBe(1);
    expect(latest.get("sess1" as Id<"class_sessions">)?._id).toBe("e3");
    expect(latest.get("sess1" as Id<"class_sessions">)?.state).toBe("verified");
  });

  it("keeps sessions independent", () => {
    const latest = latestEventBySession([
      event({ _id: "e1", sessionId: "sess1", state: "verified", capturedAt: 100 }),
      event({ _id: "e2", sessionId: "sess2", state: "flagged", capturedAt: 200 }),
    ]);
    expect(latest.size).toBe(2);
    expect(latest.get("sess1" as Id<"class_sessions">)?.state).toBe("verified");
    expect(latest.get("sess2" as Id<"class_sessions">)?.state).toBe("flagged");
  });

  it("prefers the later event on capturedAt ties (later append wins)", () => {
    const latest = latestEventBySession([
      event({ _id: "e1", sessionId: "sess1", state: "flagged", capturedAt: 500 }),
      event({ _id: "e2", sessionId: "sess1", state: "corrected", capturedAt: 500 }),
    ]);
    expect(latest.get("sess1" as Id<"class_sessions">)?._id).toBe("e2");
  });

  it("ignores session-less events entirely", () => {
    const latest = latestEventBySession([event({ _id: "e1", state: "verified", capturedAt: 100 })]);
    expect(latest.size).toBe(0);
  });

  // Audit regression H3: a check-in that lands pending (step_up) then gets
  // corrected must surface the correction, not the intermediate.
  it("resolves a corrected terminal state over its earlier decision events", () => {
    const latest = latestEventBySession([
      event({ _id: "e1", sessionId: "sess1", state: "rejected", capturedAt: 100 }),
      event({ _id: "e2", sessionId: "sess1", state: "corrected", capturedAt: 200 }),
    ]);
    expect(latest.get("sess1" as Id<"class_sessions">)?.state).toBe("corrected");
  });
});
