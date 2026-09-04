// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearQueue,
  dropSynced,
  enqueueStudent,
  readQueue,
  rememberBundle,
} from "@/lib/client/offline-queue";

const BUNDLE = { sessionId: "session_1", key: "a".repeat(64) };

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("rememberBundle / readQueue", () => {
  it("round-trips a fresh bundle with an empty queue", () => {
    const state = rememberBundle("session_1", BUNDLE);
    expect(state.queued).toEqual([]);
    const loaded = readQueue("session_1");
    expect(loaded).not.toBeNull();
    expect(loaded?.bundle).toEqual(BUNDLE);
    expect(loaded?.queued).toEqual([]);
  });

  it("returns null when nothing is stored", () => {
    expect(readQueue("session_1")).toBeNull();
  });

  it("returns null for a different session's queue — one live class window", () => {
    rememberBundle("session_1", BUNDLE);
    expect(readQueue("session_2")).toBeNull();
    expect(readQueue("session_1")).not.toBeNull();
  });

  it("returns null on corrupted storage instead of throwing", () => {
    window.localStorage.setItem("sannidhi.offline-queue", "{not json");
    expect(readQueue("session_1")).toBeNull();
  });

  it("returns null when the stored shape is wrong", () => {
    window.localStorage.setItem("sannidhi.offline-queue", JSON.stringify({ bundle: null }));
    expect(readQueue("session_1")).toBeNull();
  });
});

describe("enqueueStudent", () => {
  it("signs and persists one record per attested student", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(
      state,
      { id: "student_1", name: "Aarav Patel" },
      "section_1",
      "present, back row",
    );
    expect(state.queued).toHaveLength(1);
    expect(state.queued[0]?.studentName).toBe("Aarav Patel");
    expect(state.queued[0]?.studentId).toBe("student_1");
    expect(state.queued[0]?.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(readQueue("session_1")?.queued).toHaveLength(1);
  });

  it("uses a fresh nonce per record so replays dedupe server-side", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "");
    state = await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", "");
    const nonces = state.queued.map((record) => record.nonce);
    expect(new Set(nonces).size).toBe(2);
  });

  it("omits an empty note from the signed payload instead of signing a blank", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "   ");
    expect("note" in state.queued[0]).toBe(false);
  });
});

describe("dropSynced", () => {
  it("removes only the synced students and keeps the rest", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1");
    state = await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", "n2");
    const next = dropSynced(state, new Set(["student_1"]));
    expect(next).not.toBeNull();
    expect(next?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
    expect(readQueue("session_1")?.queued).toHaveLength(1);
  });

  it("clears storage entirely once nothing is left", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n");
    expect(dropSynced(state, new Set(["student_1"]))).toBeNull();
    expect(window.localStorage.getItem("sannidhi.offline-queue")).toBeNull();
  });
});

describe("clearQueue", () => {
  it("wipes any stored queue", async () => {
    const state = await enqueueStudent(
      rememberBundle("session_1", BUNDLE),
      { id: "student_1", name: "A" },
      "section_1",
      "n",
    );
    expect(state.queued).toHaveLength(1);
    clearQueue();
    expect(readQueue("session_1")).toBeNull();
  });
});
