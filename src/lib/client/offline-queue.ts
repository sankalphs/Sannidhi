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
 * Multiple tabs share one storage key, so every write re-reads the stored
 * state first and every read validates the queued items: a malformed record
 * (tampered storage, schema drift) is dropped instead of bricking the queue,
 * and one tab's edit cannot silently erase another tab's queued records.
 */

const STORAGE_KEY = "sannidhi.offline-queue";

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

/** Writes a fresh state, dropping any records another tab queued since our last read. */
function saveState(state: OfflineQueueState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearQueue(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Loads the queue for one session; other sessions' queues are discarded (one live class window). */
export function readQueue(sessionId: string): OfflineQueueState | null {
  return loadState(sessionId);
}

/** Whether another session still holds unsynced records — minting now would destroy them. */
export function hasForeignUnsyncedQueue(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    const parsed = JSON.parse(raw) as Partial<OfflineQueueState> | null;
    if (parsed === null || typeof parsed.bundle?.sessionId !== "string") return false;
    if (parsed.bundle.sessionId === sessionId) return false;
    return Array.isArray(parsed.queued) && parsed.queued.some(isQueuedRecord);
  } catch {
    return false;
  }
}

export function rememberBundle(sessionId: string, bundle: OfflineBundle): OfflineQueueState {
  const state: OfflineQueueState = { bundle, queued: [] };
  saveState(state);
  return state;
}

/**
 * Re-reads storage before writing so another tab's concurrently-queued
 * records survive; the returned state reflects that merged reality.
 */
function mergeWithStored(state: OfflineQueueState): OfflineQueueState {
  const stored = loadState(state.bundle.sessionId);
  if (stored === null) return state;
  const ours = new Set(state.queued.map((record) => record.studentId));
  const preserved = stored.queued.filter((record) => !ours.has(record.studentId));
  return preserved.length > 0 ? { ...state, queued: [...state.queued, ...preserved] } : state;
}

/** Signs and appends one attestation; each record gets a fresh nonce so replays dedupe server-side. */
export async function enqueueStudent(
  state: OfflineQueueState,
  student: { id: string; name: string },
  sectionId: string,
  note: string,
): Promise<OfflineQueueState> {
  const record = await signRecord(state.bundle.key, {
    sessionId: state.bundle.sessionId,
    sectionId,
    studentId: student.id,
    capturedAt: Date.now(),
    nonce: crypto.randomUUID(),
    ...(note.trim().length > 0 ? { note: note.trim() } : {}),
  });
  const queued = state.queued.filter((item) => item.studentId !== student.id);
  const next: OfflineQueueState = {
    bundle: state.bundle,
    queued: [...queued, { ...record, studentName: student.name }],
  };
  const merged = mergeWithStored(next);
  saveState(merged);
  return merged;
}

/** Removes one queued record (by student) and persists the result; a fully emptied queue is wiped. */
export function removeFromQueue(
  state: OfflineQueueState,
  studentId: string,
): OfflineQueueState | null {
  const stored = loadState(state.bundle.sessionId);
  const current = stored ?? state;
  const queued = current.queued.filter((record) => record.studentId !== studentId);
  if (queued.length === 0) {
    clearQueue();
    return null;
  }
  const next: OfflineQueueState = { bundle: current.bundle, queued };
  saveState(next);
  return next;
}
/** Drops synced records (by student) from the queue, keeping unsynced ones intact. */
export function dropSynced(
  state: OfflineQueueState,
  syncedStudentIds: ReadonlySet<string>,
): OfflineQueueState | null {
  const stored = loadState(state.bundle.sessionId);
  const current = stored ?? state;
  const queued = current.queued.filter((record) => !syncedStudentIds.has(record.studentId));
  if (queued.length === 0) {
    clearQueue();
    return null;
  }
  const next: OfflineQueueState = { bundle: current.bundle, queued };
  saveState(next);
  return next;
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
