"use client";

import { signRecord, type OfflineBundle, type SignedOfflineRecord } from "@/lib/offline/bundle";

/**
 * Browser-side faculty device queue for offline capture (spec §13+§20).
 *
 * Mirrors the contract in src/lib/offline/bundle.ts: a pre-authorized bundle key
 * signs per-student records while the device is offline; syncOfflineBatch
 * re-verifies and dedupes them later. The queue is deliberately plain —
 * structured clone in localStorage is enough for one live class window, and a
 * stale queue simply fails HMAC verification after a re-mint rotates the key.
 *
 * Multiple tabs share one storage key, so every mutation runs under the Web
 * Locks API (navigator.locks) when available: the read-modify-write cycle is
 * serialized across tabs, so one tab's edit can never silently erase
 * another tab's queued records. Reads validate every queued item: a malformed
 * record (tampered storage, schema drift) is dropped instead of bricking
 * the queue.
 */

const STORAGE_KEY = "sannidhi.offline-queue";
const QUEUE_LOCK_NAME = "sannidhi.offline-queue.lock";
/** BroadcastChannel announcing a queue wipe so live tabs drop their in-memory copies. */
const QUEUE_CLEARED_CHANNEL = "sannidhi.offline-queue.cleared";

export type QueuedRecord = SignedOfflineRecord & { studentName: string };

export type OfflineQueueState = {
  bundle: OfflineBundle;
  queued: QueuedRecord[];
};

function isQueuedRecord(value: unknown): value is QueuedRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionId === "string" &&
    typeof record.sectionId === "string" &&
    typeof record.studentId === "string" &&
    typeof record.capturedAt === "number" &&
    typeof record.nonce === "string" &&
    typeof record.signature === "string" &&
    typeof record.studentName === "string" &&
    (record.note === undefined || typeof record.note === "string")
  );
}

function loadState(sessionId: string): OfflineQueueState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineQueueState> | null;
    if (
      parsed === null ||
      parsed.bundle?.sessionId !== sessionId ||
      typeof parsed.bundle.key !== "string" ||
      !Array.isArray(parsed.queued)
    ) {
      return null;
    }
    // Malformed records are dropped, not fatal: one tampered row must not
    // brick the whole queue's sync loop.
    const queued = parsed.queued.filter(isQueuedRecord);
    return { bundle: parsed.bundle, queued };
  } catch {
    return null;
  }
}

function saveState(state: OfflineQueueState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Wipes storage synchronously — for callers already holding the queue lock. */
function clearStorageSynced(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

function broadcastCleared(): void {
  try {
    new BroadcastChannel(QUEUE_CLEARED_CHANNEL).postMessage("cleared");
  } catch {
    // BroadcastChannel can be unavailable; the wipe itself already happened.
  }
}

/**
 * Runs a mutation under a cross-tab lock when the browser supports Web Locks
 * (all modern ones do); without it we fall back to best-effort merge, same
 * as before the lock existed.
 */
async function withQueueLock<T>(action: () => T | Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks === undefined) return action();
  return locks.request(QUEUE_LOCK_NAME, { mode: "exclusive" }, () => action());
}

/**
 * Wipes the queue under the lock and broadcasts the wipe. The lock means an
 * in-flight mutation cannot restore storage after it; the broadcast means
 * live tabs drop their in-memory copies.
 */
export async function clearQueue(): Promise<void> {
  await withQueueLock(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });
  broadcastCleared();
}

/** Loads the queue for one session; other sessions' queues are discarded (one live class window). */
export function readQueue(sessionId: string): OfflineQueueState | null {
  return loadState(sessionId);
}

/**
 * Whether the stored queue holds any valid unsynced record at all — same
 * session or another one. Minting overwrites (and the server mint rotates
 * the key for) whatever is stored, so any queued record blocks it.
 */
export function hasAnyUnsyncedRecords(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    const parsed = JSON.parse(raw) as Partial<OfflineQueueState> | null;
    if (parsed === null || typeof parsed.bundle?.sessionId !== "string") return false;
    return Array.isArray(parsed.queued) && parsed.queued.some(isQueuedRecord);
  } catch {
    return false;
  }
}

/**
 * Mints a fresh bundle and replaces the stored queue with it. The empty-queue
 * check, the server key rotation, and the replacement all run under the queue
 * lock, so a concurrent attestation can neither be destroyed by the replacement
 * nor signed with a key the server just rotated away. Returns null when the
 * device still holds unsynced records.
 */
export async function mintBundle(
  mint: () => Promise<OfflineBundle>,
): Promise<OfflineQueueState | null> {
  return withQueueLock(async () => {
    if (hasAnyUnsyncedRecords()) return null;
    const bundle = await mint();
    const state: OfflineQueueState = { bundle, queued: [] };
    saveState(state);
    return state;
  });
}

/** Signs and appends one attestation; each record gets a fresh nonce so replays dedupe server-side. */
export async function enqueueStudent(
  state: OfflineQueueState,
  student: { id: string; name: string },
  sectionId: string,
  note: string,
): Promise<OfflineQueueState | null> {
  const record = await signRecord(state.bundle.key, {
    sessionId: state.bundle.sessionId,
    sectionId,
    studentId: student.id,
    capturedAt: Date.now(),
    nonce: crypto.randomUUID(),
    ...(note.trim().length > 0 ? { note: note.trim() } : {}),
  });
  return withQueueLock(() => {
    const stored = loadState(state.bundle.sessionId);
    // Storage was wiped (sign-out) while we signed: persisting this record
    // would restore student names after logout. Abandon the attestation.
    if (stored === null) return null;
    const queued = stored.queued.filter((item) => item.studentId !== student.id);
    const next: OfflineQueueState = {
      bundle: stored.bundle,
      queued: [...queued, { ...record, studentName: student.name }],
    };
    saveState(next);
    return next;
  });
}

/** Removes one queued record (by student) and persists the result; a fully emptied queue is wiped. */
export async function removeFromQueue(
  state: OfflineQueueState,
  studentId: string,
): Promise<OfflineQueueState | null> {
  return withQueueLock(() => {
    const stored = loadState(state.bundle.sessionId);
    if (stored === null) {
      clearStorageSynced();
      return null;
    }
    const queued = stored.queued.filter((record) => record.studentId !== studentId);
    if (queued.length === 0) {
      clearStorageSynced();
      return null;
    }
    const next: OfflineQueueState = { bundle: stored.bundle, queued };
    saveState(next);
    return next;
  });
}

/** Drops synced records (by student) from the queue, keeping unsynced ones intact. */
export async function dropSynced(
  state: OfflineQueueState,
  syncedStudentIds: ReadonlySet<string>,
): Promise<OfflineQueueState | null> {
  return withQueueLock(() => {
    const stored = loadState(state.bundle.sessionId);
    if (stored === null) {
      clearStorageSynced();
      return null;
    }
    const queued = stored.queued.filter((record) => !syncedStudentIds.has(record.studentId));
    if (queued.length === 0) {
      clearStorageSynced();
      return null;
    }
    const next: OfflineQueueState = { bundle: stored.bundle, queued };
    saveState(next);
    return next;
  });
}

/** Subscribes to queue wipes (sign-out in another tab); returns an unsubscribe. */
export function subscribeQueueCleared(listener: () => void): () => void {
  try {
    const channel = new BroadcastChannel(QUEUE_CLEARED_CHANNEL);
    channel.addEventListener("message", listener);
    return () => channel.close();
  } catch {
    return () => {};
  }
}

export type SyncResultStatus =
  "accepted" | "step_up" | "flagged" | "rejected" | "duplicate" | "invalid_signature";

/**
 * Every per-record sync status is settled: accepted entries are recorded,
 * duplicates were already recorded on an earlier sync, and rejected or
 * invalid-signature claims are verdicts the queue must not resubmit.
 * Transient failures surface as batch-level errors, which leave the whole
 * queue intact for a retry.
 */
export function settledStudentIds(
  results: ReadonlyArray<{ studentId: string; status: SyncResultStatus }>,
): ReadonlySet<string> {
  return new Set(results.map(({ studentId }) => studentId));
}
