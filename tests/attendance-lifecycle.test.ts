// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_CHAIN_EVENT_TYPE,
  ATTENDANCE_ORIGINS,
  ATTENDANCE_STATES,
  CORRECTIONABLE_STATES,
  attendanceChainHashInput,
  attendanceChainPayload,
  canFollowInPipeline,
  isStartableState,
  isValidCorrection,
  type AttendanceEventState,
} from "@/lib/attendance/lifecycle";
import { computeEventHash } from "@/lib/ledger/hash";

const ALL_STATES: readonly AttendanceEventState[] = ATTENDANCE_STATES;
const INTERMEDIATES: readonly AttendanceEventState[] = [
  "initiated",
  "authenticated",
  "session_verified",
  "presence_evaluated",
  "risk_evaluated",
];
const DECISIONS: readonly AttendanceEventState[] = ["step_up", "verified", "flagged", "rejected"];

const baseFields = {
  institutionId: "inst_1",
  studentId: "user_student",
  sectionId: "section_1",
  state: "verified" as AttendanceEventState,
  origin: "online" as const,
  policyVersion: "risk-engine/v1",
};

describe("ATTENDANCE_STATES", () => {
  it("lists the full lifecycle in pipeline-then-decision order", () => {
    expect([...ATTENDANCE_STATES]).toEqual([
      "initiated",
      "authenticated",
      "session_verified",
      "presence_evaluated",
      "risk_evaluated",
      "step_up",
      "verified",
      "flagged",
      "rejected",
      "corrected",
    ]);
  });

  it("keeps correctionable states to the terminal decisions", () => {
    expect([...CORRECTIONABLE_STATES]).toEqual(["verified", "flagged", "rejected"]);
    for (const state of CORRECTIONABLE_STATES) {
      expect(ATTENDANCE_STATES).toContain(state);
    }
    for (const state of ["corrected", ...INTERMEDIATES, "step_up"] as const) {
      expect(CORRECTIONABLE_STATES).not.toContain(state);
    }
  });

  it("covers exactly the three known origins", () => {
    expect([...ATTENDANCE_ORIGINS]).toEqual(["online", "offline-faculty", "mobile"]);
  });
});

describe("isStartableState", () => {
  it("allows every state except corrected to begin an attempt entry", () => {
    for (const state of ALL_STATES) {
      expect(isStartableState(state)).toBe(state !== "corrected");
    }
  });
});

describe("isValidCorrection", () => {
  it("requires correctsEventId exactly when the state is corrected", () => {
    for (const state of ALL_STATES) {
      expect(isValidCorrection(state, undefined)).toBe(state !== "corrected");
      expect(isValidCorrection(state, "evt_1")).toBe(state === "corrected");
    }
  });
});

describe("canFollowInPipeline", () => {
  it("advances intermediates one step at a time", () => {
    for (let i = 0; i < INTERMEDIATES.length - 1; i += 1) {
      expect(canFollowInPipeline(INTERMEDIATES[i], INTERMEDIATES[i + 1])).toBe(true);
    }
  });

  it("rejects skipping intermediate steps", () => {
    expect(canFollowInPipeline("initiated", "session_verified")).toBe(false);
    expect(canFollowInPipeline("initiated", "risk_evaluated")).toBe(false);
    expect(canFollowInPipeline("authenticated", "presence_evaluated")).toBe(false);
  });

  it("lets any intermediate land on any decision state", () => {
    for (const prev of INTERMEDIATES) {
      for (const decision of DECISIONS) {
        expect(canFollowInPipeline(prev, decision)).toBe(true);
      }
    }
  });

  it("never leaves a decision state or reenters the pipeline from one", () => {
    for (const next of ALL_STATES) {
      for (const decision of DECISIONS) {
        expect(canFollowInPipeline(decision, next)).toBe(false);
      }
    }
    expect(canFollowInPipeline("corrected", "verified")).toBe(false);
  });

  it("treats corrections as overwrites, not pipeline steps", () => {
    for (const prev of INTERMEDIATES) {
      expect(canFollowInPipeline(prev, "corrected")).toBe(false);
    }
  });
});

describe("attendanceChainPayload", () => {
  it("includes optionals only when present (never as undefined)", () => {
    const full = attendanceChainPayload({
      ...baseFields,
      sessionId: "session_1",
      correctsEventId: "evt_9",
    });
    expect(full).toEqual({
      studentId: "user_student",
      sessionId: "session_1",
      sectionId: "section_1",
      state: "verified",
      origin: "online",
      policyVersion: "risk-engine/v1",
      correctsEventId: "evt_9",
    });

    const minimal = attendanceChainPayload(baseFields);
    expect(Object.keys(minimal).sort()).toEqual([
      "origin",
      "policyVersion",
      "sectionId",
      "state",
      "studentId",
    ]);
    expect("sessionId" in minimal).toBe(false);
    expect("correctsEventId" in minimal).toBe(false);
  });
});

describe("attendanceChainHashInput", () => {
  it("stamps the attendance chain type and subject", () => {
    const input = attendanceChainHashInput({ ...baseFields, seq: 0 });
    expect(input.category).toBe("attendance");
    expect(input.type).toBe(ATTENDANCE_CHAIN_EVENT_TYPE);
    expect(ATTENDANCE_CHAIN_EVENT_TYPE).toBe("attendance.session_checkin");
    expect(input.subjectUserId).toBe("user_student");
    expect(input.institutionId).toBe("inst_1");
  });

  it("hashes deterministically and is sensitive to every lifecycle field", async () => {
    const baseline = await computeEventHash(attendanceChainHashInput({ ...baseFields, seq: 3 }));
    expect(baseline).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeEventHash(attendanceChainHashInput({ ...baseFields, seq: 3 }))).toBe(
      baseline,
    );

    const mutations = [
      attendanceChainHashInput({ ...baseFields, seq: 3, state: "rejected" }),
      attendanceChainHashInput({ ...baseFields, seq: 3, origin: "offline-faculty" as const }),
      attendanceChainHashInput({ ...baseFields, seq: 3, sessionId: "session_1" }),
      attendanceChainHashInput({ ...baseFields, seq: 3, correctsEventId: "evt_9" }),
      attendanceChainHashInput({ ...baseFields, seq: 3, policyVersion: "risk-engine/v2" }),
      attendanceChainHashInput({ ...baseFields, seq: 4 }),
    ];
    for (const mutated of mutations) {
      expect(await computeEventHash(mutated)).not.toBe(baseline);
    }
  });

  it("chains: an event's hash feeds the next event's input", async () => {
    const firstInput = attendanceChainHashInput({ ...baseFields, seq: 0 });
    const first = await computeEventHash(firstInput);
    const secondInput = attendanceChainHashInput({
      ...baseFields,
      state: "corrected",
      correctsEventId: "evt_0",
      seq: 1,
      prevEventHash: first,
    });
    const second = await computeEventHash(secondInput);
    expect(await computeEventHash(secondInput)).toBe(second);
    expect(await computeEventHash({ ...secondInput, prevEventHash: "f".repeat(64) })).not.toBe(
      second,
    );
  });

  it("writer and verifier agree when recomputing from stored row fields", async () => {
    const writerFields = {
      ...baseFields,
      sessionId: "session_1",
      state: "flagged" as AttendanceEventState,
      seq: 7,
      prevEventHash: "a".repeat(64),
    };
    const storedRow = {
      institutionId: writerFields.institutionId,
      studentId: writerFields.studentId,
      sectionId: writerFields.sectionId,
      sessionId: writerFields.sessionId,
      state: writerFields.state,
      origin: writerFields.origin,
      policyVersion: writerFields.policyVersion,
      correctsEventId: undefined,
      seq: writerFields.seq,
      prevEventHash: writerFields.prevEventHash,
      eventHash: await computeEventHash(attendanceChainHashInput(writerFields)),
    };
    // The verifier rebuilds the hash purely from the row, via the same helper.
    const recomputed = await computeEventHash(attendanceChainHashInput(storedRow));
    expect(recomputed).toBe(storedRow.eventHash);
  });
});
