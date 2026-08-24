"use client";

import { CheckCircle2, RotateCcw, ScanLine, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FailureVerdict = "expired" | "replayed" | "wrong_session" | "malformed";

export type CheckInOutcome =
  | { kind: "success"; courseCode: string; venueName: string; checkedInAt: number }
  | { kind: "failure"; verdict: FailureVerdict; reasonCodes: string[] };

const FAILURE_ICON: Record<FailureVerdict, typeof ScanLine> = {
  expired: RotateCcw,
  replayed: ShieldAlert,
  wrong_session: ShieldAlert,
  malformed: ScanLine,
};

const EXPIRED_COPY = {
  headline: "Code expired",
  message: "That code has expired. Scan the freshly displayed QR.",
};

const REUSED_COPY = {
  headline: "Code already used",
  message: "This code was already used. Codes rotate constantly — grab the current one.",
};

const MISMATCH_COPY = {
  headline: "Wrong class or room",
  message: "This code belongs to a different class or room.",
};

function failureCopy(
  verdict: FailureVerdict,
  reasonCodes: string[],
): { headline: string; message: string } {
  for (const reason of reasonCodes) {
    if (reason === "challenge_expired") return EXPIRED_COPY;
    if (reason === "session_window_closed") {
      return {
        headline: "Check-in window closed",
        message: "The check-in window for this class has closed. Ask your faculty member.",
      };
    }
    if (reason === "nonce_reused" || reason === "challenge_unknown") return REUSED_COPY;
    if (reason === "session_paused") {
      return {
        headline: "Session paused",
        message: "Your faculty member paused the session. Wait for them to resume.",
      };
    }
    if (reason === "session_closed") {
      return { headline: "Session closed", message: "This session is closed." };
    }
    if (reason.endsWith("_mismatch")) return MISMATCH_COPY;
  }
  if (verdict === "expired") return EXPIRED_COPY;
  if (verdict === "replayed") return REUSED_COPY;
  if (verdict === "wrong_session") return MISMATCH_COPY;
  return {
    headline: "Unreadable code",
    message: "That code couldn't be read. Scan the QR or paste it exactly.",
  };
}

function formatCheckedInAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function OutcomeScreen({
  outcome,
  onRetry,
}: {
  outcome: CheckInOutcome;
  onRetry: () => void;
}) {
  const success = outcome.kind === "success";
  const copy = success ? null : failureCopy(outcome.verdict, outcome.reasonCodes);
  const Icon = success ? CheckCircle2 : FAILURE_ICON[outcome.verdict];

  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
      data-testid="checkin-outcome"
      role="status"
    >
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-full",
          success
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-destructive/15 text-destructive",
        )}
      >
        <Icon className="size-8" />
      </div>
      {outcome.kind === "success" ? (
        <>
          <h2 className="text-xl font-semibold">You&apos;re checked in</h2>
          <p className="text-muted-foreground text-sm">
            {outcome.courseCode} · {outcome.venueName} ·{" "}
            <span suppressHydrationWarning>{formatCheckedInAt(outcome.checkedInAt)}</span>
          </p>
          <p className="max-w-md text-sm">Keep the app open until class ends.</p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold">{copy?.headline}</h2>
          <p className="text-muted-foreground max-w-md text-sm">{copy?.message}</p>
          {outcome.reasonCodes.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-1">
              {outcome.reasonCodes.map((reason) => (
                <Badge key={reason} variant="outline" className="font-mono text-[10px] uppercase">
                  {reason}
                </Badge>
              ))}
            </div>
          ) : null}
          <Button data-testid="try-again" onClick={onRetry}>
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
