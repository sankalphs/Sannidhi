"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Flag, Info, Loader2, ScanLine, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { FaceCapture } from "@/components/biometry/face-capture";
import { VerdictStamp } from "@/components/marketing/verdict-stamp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Decision } from "@/lib/decision";
import { explainDecision } from "@/lib/risk";

export type StepUpChallengeRef = {
  _id: Id<"verification_challenges">;
  expiresAt: number;
  attempts?: number;
};

type TerminalPanel =
  | { kind: "verified"; decision: Decision }
  | { kind: "review"; decision: Decision | null; escalated?: boolean }
  | { kind: "not_enrolled" }
  | { kind: "expired" };

type DismissButton = { label: string; testId?: string; onClick: () => void };

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useSecondsUntil(target: number): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);
  return secondsLeft;
}

function CountdownChip({ expiresAt }: { expiresAt: number }) {
  const secondsLeft = useSecondsUntil(expiresAt);
  return (
    <Badge variant="secondary" className="font-mono">
      <span suppressHydrationWarning>
        {secondsLeft === null ? "--:--" : formatCountdown(secondsLeft)}
      </span>
    </Badge>
  );
}

function describeError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (data === "unauthorized") return "Your session expired — sign in again.";
    if (typeof data === "string" && data.length > 0) return data;
  }
  return "Something went wrong while submitting your check. Try again.";
}

function FallbackRequest({
  busy,
  disabled,
  onConfirm,
}: {
  busy: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        data-testid="stepup-fallback"
        disabled={busy || disabled}
        onClick={() => setConfirming(true)}
      >
        Camera unavailable? Request faculty verification
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <p className="text-sm">Ask your faculty member to verify you instead?</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="stepup-fallback-confirm"
        disabled={busy}
        onClick={onConfirm}
      >
        Request verification
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="stepup-fallback-cancel"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  );
}

function ResolvedPanel({
  children,
  dismiss,
}: {
  children: React.ReactNode;
  dismiss?: DismissButton;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
      data-testid="stepup-result"
      role="status"
    >
      {children}
      {dismiss ? (
        <Button variant="outline" onClick={dismiss.onClick} data-testid={dismiss.testId}>
          {dismiss.label}
        </Button>
      ) : null}
    </div>
  );
}

function ExpiredPanel({ dismiss }: { dismiss?: DismissButton }) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
      data-testid="stepup-gone"
      role="status"
    >
      <div className="bg-destructive/15 text-destructive flex size-14 items-center justify-center rounded-full">
        <Timer className="size-8" />
      </div>
      <h3 className="text-xl font-semibold">This check expired.</h3>
      <p className="text-muted-foreground max-w-md text-sm">
        The verification window closed before it could be completed. Your faculty member can see the
        attempt in their records.
      </p>
      {dismiss ? (
        <Button variant="outline" onClick={dismiss.onClick} data-testid={dismiss.testId}>
          {dismiss.label}
        </Button>
      ) : null}
    </div>
  );
}

function ReviewPanel({
  panel,
  dismiss,
}: {
  panel: Extract<TerminalPanel, { kind: "review" }>;
  dismiss?: DismissButton;
}) {
  const headline = "Sent to faculty review";
  if (panel.escalated) {
    return (
      <ResolvedPanel dismiss={dismiss}>
        <div className="bg-verdict-flag/15 text-verdict-flag flex size-14 items-center justify-center rounded-full">
          <Flag className="size-8" />
        </div>
        <VerdictStamp verdict="flag" />
        <h3 className="text-xl font-semibold">{headline}</h3>
        <p className="text-muted-foreground max-w-md text-sm">Faculty will verify you shortly.</p>
      </ResolvedPanel>
    );
  }

  const explanation = panel.decision !== null ? explainDecision(panel.decision, "student") : null;
  return (
    <ResolvedPanel dismiss={dismiss}>
      <div className="bg-verdict-flag/15 text-verdict-flag flex size-14 items-center justify-center rounded-full">
        <Flag className="size-8" />
      </div>
      <VerdictStamp verdict="flag" />
      <h3 className="text-xl font-semibold">{headline}</h3>
      {explanation !== null ? (
        <>
          <p className="text-muted-foreground max-w-md text-sm">{explanation.message}</p>
          {explanation.actions.length > 0 ? (
            <ul className="flex max-w-md flex-col gap-1.5 text-left text-sm">
              {explanation.actions.map((action) => (
                <li key={action} className="flex items-start gap-2">
                  <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        // Attempts exhausted without a usable decision — the backend flagged the event.
        <p className="text-muted-foreground max-w-md text-sm">
          Your face could not be confirmed after several attempts, so your attendance was sent to
          your faculty member for review.
        </p>
      )}
    </ResolvedPanel>
  );
}

type ResolvedTerminal = Exclude<TerminalPanel, { kind: "not_enrolled" }>;

function TerminalView({ panel, dismiss }: { panel: ResolvedTerminal; dismiss?: DismissButton }) {
  if (panel.kind === "expired") return <ExpiredPanel dismiss={dismiss} />;
  if (panel.kind === "review") return <ReviewPanel panel={panel} dismiss={dismiss} />;

  const explanation = explainDecision(panel.decision, "student");
  return (
    <ResolvedPanel dismiss={dismiss}>
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-8" />
      </div>
      <VerdictStamp verdict="accept" />
      <h3 className="text-xl font-semibold">Check verified</h3>
      <p className="text-muted-foreground max-w-md text-sm">{explanation.message}</p>
    </ResolvedPanel>
  );
}

function NotEnrolledView({
  courseCode,
  venueName,
  busy,
  expired,
  error,
  dismiss,
  onConfirmEscalation,
}: {
  courseCode?: string;
  venueName?: string;
  busy: boolean;
  expired: boolean;
  error: string | null;
  /** Only the settled-freeze flow (onDone) offers dismissal here; legacy callers see no change. */
  dismiss?: DismissButton;
  onConfirmEscalation: () => void;
}) {
  const context = [courseCode, venueName].filter(
    (value) => value !== undefined && value.length > 0,
  );
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        aria-live="polite"
        className="flex w-full flex-col items-center gap-4 rounded-xl border p-8 text-center"
        data-testid="stepup-not-enrolled"
        role="status"
      >
        <div className="bg-verdict-flag/15 text-verdict-flag flex size-14 items-center justify-center rounded-full">
          <Info className="size-8" />
        </div>
        <h3 className="text-xl font-semibold">Face check unavailable</h3>
        <p className="text-muted-foreground max-w-md text-sm">
          No face profile is enrolled on your account.
        </p>
        {context.length > 0 ? (
          <p className="text-muted-foreground max-w-md text-sm">{context.join(" · ")}</p>
        ) : null}
        <Button asChild>
          <Link href="/student/devices">Enroll in Devices</Link>
        </Button>
        {dismiss ? (
          <Button variant="outline" onClick={dismiss.onClick} data-testid={dismiss.testId}>
            {dismiss.label}
          </Button>
        ) : null}
      </div>
      <FallbackRequest busy={busy} disabled={expired} onConfirm={onConfirmEscalation} />
      {error !== null ? (
        <p className="text-destructive text-sm" data-testid="stepup-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StepUpChallenge({
  actorToken,
  challenge,
  courseCode,
  venueName,
  onResolved,
  onDismiss,
  onSettled,
  onDone,
}: {
  actorToken: string;
  challenge: StepUpChallengeRef;
  courseCode?: string;
  venueName?: string;
  onResolved?: () => void;
  onDismiss?: () => void;
  /** Fired once when any settled outcome is reached so wrappers can freeze the panel. */
  onSettled?: () => void;
  /** When provided, settled panels dismiss via a "Done" button instead of the legacy Back. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const completeWithFace = useMutation(api.challenges.completeWithFace);
  const escalateToReview = useMutation(api.challenges.escalateToReview);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [terminal, setTerminal] = useState<TerminalPanel | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureKey, setCaptureKey] = useState(0);

  useEffect(() => {
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [challenge.expiresAt]);

  const expired = secondsLeft !== null && secondsLeft <= 0;

  // The backend marks attempts-exhausted challenges failed while still replying
  // attempt_rejected with zero left; surface that as a settled review outcome.
  useEffect(() => {
    if (attemptsLeft !== null && attemptsLeft <= 0) {
      setTerminal((previous) => previous ?? { kind: "review", decision: null });
    }
  }, [attemptsLeft]);

  const settledNotifiedRef = useRef(false);
  const notifySettled = useCallback(() => {
    if (settledNotifiedRef.current) return;
    settledNotifiedRef.current = true;
    onSettled?.();
  }, [onSettled]);

  // Terminal state set outside the mutation handlers (attempts exhausted above,
  // or the countdown hitting zero) must still freeze the wrapper before the live
  // pending-challenge query flips to null and would unmount this panel.
  useEffect(() => {
    if (terminal !== null || expired) notifySettled();
  }, [terminal, expired, notifySettled]);

  function settle() {
    router.refresh();
    onResolved?.();
  }

  async function handleCapture(result: {
    embedding: number[];
    liveness: { frameCount: number; motionScore: number; brightnessScore: number };
  }) {
    if (busy || expired) return;
    setBusy(true);
    setError(null);
    setAttemptsLeft(null);
    try {
      const response = await completeWithFace({
        actorToken,
        challengeId: challenge._id,
        embedding: result.embedding,
        liveness: result.liveness,
      });
      if (response.kind === "resolved") {
        setTerminal(
          response.state === "verified"
            ? { kind: "verified", decision: response.decision }
            : { kind: "review", decision: response.decision },
        );
        notifySettled();
        settle();
      } else if (response.kind === "attempt_rejected") {
        setAttemptsLeft(response.attemptsLeft);
        setCaptureKey((key) => key + 1);
      } else if (response.kind === "not_enrolled") {
        setTerminal({ kind: "not_enrolled" });
        notifySettled();
      } else {
        setTerminal({ kind: "expired" });
        notifySettled();
      }
    } catch (cause) {
      setError(describeError(cause));
      setCaptureKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  async function handleEscalate() {
    if (busy || expired) return;
    setBusy(true);
    setError(null);
    try {
      const response = await escalateToReview({
        actorToken,
        challengeId: challenge._id,
        reason: "camera_unavailable",
      });
      if (response.kind === "gone") {
        setTerminal({ kind: "expired" });
      } else {
        setTerminal({ kind: "review", decision: response.decision, escalated: true });
      }
      notifySettled();
      settle();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  const doneDismiss: DismissButton | undefined =
    onDone !== undefined ? { label: "Done", testId: "stepup-done", onClick: onDone } : undefined;
  const legacyDismiss: DismissButton | undefined =
    onDismiss !== undefined ? { label: "Back", onClick: onDismiss } : undefined;

  if (expired && terminal === null) {
    return <ExpiredPanel dismiss={doneDismiss ?? legacyDismiss} />;
  }

  if (terminal !== null) {
    if (terminal.kind === "not_enrolled") {
      return (
        <NotEnrolledView
          courseCode={courseCode}
          venueName={venueName}
          busy={busy}
          expired={expired}
          error={error}
          dismiss={onDone !== undefined ? doneDismiss : undefined}
          onConfirmEscalation={() => void handleEscalate()}
        />
      );
    }
    return <TerminalView panel={terminal} dismiss={doneDismiss ?? legacyDismiss} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ScanLine className="size-5" />
          <span>Extra verification needed</span>
          <CountdownChip expiresAt={challenge.expiresAt} />
        </CardTitle>
        <CardDescription>
          This attendance check needs one more proof that it&apos;s really you.
          {courseCode !== undefined && courseCode.length > 0 ? ` ${courseCode}` : ""}
          {venueName !== undefined && venueName.length > 0 ? ` · ${venueName}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {attemptsLeft !== null && attemptsLeft > 0 ? (
          <p
            className="border-verdict-stepup/40 bg-verdict-stepup/10 text-verdict-stepup rounded-lg border p-3 text-sm"
            data-testid="stepup-attempt-error"
            role="status"
          >
            Check inconclusive — {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left
          </p>
        ) : null}
        {error !== null ? (
          <p className="text-destructive text-sm" data-testid="stepup-error" role="alert">
            {error}
          </p>
        ) : null}
        <FaceCapture
          key={captureKey}
          title="Confirm it's you"
          description="A quick live face scan with a liveness check — no photo is stored."
          submitLabel="Scan my face"
          busy={busy || expired}
          onCapture={(result) => void handleCapture(result)}
        />
        {busy ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
            <Loader2 className="size-4 animate-spin" /> Checking…
          </p>
        ) : null}
        <FallbackRequest busy={busy} disabled={expired} onConfirm={() => void handleEscalate()} />
      </CardContent>
    </Card>
  );
}

/** Server pages mint the actor token; this island polls for a live challenge. */

/** A live challenge plus the display metadata the pending query attaches to it. */
type FrozenChallenge = StepUpChallengeRef & {
  courseCode?: string;
  venueName?: string;
};

export function PendingChallengeBanner({ actorToken }: { actorToken: string }) {
  const pending = useQuery(api.challenges.getMyPending, { actorToken });
  // When a challenge settles server-side, getMyPending flips to null and would
  // unmount the result panel before anyone can read it. Freeze the last known
  // challenge ref on settle and keep rendering until the student hits Done.
  const [frozen, setFrozen] = useState<FrozenChallenge | null>(null);
  const latestChallengeRef = useRef<FrozenChallenge | null>(null);
  if (pending !== undefined && pending !== null) {
    latestChallengeRef.current = pending.challenge;
  }
  const challenge = frozen ?? latestChallengeRef.current;

  const freezeLatest = useCallback(() => {
    setFrozen((current) => current ?? latestChallengeRef.current);
  }, []);

  const unfreeze = useCallback(() => {
    setFrozen(null);
  }, []);

  // Loading (undefined) or resolved-without-settle-signal (null): hide the banner.
  if (frozen === null && (pending === undefined || pending === null)) return null;
  if (challenge === null) return null;

  const settled = frozen !== null;

  return (
    <section
      data-testid="pending-challenge"
      className="border-primary/60 bg-primary/5 flex flex-col gap-4 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ScanLine className="size-5" />
          {settled ? "Verification update" : "Live verification requested"}
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {[challenge.courseCode, challenge.venueName].filter(Boolean).join(" · ") ||
              "Verification"}
          </Badge>
          {!settled ? <CountdownChip expiresAt={challenge.expiresAt} /> : null}
        </div>
      </div>
      <StepUpChallenge
        actorToken={actorToken}
        challenge={challenge}
        courseCode={challenge.courseCode}
        venueName={challenge.venueName}
        onSettled={freezeLatest}
        onDone={unfreeze}
      />
    </section>
  );
}
