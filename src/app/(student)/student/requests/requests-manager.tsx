"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeConvexError, type ErrorTranslation } from "@/lib/client/describe-error";

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 1000;

const TYPE_LABELS: Record<string, string> = {
  correction: "Attendance correction",
  exemption: "Exemption",
  on_duty: "On-duty",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function RequestStatusBadge({ status }: { status: "submitted" | "approved" | "dismissed" }) {
  if (status === "submitted") return <Badge variant="secondary">submitted</Badge>;
  if (status === "approved") return <Badge>approved</Badge>;
  return <Badge variant="outline">dismissed</Badge>;
}

const ERROR_TRANSLATIONS: ErrorTranslation = [
  { match: "unauthorized", message: "Your session expired — sign in again." },
];

function describeError(cause: unknown): string {
  return describeConvexError(cause, ERROR_TRANSLATIONS, "Could not file the request. Please try again.");
}

export function RequestsManager({ actorToken }: { actorToken: string }) {
  const requests = useQuery(api.attendanceRequests.listMyRequests, { actorToken });
  const correctionableEvents = useQuery(api.attendanceRequests.listMyCorrectionableEvents, {
    actorToken,
  });
  const submitRequest = useMutation(api.attendanceRequests.submitMyRequest);

  const [type, setType] = useState<"correction" | "exemption" | "on_duty">("correction");
  const [eventId, setEventId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justFiled, setJustFiled] = useState(false);

  async function submit() {
    if (submitting) return;
    if (type === "correction" && eventId === "") return;
    setSubmitting(true);
    setError(null);
    try {
      await submitRequest({
        actorToken,
        type,
        reason,
        ...(type === "correction" && eventId !== ""
          ? { eventId: eventId as Id<"attendance_events"> }
          : {}),
      });
      setReason("");
      setJustFiled(true);
      setTimeout(() => setJustFiled(false), 4000);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" />
            File a request
          </CardTitle>
          <CardDescription>
            Ask for an attendance correction, an exemption, or mark an on-duty day. Your faculty
            member reviews requests — the outcome lands in your history.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="border-input bg-background ring-offset-background focus-visible:ring-ring flex max-w-md items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none">
            <label className="text-muted-foreground shrink-0 text-sm" htmlFor="request-type">
              Type
            </label>
            <select
              id="request-type"
              aria-label="Request type"
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
              className="bg-background w-full text-sm focus-visible:outline-none"
            >
              <option value="correction">Attendance correction</option>
              <option value="exemption">Exemption</option>
              <option value="on_duty">On-duty</option>
            </select>
          </div>
          {type === "correction" ? (
            <div className="border-input bg-background ring-offset-background focus-visible:ring-ring flex max-w-md items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none">
              <label className="text-muted-foreground shrink-0 text-sm" htmlFor="request-event">
                Record
              </label>
              <select
                id="request-event"
                aria-label="Attendance record to dispute"
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                className="bg-background w-full text-sm focus-visible:outline-none"
                data-testid="correction-event-picker"
              >
                <option value="">Select the record…</option>
                {(correctionableEvents ?? []).map((event) => (
                  <option key={event.eventId} value={event.eventId}>
                    {`${event.courseCode} · ${formatDay(event.capturedAt)} · ${event.state}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {type === "correction" &&
          correctionableEvents !== undefined &&
          correctionableEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No correctable records right now — only verified, flagged or rejected check-ins can be
              disputed.
            </p>
          ) : null}
          <textarea
            aria-label="Reason"
            placeholder={`Why do you need this? (min ${MIN_REASON_LENGTH} characters)`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_REASON_LENGTH}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-24 max-w-md rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void submit()}
              disabled={
                submitting ||
                reason.trim().length < MIN_REASON_LENGTH ||
                (type === "correction" && eventId === "")
              }
            >
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Submit request
            </Button>
            {justFiled ? (
              <span className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                Request filed.
              </span>
            ) : null}
          </div>
          {error !== null ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Your requests{requests !== undefined ? ` (${requests.length})` : ""}
        </h2>
        {requests === undefined ? (
          <p className="text-muted-foreground text-sm">Loading your requests…</p>
        ) : requests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No requests yet. File one above and it will appear here with its status.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((request) => (
              <li
                key={request.id}
                data-testid="attendance-request-row"
                className="border-border flex flex-col gap-1 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{TYPE_LABELS[request.type] ?? request.type}</span>
                    <RequestStatusBadge status={request.status} />
                  </div>
                  <p className="text-muted-foreground text-sm">{request.reason}</p>
                  {request.eventId !== undefined ? (
                    <p className="text-muted-foreground text-xs" data-testid="disputed-record-line">
                      Disputed: {request.courseCode ?? "course"}
                      {request.sessionStartedAt !== undefined
                        ? ` · ${formatDay(request.sessionStartedAt)}`
                        : ""}
                      {request.disputedState !== undefined ? ` · was ${request.disputedState}` : ""}
                      {request.correctionEventId !== undefined ? " → corrected to verified" : ""}
                    </p>
                  ) : null}
                </div>
                <div className="text-muted-foreground shrink-0 text-xs sm:text-right">
                  <p>
                    Filed <span suppressHydrationWarning>{formatDate(request.requestedAt)}</span>
                  </p>
                  {request.reviewedAt !== undefined ? (
                    <p>
                      Reviewed{" "}
                      <span suppressHydrationWarning>{formatDate(request.reviewedAt)}</span>
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
