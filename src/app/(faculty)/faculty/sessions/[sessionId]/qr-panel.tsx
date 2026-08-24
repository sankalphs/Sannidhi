"use client";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Challenge = {
  token: string;
  expiresAt: number;
  rotationHintMs: number;
};

type SessionStatus = "active" | "paused" | "closed";

function describeError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (typeof data === "string") {
      if (data === "session_not_active") return "This session is not active.";
      if (data === "session_window_closed") {
        return "The session window has closed. Restart to publish a new code.";
      }
      if (data === "unauthorized") return "You are not authorized to publish this code.";
      return data;
    }
  }
  return "Could not publish the check-in code. Please try again.";
}

export function QrPanel({
  actorToken,
  sessionId,
  sessionStatus,
}: {
  actorToken: string;
  sessionId: Id<"class_sessions">;
  sessionStatus: SessionStatus;
}) {
  const publishChallenge = useMutation(api.classSessions.publishChallenge);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  const rotationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = sessionStatus === "active";

  useEffect(() => {
    if (!isActive) {
      if (rotationTimer.current !== null) {
        clearTimeout(rotationTimer.current);
        rotationTimer.current = null;
      }
      setChallenge(null);
      setDataUrl(null);
      setPublishing(false);
      setError(null);
      return;
    }
    let cancelled = false;

    async function publish() {
      if (cancelled) return;
      setPublishing(true);
      setError(null);
      try {
        const result = await publishChallenge({ actorToken, sessionId });
        if (cancelled) return;
        setChallenge(result);
        const delay = Math.max(
          1500,
          Math.min(result.rotationHintMs, result.expiresAt - Date.now() - 2000),
        );
        if (rotationTimer.current !== null) clearTimeout(rotationTimer.current);
        rotationTimer.current = setTimeout(() => {
          void publish();
        }, delay);
      } catch (cause) {
        if (cancelled) return;
        setChallenge(null);
        setDataUrl(null);
        setError(describeError(cause));
      } finally {
        if (!cancelled) setPublishing(false);
      }
    }

    void publish();
    return () => {
      cancelled = true;
      if (rotationTimer.current !== null) {
        clearTimeout(rotationTimer.current);
        rotationTimer.current = null;
      }
    };
  }, [isActive, actorToken, sessionId, publishChallenge, attempt]);

  useEffect(() => {
    if (challenge === null || typeof window === "undefined") {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const qrcode = await import("qrcode");
        const url = await qrcode.toDataURL(challenge.token, { width: 280, margin: 1 });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challenge]);

  useEffect(() => {
    if (challenge === null) return;
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [challenge]);

  const secondsLeft =
    challenge !== null && isActive
      ? Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000))
      : null;

  return (
    <Card
      className={cn(
        "border-primary-foreground/15 bg-primary text-primary-foreground shadow-primary/50 shadow-[0_16px_48px_-24px]",
        !isActive && "opacity-60",
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="size-4" />
          Check-in QR
        </CardTitle>
        <CardDescription className="text-primary-foreground/70">
          {isActive
            ? "Students scan to check in. The code rotates automatically."
            : sessionStatus === "paused"
              ? "Paused — restart to publish a new code."
              : "Closed — restart to publish a new code."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {!isActive ? (
          <div className="bg-primary-foreground/10 text-primary-foreground/50 flex aspect-square w-full max-w-[280px] items-center justify-center rounded-lg">
            <QrCode className="size-10" />
          </div>
        ) : error !== null ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-center text-sm" data-testid="qr-error">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              data-testid="qr-retry"
              className="border-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RefreshCw />
              Retry
            </Button>
          </div>
        ) : challenge !== null && dataUrl !== null ? (
          <>
            <div className="mx-auto w-fit rounded-lg bg-white p-3">
              <img src={dataUrl} alt="Session QR code" width={280} height={280} />
            </div>
            <p className="text-primary-foreground/70 font-mono text-sm tracking-[0.08em] tabular-nums">
              Refreshes in {secondsLeft}s
            </p>
            <data data-testid="qr-token" className="hidden">
              {challenge.token}
            </data>
            <data data-testid="qr-expires-at" className="hidden">
              {challenge.expiresAt}
            </data>
          </>
        ) : (
          <div className="bg-primary-foreground/10 flex aspect-square w-full max-w-[280px] animate-pulse items-center justify-center rounded-lg">
            {publishing ? (
              <Loader2 className="text-primary-foreground/70 size-6 animate-spin" />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
