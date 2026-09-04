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
 */

const STORAGE_KEY = "sannidhi.offline-queue";

export type QueuedRecord = SignedOfflineRecord & { studentName: string };

export type OfflineQueueState = {
  bundle: OfflineBundle;
  queued: QueuedRecord[];
};

function loadState(sessionId: string): OfflineQueueState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineQueueState> | null;
    if (
      parsed === null ||
      parsed.bundle?.sessionId !== sessionId ||
      !Array.isArray(parsed.queued)
    ) {
      return null;
    }
    return { bundle: parsed.bundle, queued: parsed.queued };
  } catch {
    return null;
  }
}

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

export function rememberBundle(sessionId: string, bundle: OfflineBundle): OfflineQueueState {
  const state: OfflineQueueState = { bundle, queued: [] };
  saveState(state);
  return state;
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
  const next: OfflineQueueState = {
    ...state,
    queued: [...state.queued, { ...record, studentName: student.name }],
  };
  saveState(next);
  return next;
}

/** Removes one queued record (by student) and persists the result; a fully emptied queue is wiped. */
export function removeFromQueue(
  state: OfflineQueueState,
  studentId: string,
): OfflineQueueState | null {
  const queued = state.queued.filter((record) => record.studentId !== studentId);
  if (queued.length === 0) {
    clearQueue();
    return null;
  }
  const next: OfflineQueueState = { ...state, queued };
  saveState(next);
  return next;
}
/** Drops synced records (by student) from the queue, keeping unsynced ones intact. */
export function dropSynced(
  state: OfflineQueueState,
  syncedStudentIds: ReadonlySet<string>,
): OfflineQueueState | null {
  const queued = state.queued.filter((record) => !syncedStudentIds.has(record.studentId));
  if (queued.length === 0) {
    clearQueue();
    return null;
  }
  const next: OfflineQueueState = { ...state, queued };
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
