"use client";

import {
  CheckCircle2,
  Flag,
  LogIn,
  RotateCcw,
  ScanLine,
  ServerCrash,
  ShieldAlert,
  Timer,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { VerdictStamp, type Verdict } from "@/components/marketing/verdict-stamp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/decision";
import { cn } from "@/lib/utils";
import { explainDecision } from "@/lib/risk";

export type FailureVerdict = "expired" | "replayed" | "wrong_session" | "malformed";

export type DecisionSignal = Decision["evidence"]["signals"][number];

export type DecisionOutcome = Decision["outcome"];

export type DecisionLite = Decision;

export type CheckInOutcome =
  | {
      kind: "success";
      courseCode: string;
      venueName: string;
      checkedInAt: number;
      decision: DecisionLite;
    }
  | { kind: "failure"; verdict: FailureVerdict; reasonCodes: string[] }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "session_expired" }
  | { kind: "service_error" };

const FAILURE_ICON: Record<FailureVerdict, typeof ScanLine> = {
  expired: RotateCcw,
  replayed: ShieldAlert,
  wrong_session: ShieldAlert,
  malformed: ScanLine,
};

/**
 * "ok" redemptions only ever settle to these outcomes — step-up decisions come
 * back as kind "step_up" and render through StepUpChallenge instead.
 */
type SuccessOutcome = Exclude<DecisionOutcome, "step_up">;

const OUTCOME_VERDICT: Record<SuccessOutcome, Verdict> = {
  accept: "accept",
  flag: "flag",
  reject: "reject",
};

const SUCCESS_ICON: Record<SuccessOutcome, typeof ScanLine> = {
  accept: CheckCircle2,
  flag: Flag,
  reject: XCircle,
};

const SUCCESS_ICON_STYLES: Record<SuccessOutcome, string> = {
  accept: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  flag: "bg-verdict-flag/15 text-verdict-flag",
  reject: "bg-destructive/15 text-destructive",
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
    if (reason === "not_enrolled") {
      return {
        headline: "Not enrolled in this class",
        message:
          "You are not enrolled in this class section, so your attendance can't be recorded. Contact the admin office.",
      };
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

function SuccessScreen({
  outcome,
  onRetry,
}: {
  outcome: Extract<CheckInOutcome, { kind: "success" }>;
  onRetry: () => void;
}) {
  const explanation = explainDecision(outcome.decision, "student");
  const decisionOutcome = outcome.decision.outcome as SuccessOutcome;
  const Icon = SUCCESS_ICON[decisionOutcome];

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
          SUCCESS_ICON_STYLES[decisionOutcome],
        )}
      >
        <Icon className="size-8" />
      </div>
      <span data-testid="outcome-verdict">
        <VerdictStamp verdict={OUTCOME_VERDICT[decisionOutcome]} />
      </span>
      <h2 className="text-xl font-semibold" data-testid="outcome-headline">
        {explanation.headline}
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">{explanation.message}</p>
      {explanation.actions.length > 0 ? (
        <ul className="flex max-w-md flex-col gap-1.5 text-left text-sm">
          {explanation.actions.map((action) => (
            <li key={action} className="flex items-start gap-2">
              <CheckCircle2 className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {outcome.courseCode} · {outcome.venueName} ·{" "}
        <span suppressHydrationWarning>{formatCheckedInAt(outcome.checkedInAt)}</span>
      </p>
      {decisionOutcome === "accept" ? (
        <p className="max-w-md text-sm">Keep the app open until class ends.</p>
      ) : (
        <Button data-testid="checkin-again" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function OutcomeScreen({
  outcome,
  onRetry,
}: {
  outcome: CheckInOutcome;
  onRetry: () => void;
}) {
  if (outcome.kind === "success") return <SuccessScreen outcome={outcome} onRetry={onRetry} />;
  if (outcome.kind === "rate_limited") {
    return (
      <div
        aria-live="polite"
        className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
        data-testid="checkin-outcome"
        role="status"
      >
        <div className="bg-destructive/15 text-destructive flex size-14 items-center justify-center rounded-full">
          <Timer className="size-8" />
        </div>
        <h2 className="text-xl font-semibold">Too many attempts</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          You have tried several codes in a row. Try again in about {outcome.retryAfterSeconds}{" "}
          seconds.
        </p>
        <Button variant="outline" data-testid="checkin-again" onClick={onRetry}>
          Back to scanner
        </Button>
      </div>
    );
  }
  if (outcome.kind === "session_expired") {
    return (
      <div
        aria-live="polite"
        className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
        data-testid="checkin-outcome"
        role="status"
      >
        <div className="bg-destructive/15 text-destructive flex size-14 items-center justify-center rounded-full">
          <LogIn className="size-8" />
        </div>
        <h2 className="text-xl font-semibold">Session signed out</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Your sign-in session has expired, so the check-in could not be verified. Sign in again and
          re-scan the code.
        </p>
        <Button asChild data-testid="session-expired-login">
          <Link href="/login">Sign in again</Link>
        </Button>
      </div>
    );
  }
  if (outcome.kind === "service_error") {
    return (
      <div
        aria-live="polite"
        className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
        data-testid="checkin-outcome"
        role="status"
      >
        <div className="bg-destructive/15 text-destructive flex size-14 items-center justify-center rounded-full">
          <ServerCrash className="size-8" />
        </div>
        <h2 className="text-xl font-semibold">Check-in could not be processed</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Something went wrong while verifying this code — it was not recorded. Wait a moment and
          try again; if it keeps failing, show your faculty member.
        </p>
        <Button data-testid="try-again" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  const copy = failureCopy(outcome.verdict, outcome.reasonCodes);
  const Icon = FAILURE_ICON[outcome.verdict];

  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
      data-testid="checkin-outcome"
      role="status"
    >
      <div className="bg-destructive/15 text-destructive flex size-14 items-center justify-center rounded-full">
        <Icon className="size-8" />
      </div>
      <h2 className="text-xl font-semibold">{copy.headline}</h2>
      <p className="text-muted-foreground max-w-md text-sm">{copy.message}</p>
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
    </div>
  );
}
