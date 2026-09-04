// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearQueue,
  dropSynced,
  enqueueStudent,
  hasForeignUnsyncedQueue,
  readQueue,
  rememberBundle,
  removeFromQueue,
  settledStudentIds,
  type OfflineQueueState,
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

  it("drops malformed queued records instead of failing the whole queue", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1");
    // Simulate schema drift / tampering on one record: the other survives.
    const tampered = {
      bundle: state.bundle,
      queued: [...state.queued, { studentId: 42, nonce: "garbage" }],
    };
    window.localStorage.setItem("sannidhi.offline-queue", JSON.stringify(tampered));
    const loaded = readQueue("session_1");
    expect(loaded).not.toBeNull();
    expect(loaded?.queued).toHaveLength(1);
    expect(loaded?.queued[0]?.studentId).toBe("student_1");
  });
});

describe("hasForeignUnsyncedQueue", () => {
  it("reports another session's unsynced records", async () => {
    await enqueueStudent(
      rememberBundle("session_1", BUNDLE),
      { id: "student_1", name: "A" },
      "section_1",
      "n",
    );
    expect(hasForeignUnsyncedQueue("session_2")).toBe(true);
  });

  it("ignores the same session's queue", async () => {
    await enqueueStudent(
      rememberBundle("session_1", BUNDLE),
      { id: "student_1", name: "A" },
      "section_1",
      "n",
    );
    expect(hasForeignUnsyncedQueue("session_1")).toBe(false);
  });

  it("ignores an empty or absent queue", () => {
    rememberBundle("session_1", BUNDLE);
    expect(hasForeignUnsyncedQueue("session_2")).toBe(false);
    expect(hasForeignUnsyncedQueue("session_3")).toBe(false);
  });
});

describe("cross-tab merge", () => {
  it("preserves another tab's queued record when this tab enqueues", async () => {
    // Tab A queues a student and holds its state in memory.
    const tabA = await enqueueStudent(
      rememberBundle("session_1", BUNDLE),
      { id: "student_1", name: "A" },
      "section_1",
      "n1",
    );
    // Tab B never re-minted (that would rotate the key); it just holds a
    // stale in-memory copy from before tab A's attestation.
    const staleTabB: OfflineQueueState = { bundle: BUNDLE, queued: [] };
    const tabB = await enqueueStudent(staleTabB, { id: "student_2", name: "B" }, "section_1", "n2");
    // Tab B's write re-read storage, so it sees and keeps tab A's record.
    expect(tabB.queued).toHaveLength(2);
    expect(tabA.queued).toHaveLength(1);
    // Storage holds both tabs' records — neither silently erased the other.
    const stored = readQueue("session_1");
    expect(stored?.queued.map((record) => record.studentId).sort()).toEqual([
      "student_1",
      "student_2",
    ]);
  });

  it("removal deletes only the removed student across tabs", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1");
    state = await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", "n2");
    // A stale tab removes student_1; storage (with both records) is the truth.
    const staleTab: OfflineQueueState = { bundle: BUNDLE, queued: state.queued.slice(0, 1) };
    const next = removeFromQueue(staleTab, "student_1");
    expect(next?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
    expect(readQueue("session_1")?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
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

  it("drops a duplicate sync result so it is never resubmitted", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n");
    // The server already recorded this nonce on an earlier sync; the batch
    // reports duplicate and settledStudentIds must still include the student
    // so dropSynced removes the record instead of queueing it forever.
    const settled = settledStudentIds([{ studentId: "student_1", status: "duplicate" }]);
    expect(settled.has("student_1")).toBe(true);
    expect(dropSynced(state, settled)).toBeNull();
    expect(readQueue("session_1")).toBeNull();
  });
});

describe("settledStudentIds", () => {
  it("settles every per-record status — no status is a retry", () => {
    const settled = settledStudentIds([
      { studentId: "s1", status: "accepted" },
      { studentId: "s2", status: "step_up" },
      { studentId: "s3", status: "flagged" },
      { studentId: "s4", status: "rejected" },
      { studentId: "s5", status: "duplicate" },
      { studentId: "s6", status: "invalid_signature" },
    ]);
    expect(settled.size).toBe(6);
  });
});

describe("removeFromQueue", () => {
  it("persists the removal so the record stays gone after a dialog reopen", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1");
    state = await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", "n2");
    const next = removeFromQueue(state, "student_1");
    expect(next).not.toBeNull();
    expect(next?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
    expect(readQueue("session_1")?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
  });

  it("wipes storage when the last record is removed", async () => {
    let state = rememberBundle("session_1", BUNDLE);
    state = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n");
    expect(removeFromQueue(state, "student_1")).toBeNull();
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
