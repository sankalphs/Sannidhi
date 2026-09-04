"use client";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { CloudOff, KeyRound, RefreshCw, Trash2, UploadCloud, Wifi, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeConvexError, type ErrorTranslation } from "@/lib/client/describe-error";
import {
  dropSynced,
  enqueueStudent,
  readQueue,
  rememberBundle,
  removeFromQueue,
  settledStudentIds,
  type OfflineQueueState,
} from "@/lib/client/offline-queue";

export type BoardSnapshot = FunctionReturnType<typeof api.classSessions.getBoard>;
type BoardRow = BoardSnapshot["rows"][number];

type SyncStatus =
  "accepted" | "step_up" | "flagged" | "rejected" | "duplicate" | "invalid_signature";

type SyncOutcome = { studentName: string; status: SyncStatus };

const MINT_ERROR_TRANSLATIONS: ErrorTranslation = [
  {
    match: "session_not_active",
    message: "Only an active session can be pre-authorized for offline capture.",
  },
  { match: "unauthorized", message: "You are not authorized to manage this session." },
  { match: "session not found", message: "This session no longer exists." },
];

const SYNC_ERROR_TRANSLATIONS: ErrorTranslation = [
  {
    match: "batch_too_large",
    message: "The queue is too large for one sync. Sync in smaller batches.",
  },
  { match: "unauthorized", message: "You are not authorized to sync records for this session." },
];

const STATUS_COPY: Record<SyncStatus, string> = {
  accepted: "Verified",
  step_up: "Step-up requested",
  flagged: "Flagged for review",
  rejected: "Rejected",
  duplicate: "Duplicate (already synced)",
  invalid_signature: "Invalid signature — dropped",
};

function statusTone(status: SyncStatus): "accept" | "stepup" | "flag" | "reject" | "muted" {
  if (status === "accepted" || status === "duplicate") return "accept";
  if (status === "step_up") return "stepup";
  if (status === "flagged") return "flag";
  if (status === "rejected" || status === "invalid_signature") return "reject";
  return "muted";
}

const STATUS_CLASSES: Record<"accept" | "stepup" | "flag" | "reject" | "muted", string> = {
  accept: "border-verdict-accept/35 bg-verdict-accept/10 text-verdict-accept",
  stepup: "border-verdict-stepup/35 bg-verdict-stepup/10 text-verdict-stepup",
  flag: "border-verdict-flag/40 bg-verdict-flag/10 text-verdict-flag",
  reject: "border-verdict-reject/35 bg-verdict-reject/10 text-verdict-reject",
  muted: "border-border text-muted-foreground",
};

function StatusPill({ status }: { status: SyncStatus }) {
  return (
    <span
      data-testid={`sync-status-${status}`}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[statusTone(status)]}`}
    >
      {STATUS_COPY[status]}
    </span>
  );
}

/**
 * Faculty offline capture kit (spec §13): pre-authorize the session while
 * online, attest students while disconnected (each record signed locally),
 * then push the queue through the same ledger append seam when back online.
 */
export function OfflineKit({
  actorToken,
  sessionId,
  sessionStatus,
  sectionId,
  rows,
}: {
  actorToken: string;
  sessionId: Id<"class_sessions">;
  sessionStatus: "active" | "paused" | "closed";
  sectionId: Id<"sections">;
  rows: BoardRow[];
}) {
  const mintOfflineBundle = useMutation(api.offlineSync.mintOfflineBundle);
  const syncOfflineBatch = useMutation(api.offlineSync.syncOfflineBatch);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<OfflineQueueState | null>(null);
  const [minting, setMinting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<SyncOutcome[] | null>(null);

  // The queue lives on the faculty device, so it is read on mount/dialog open —
  // never during SSR.
  useEffect(() => {
    if (!open) return;
    setQueue(readQueue(sessionId));
    setError(null);
    setOutcomes(null);
  }, [open, sessionId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const queuedStudentIds = useMemo(
    () => new Set((queue?.queued ?? []).map((record) => record.studentId)),
    [queue],
  );

  // Only un-verified, un-queued students are attestable; a verified row needs
  // no offline attestation and an already-queued one must not be double-signed.
  const attestable = rows.filter(
    (row) => !queuedStudentIds.has(row.studentId) && row.state !== "verified",
  );

  async function handleMint() {
    if (minting) return;
    setMinting(true);
    setError(null);
    try {
      const bundle = await mintOfflineBundle({ actorToken, sessionId });
      setQueue(rememberBundle(sessionId, { sessionId: bundle.sessionId, key: bundle.key }));
    } catch (cause) {
      setError(
        describeConvexError(
          cause,
          MINT_ERROR_TRANSLATIONS,
          "Could not authorize offline capture. Please try again.",
        ),
      );
    } finally {
      setMinting(false);
    }
  }

  async function handleAttest(row: BoardRow) {
    if (queue === null || busyStudentId !== null) return;
    setBusyStudentId(row.studentId);
    setError(null);
    try {
      const next = await enqueueStudent(
        queue,
        { id: row.studentId, name: row.studentName },
        sectionId,
        `${row.studentName} — present in class`,
      );
      setQueue(next);
    } finally {
      setBusyStudentId(null);
    }
  }

  function handleRemove(studentId: string) {
    if (queue === null) return;
    setQueue(removeFromQueue(queue, studentId));
  }

  async function handleSync() {
    if (queue === null || queue.queued.length === 0 || syncing) return;
    setSyncing(true);
    setError(null);
    setOutcomes(null);
    try {
      const byStudent = new Map(rows.map((row) => [row.studentId, row.studentName]));
      // studentName is device-local display state and never part of the signed payload.
      const records = queue.queued.map((record) => ({
        sessionId: record.sessionId as Id<"class_sessions">,
        sectionId: record.sectionId as Id<"sections">,
        studentId: record.studentId as Id<"users">,
        capturedAt: record.capturedAt,
        nonce: record.nonce,
        ...(record.note !== undefined ? { note: record.note } : {}),
        signature: record.signature,
      }));
      const result = await syncOfflineBatch({ actorToken, records });
      const nameOf = (studentId: Id<"users">) => byStudent.get(studentId) ?? "Student";
      setOutcomes(
        result.results.map(({ studentId, status }) => ({
          studentName: nameOf(studentId),
          status,
        })),
      );
      // Every per-record status is a settlement: accepted entries are recorded,
      // duplicates were already recorded by an earlier sync, and
      // rejected/invalid-signature claims are verdicts, not retries. The queue
      // drops them all so nothing is endlessly resubmitted.
      setQueue(dropSynced(queue, settledStudentIds(result.results)));
    } catch (cause) {
      setError(
        describeConvexError(
          cause,
          SYNC_ERROR_TRANSLATIONS,
          "Sync failed. The queue is kept on this device — try again.",
        ),
      );
    } finally {
      setSyncing(false);
    }
  }

  const queuedCount = queue?.queued.length ?? 0;

  return (
    <>
      <Button
        variant="outline"
        size="xs"
        data-testid="offline-kit-open"
        onClick={() => setOpen(true)}
      >
        <CloudOff />
        Offline capture
      </Button>
      <dialog
        ref={dialogRef}
        aria-label="Offline capture"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="bg-background relative m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border p-6 shadow-lg backdrop:bg-black/60"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className="absolute top-3 right-3"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Offline capture</h2>
          <p className="text-muted-foreground text-sm">
            Pre-authorize this session, attest attendance without connectivity, then sync — every
            record enters the same auditable ledger as online check-ins.
          </p>
        </div>

        {error !== null ? (
          <p className="text-destructive mt-3 text-sm" data-testid="offline-error" role="alert">
            {error}
          </p>
        ) : null}

        {queue === null && outcomes === null ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="bg-muted/40 flex items-start gap-3 rounded-lg border p-4">
              <Wifi className="text-muted-foreground mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Authorize before going offline</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {sessionStatus === "active"
                    ? "Mint a session bundle key while you still have connectivity. Records signed with it will be accepted later even if this device drops offline."
                    : "The session is not active, so offline capture cannot be authorized. Restart the session window first."}
                </p>
              </div>
            </div>
            <Button
              data-testid="offline-mint"
              onClick={() => void handleMint()}
              disabled={minting || sessionStatus !== "active"}
            >
              <KeyRound />
              {minting ? "Authorizing…" : "Authorize offline capture"}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4" data-testid="offline-authorized">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" data-testid="offline-queued-count">
                {queuedCount} queued
              </Badge>
              <Badge variant="outline">Session authorized</Badge>
              {queuedCount > 0 ? (
                <Button
                  size="xs"
                  data-testid="offline-sync"
                  onClick={() => void handleSync()}
                  disabled={syncing}
                  className="ml-auto"
                >
                  {syncing ? <RefreshCw className="animate-spin" /> : <UploadCloud />}
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
              ) : null}
            </div>

            {queue !== null && attestable.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  Attending students you can attest offline:
                </p>
                <ul className="max-h-44 overflow-auto" data-testid="offline-attestable">
                  {attestable.map((row) => (
                    <li
                      key={row.studentId}
                      className="flex items-center justify-between gap-2 border-b py-1.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.studentName}</p>
                        <p className="text-muted-foreground truncate text-xs">{row.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="xs"
                        data-testid={`offline-attest-${row.studentId}`}
                        onClick={() => void handleAttest(row)}
                        disabled={busyStudentId !== null}
                      >
                        {busyStudentId === row.studentId ? "Signing…" : "Mark present"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {queue !== null && queuedCount > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">Queued records on this device:</p>
                <ul className="max-h-44 overflow-auto" data-testid="offline-queue-list">
                  {queue.queued.map((record) => (
                    <li
                      key={record.nonce}
                      className="flex items-center justify-between gap-2 border-b py-1.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{record.studentName}</p>
                        <p className="text-muted-foreground truncate text-xs tabular-nums">
                          captured {new Date(record.capturedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${record.studentName} from queue`}
                        onClick={() => handleRemove(record.studentId)}
                      >
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm" data-testid="offline-empty-queue">
                {outcomes !== null
                  ? "Queue empty — every record synced. Mark more students or close this dialog."
                  : "No records queued yet — mark attending students to build the offline roster."}
              </p>
            )}

            {outcomes !== null ? (
              <div className="flex flex-col gap-2" data-testid="offline-outcomes">
                <p className="text-sm font-medium">Sync results</p>
                <ul className="flex flex-col gap-1">
                  {outcomes.map((outcome, index) => (
                    <li
                      key={`${outcome.studentName}-${index}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{outcome.studentName}</span>
                      <StatusPill status={outcome.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </dialog>
    </>
  );
}
