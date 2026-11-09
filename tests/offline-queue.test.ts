// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearQueue,
  dropSynced,
  enqueueStudent,
  hasAnyUnsyncedRecords,
  mintBundle,
  readQueue,
  removeFromQueue,
  settledStudentIds,
  subscribeQueueCleared,
  type OfflineQueueState,
} from "@/lib/client/offline-queue";
import { verifySignature } from "@/lib/offline/bundle";

const STORAGE_KEY = "sannidhi.offline-queue";
const BUNDLE = { sessionId: "session_1", key: "a".repeat(64) };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function requireState(state: OfflineQueueState | null): OfflineQueueState {
  if (state === null) throw new Error("expected queue state");
  return state;
}

async function freshQueue(): Promise<OfflineQueueState> {
  return requireState(await mintBundle(async () => BUNDLE));
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("mintBundle / readQueue", () => {
  it("round-trips a fresh bundle with an empty queue", async () => {
    const state = await freshQueue();
    expect(state.queued).toEqual([]);
    const loaded = readQueue("session_1");
    expect(loaded).not.toBeNull();
    expect(loaded?.bundle).toEqual(BUNDLE);
    expect(loaded?.queued).toEqual([]);
  });

  it("returns null when nothing is stored", () => {
    expect(readQueue("session_1")).toBeNull();
  });

  it("returns null for a different session's queue — one live class window", async () => {
    await freshQueue();
    expect(readQueue("session_2")).toBeNull();
    expect(readQueue("session_1")).not.toBeNull();
  });

  it("returns null on corrupted storage instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readQueue("session_1")).toBeNull();
  });

  it("returns null when the stored shape is wrong", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bundle: null }));
    expect(readQueue("session_1")).toBeNull();
  });

  it("drops malformed queued records instead of failing the whole queue", async () => {
    let state = await freshQueue();
    state = requireState(
      await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1"),
    );
    // Simulate schema drift / tampering on one record: the other survives.
    const tampered = {
      bundle: state.bundle,
      queued: [...state.queued, { studentId: 42, nonce: "garbage" }],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tampered));
    const loaded = readQueue("session_1");
    expect(loaded).not.toBeNull();
    expect(loaded?.queued).toHaveLength(1);
    expect(loaded?.queued[0]?.studentId).toBe("student_1");
  });

  it("refuses to replace a queue that still holds an unsynced record", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    expect(state.queued).toHaveLength(1);
    const minted = await mintBundle(async () => ({ sessionId: "session_2", key: "b".repeat(64) }));
    expect(minted).toBeNull();
    // The original record — and the key that signs it — survives.
    expect(readQueue("session_1")?.queued).toHaveLength(1);
  });

  it("leases the device while a mint is in flight: no mint or attestation slips in", async () => {
    const state = await freshQueue();
    const pendingMint = deferred<typeof BUNDLE>();
    const minting = mintBundle(() => pendingMint.promise);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      await mintBundle(async () => ({ sessionId: "session_1", key: "b".repeat(64) })),
    ).toBeNull();
    expect(
      await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n"),
    ).toBeNull();

    pendingMint.resolve({ sessionId: "session_1", key: "c".repeat(64) });
    const minted = await minting;
    expect(minted?.bundle.key).toBe("c".repeat(64));
  });

  it("discards a mint that completes after sign-out", async () => {
    await freshQueue();
    const pendingMint = deferred<typeof BUNDLE>();
    const minting = mintBundle(() => pendingMint.promise);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await clearQueue();
    pendingMint.resolve({ sessionId: "session_1", key: "c".repeat(64) });

    expect(await minting).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("discards a mint that started on empty storage and outlived a sign-out", async () => {
    // No queue at all: the old snapshot check could not tell "still empty"
    // from "wiped while we were away". The lease token and epoch can.
    const pendingMint = deferred<typeof BUNDLE>();
    const minting = mintBundle(() => pendingMint.promise);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await clearQueue();
    pendingMint.resolve({ sessionId: "session_1", key: "c".repeat(64) });

    expect(await minting).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("re-signs records queued after its lease expired instead of invalidating them", async () => {
    const state = await freshQueue();
    const pendingMint = deferred<typeof BUNDLE>();
    const minting = mintBundle(() => pendingMint.promise);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A stalled mint's lease expires, so another attestation is allowed in
    // with the key the server is about to rotate away.
    const lease = JSON.parse(
      window.localStorage.getItem("sannidhi.offline-queue.minting") ?? "{}",
    ) as {
      token: string;
      startedAt: number;
    };
    window.localStorage.setItem(
      "sannidhi.offline-queue.minting",
      JSON.stringify({ ...lease, startedAt: Date.now() - 31_000 }),
    );
    const queued = requireState(
      await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n"),
    );
    expect(queued.queued).toHaveLength(1);

    pendingMint.resolve({ sessionId: "session_1", key: "c".repeat(64) });
    const minted = await minting;
    expect(minted?.bundle.key).toBe("c".repeat(64));
    expect(minted?.queued).toHaveLength(1);

    // The record survived, now signed with the rotated key.
    const [{ studentName, ...signed }] = minted?.queued ?? [];
    expect(studentName).toBe("A");
    expect(await verifySignature("c".repeat(64), signed)).toBe(true);
  });
});

describe("hasAnyUnsyncedRecords", () => {
  it("reports any unsynced record — same session or another", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    expect(state.queued).toHaveLength(1);
    // Minting overwrites the queue and rotates the key: any queued record
    // blocks it, regardless of which session queued it.
    expect(hasAnyUnsyncedRecords()).toBe(true);
  });

  it("ignores an empty or absent queue", async () => {
    await freshQueue();
    expect(hasAnyUnsyncedRecords()).toBe(false);
  });
});

describe("cross-tab merge", () => {
  it("preserves another tab's queued record when this tab enqueues", async () => {
    // Tab A queues a student and holds its state in memory.
    const tabA = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n1"),
    );
    // Tab B never re-minted (that would rotate the key); it just holds a
    // stale in-memory copy from before tab A's attestation.
    const staleTabB: OfflineQueueState = { bundle: BUNDLE, queued: [] };
    const tabB = requireState(
      await enqueueStudent(staleTabB, { id: "student_2", name: "B" }, "section_1", "n2"),
    );
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
    let state = await freshQueue();
    state = requireState(
      await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1"),
    );
    state = requireState(
      await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", "n2"),
    );
    // A stale tab removes student_1; storage (with both records) is the truth.
    const staleTab: OfflineQueueState = { bundle: BUNDLE, queued: state.queued.slice(0, 1) };
    const next = await removeFromQueue(staleTab, "student_1");
    expect(next?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
    expect(readQueue("session_1")?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
  });
});

describe("enqueueStudent", () => {
  it("signs and persists one record per attested student", async () => {
    let state = await freshQueue();
    state = requireState(
      await enqueueStudent(state, { id: "student_1", name: "Aarav Patel" }, "section_1", "present"),
    );
    expect(state.queued).toHaveLength(1);
    expect(state.queued[0]?.studentName).toBe("Aarav Patel");
    expect(state.queued[0]?.studentId).toBe("student_1");
    expect(state.queued[0]?.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(readQueue("session_1")?.queued).toHaveLength(1);
  });

  it("uses a fresh nonce per record so replays dedupe server-side", async () => {
    let state = await freshQueue();
    state = requireState(
      await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", ""),
    );
    state = requireState(
      await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", ""),
    );
    const nonces = state.queued.map((record) => record.nonce);
    expect(new Set(nonces).size).toBe(2);
  });

  it("omits an empty note from the signed payload instead of signing a blank", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "   "),
    );
    expect("note" in state.queued[0]).toBe(false);
  });

  it("abandons an attestation signed after the queue was wiped", async () => {
    const state = await freshQueue();
    // Signing is async; sign-out wipes storage while the attestation is in
    // flight. Persisting it afterwards would restore student names post-logout.
    const pending = enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n");
    await clearQueue();
    await pending;
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("abandons an attestation when another tab rotates the key mid-sign", async () => {
    const state = await freshQueue();
    const rotated = { sessionId: "session_1", key: "b".repeat(64) };
    const signSpy = vi.spyOn(crypto.subtle, "sign").mockImplementation(async () => {
      // Another tab mints the same session while this signature is in flight.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bundle: rotated, queued: [] }));
      return new ArrayBuffer(32);
    });
    try {
      const next = await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n");
      // The signature would be invalid against the rotated key: never persist it.
      expect(next).toBeNull();
      expect(readQueue("session_1")?.bundle).toEqual(rotated);
      expect(readQueue("session_1")?.queued).toEqual([]);
    } finally {
      signSpy.mockRestore();
    }
  });
});

describe("dropSynced", () => {
  it("removes only the synced students and keeps the rest", async () => {
    let state = await freshQueue();
    state = requireState(
      await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1"),
    );
    state = requireState(
      await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", "n2"),
    );
    const next = await dropSynced(state, new Set(["student_1"]));
    expect(next).not.toBeNull();
    expect(next?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
    expect(readQueue("session_1")?.queued).toHaveLength(1);
  });

  it("clears storage entirely once nothing is left", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    expect(await dropSynced(state, new Set(["student_1"]))).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drops a duplicate sync result so it is never resubmitted", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    // The server already recorded this nonce on an earlier sync; the batch
    // reports duplicate and settledStudentIds must still include the student
    // so dropSynced removes the record instead of queueing it forever.
    const settled = settledStudentIds([{ studentId: "student_1", status: "duplicate" }]);
    expect(settled.has("student_1")).toBe(true);
    expect(await dropSynced(state, settled)).toBeNull();
    expect(readQueue("session_1")).toBeNull();
  });

  it("aborts instead of restoring a queue wiped by sign-out", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    window.localStorage.removeItem(STORAGE_KEY);
    expect(await dropSynced(state, new Set(["student_1"]))).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
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
    let state = await freshQueue();
    state = requireState(
      await enqueueStudent(state, { id: "student_1", name: "A" }, "section_1", "n1"),
    );
    state = requireState(
      await enqueueStudent(state, { id: "student_2", name: "B" }, "section_1", "n2"),
    );
    const next = await removeFromQueue(state, "student_1");
    expect(next).not.toBeNull();
    expect(next?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
    expect(readQueue("session_1")?.queued.map((record) => record.studentId)).toEqual(["student_2"]);
  });

  it("wipes storage when the last record is removed", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    expect(await removeFromQueue(state, "student_1")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("aborts instead of restoring a queue wiped by sign-out", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    window.localStorage.removeItem(STORAGE_KEY);
    expect(await removeFromQueue(state, "student_1")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("never clears another session's freshly minted queue", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    // Another tab mints a new session, replacing storage under this stale tab.
    const otherBundle = { sessionId: "session_2", key: "b".repeat(64) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bundle: otherBundle, queued: [] }));

    expect(await removeFromQueue(state, "student_1")).toBeNull();
    expect(readQueue("session_2")?.bundle).toEqual(otherBundle);
    expect(await dropSynced(state, new Set(["student_1"]))).toBeNull();
    expect(readQueue("session_2")?.bundle).toEqual(otherBundle);
  });
});

describe("clearQueue", () => {
  it("wipes any stored queue", async () => {
    const state = requireState(
      await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n"),
    );
    expect(state.queued).toHaveLength(1);
    await clearQueue();
    expect(readQueue("session_1")).toBeNull();
  });

  it("broadcasts the wipe so live tabs can drop their in-memory copies", async () => {
    await enqueueStudent(await freshQueue(), { id: "student_1", name: "A" }, "section_1", "n");
    const seen: string[] = [];
    const unsubscribe = subscribeQueueCleared(() => seen.push("cleared"));
    await clearQueue();
    // BroadcastChannel delivery is a task, not a microtask; poll instead of
    // assuming a single tick is enough.
    await vi.waitFor(() => expect(seen).toEqual(["cleared"]));
    unsubscribe();
  });
});
