"use client";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INSTITUTION_TIME_ZONE } from "@/lib/attendance/timezone";
import { describeConvexError, type ErrorTranslation } from "@/lib/client/describe-error";

const PREVIOUS_STATE_BADGES: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  verified: "default",
  flagged: "secondary",
  rejected: "destructive",
};

const TYPE_LABELS: Record<string, string> = {
  correction: "Correction",
  exemption: "Exemption",
  on_duty: "On-duty",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: INSTITUTION_TIME_ZONE,
  });
}

const ERROR_TRANSLATIONS: ErrorTranslation = [
  { match: "unauthorized", message: "You are not authorized to review this request." },
  { match: "request_already_reviewed", message: "This request was already reviewed." },
  { match: "event_already_corrected", message: "The disputed record has already been corrected." },
  { match: "event_not_correctionable", message: "The disputed record can no longer be corrected." },
  { match: "event_not_found", message: "The disputed record can no longer be corrected." },
  { match: "note_too_long", message: "Keep the note under 500 characters." },
];

type Confirming = { requestId: Id<"attendance_requests">; decision: "approved" | "dismissed" };

function describeError(cause: unknown): string {
  return describeConvexError(
    cause,
    ERROR_TRANSLATIONS,
    "Could not record the review. Please try again.",
  );
}

export function ReviewQueue({ actorToken }: { actorToken: string }) {
  const router = useRouter();
  const requests = useQuery(api.attendanceRequests.listReviewQueue, { actorToken });
  const reviewRequest = useMutation(api.attendanceRequests.reviewRequest);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Approve and dismiss are final, so each takes a second, explicit click.
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [note, setNote] = useState("");

  function startConfirm(next: Confirming | null) {
    setConfirming(next);
    setNote("");
    setError(null);
  }

  async function decide({ requestId, decision }: Confirming) {
    if (pendingRequestId !== null) return;
    setPendingRequestId(requestId);
    setError(null);
    try {
      const trimmed = note.trim();
      await reviewRequest({
        actorToken,
        requestId,
        decision,
        ...(decision === "dismissed" && trimmed.length > 0 ? { note: trimmed } : {}),
      });
      startConfirm(null);
      router.refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPendingRequestId(null);
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="faculty-review-queue">
      <h2 className="text-lg font-semibold">
        Review queue
        {requests !== undefined ? ` (${requests.length})` : ""}
      </h2>
      <p className="text-muted-foreground -mt-2 text-sm">
        Attendance disputes your sessions recorded, plus exemption and on-duty filings. Approving a
        correction appends a correction event — the original record is preserved.
      </p>
      {requests === undefined ? (
        <p className="text-muted-foreground text-sm">Loading disputes…</p>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No disputes waiting"
          description="When students dispute attendance or file exemptions, the requests appear here for review."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((request) => (
            <li
              key={request.requestId}
              data-testid="review-queue-row"
              className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{request.studentName}</span>
                  {request.type !== "correction" ? (
                    <Badge variant="outline">{TYPE_LABELS[request.type] ?? request.type}</Badge>
                  ) : null}
                  {request.courseCode !== undefined ? (
                    <Badge variant="outline">
                      {request.courseCode} · {request.sectionName}
                    </Badge>
                  ) : null}
                  {request.previousState !== undefined ? (
                    <Badge variant={PREVIOUS_STATE_BADGES[request.previousState] ?? "outline"}>
                      was {request.previousState}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm">{request.reason}</p>
                <p className="text-muted-foreground text-xs">
                  {request.sessionStartedAt !== undefined
                    ? `Session ${formatDate(request.sessionStartedAt)} · `
                    : ""}
                  Filed {formatDate(request.requestedAt)}
                  {request.previousReasonCodes !== undefined &&
                  request.previousReasonCodes.length > 0
                    ? ` · ${request.previousReasonCodes.join(", ")}`
                    : ""}
                </p>
              </div>
              {confirming?.requestId === request.requestId ? (
                <div className="flex shrink-0 flex-col gap-2 sm:w-64">
                  {confirming.decision === "dismissed" ? (
                    <Input
                      aria-label="Note to the student (optional)"
                      placeholder="Note to the student (optional)"
                      data-testid="dismiss-note"
                      maxLength={500}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={confirming.decision === "dismissed" ? "destructive" : "default"}
                      disabled={pendingRequestId !== null}
                      data-testid={
                        confirming.decision === "dismissed"
                          ? "confirm-dismiss-dispute"
                          : "confirm-approve-dispute"
                      }
                      onClick={() => void decide(confirming)}
                    >
                      {pendingRequestId === request.requestId ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
                      {confirming.decision === "dismissed" ? "Confirm dismiss" : "Confirm approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingRequestId !== null}
                      onClick={() => startConfirm(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    disabled={pendingRequestId !== null}
                    data-testid="approve-dispute"
                    onClick={() =>
                      startConfirm({ requestId: request.requestId, decision: "approved" })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingRequestId !== null}
                    data-testid="dismiss-dispute"
                    onClick={() =>
                      startConfirm({ requestId: request.requestId, decision: "dismissed" })
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error !== null ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
