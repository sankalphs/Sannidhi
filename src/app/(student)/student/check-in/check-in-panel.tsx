"use client";

import { api } from "../../../../../convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { OutcomeScreen, type CheckInOutcome, type FailureVerdict } from "./outcome-screen";

export type ActiveClassSession = {
  sessionId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  venueName: string;
  windowEndsAt: number;
};

type CameraState = "off" | "active" | "unavailable";

function extractFailure(
  cause: unknown,
): { kind: "failure"; verdict: FailureVerdict; reasonCodes: string[] } | null {
  if (typeof cause !== "object" || cause === null || !("data" in cause)) return null;
  const data: unknown = (cause as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const payload = data as { code?: unknown; verdict?: unknown; reasonCodes?: unknown };
  if (
    payload.code !== "checkin_failed" ||
    (payload.verdict !== "expired" &&
      payload.verdict !== "replayed" &&
      payload.verdict !== "wrong_session" &&
      payload.verdict !== "malformed")
  ) {
    return null;
  }
  const reasonCodes = Array.isArray(payload.reasonCodes)
    ? payload.reasonCodes.filter((reason): reason is string => typeof reason === "string")
    : [];
  return { kind: "failure", verdict: payload.verdict, reasonCodes };
}

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

export function CheckInPanel({
  actorToken,
  active,
}: {
  actorToken: string;
  active: ActiveClassSession | null;
}) {
  const redeemChallenge = useMutation(api.checkin.redeemChallenge);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("off");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const submit = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (trimmed.length === 0 || submitting) return;
      setSubmitting(true);
      try {
        const result = await redeemChallenge({ actorToken, token: trimmed });
        setOutcome({
          kind: "success",
          courseCode: result.courseCode,
          venueName: result.venueName,
          checkedInAt: result.checkedInAt,
        });
      } catch (cause) {
        setOutcome(
          extractFailure(cause) ?? { kind: "failure", verdict: "malformed", reasonCodes: [] },
        );
      } finally {
        setSubmitting(false);
        setCode("");
      }
    },
    [actorToken, redeemChallenge, submitting],
  );

  useEffect(() => {
    if (pendingToken === null) return;
    setPendingToken(null);
    void submit(pendingToken);
  }, [pendingToken, submit]);

  useEffect(() => {
    if (outcome !== null) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let detecting = false;

    const DetectorCtor = window.BarcodeDetector;
    if (!DetectorCtor) {
      setCameraState("unavailable");
      return;
    }
    const detector = new DetectorCtor({ formats: ["qr_code"] });

    const stopEverything = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      if (stream !== null) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        const video = videoRef.current;
        if (video !== null) {
          video.srcObject = mediaStream;
          await video.play().catch(() => {});
        }
        setCameraState("active");
        timer = setInterval(() => {
          const frameSource = videoRef.current;
          if (frameSource === null || cancelled || detecting) return;
          detecting = true;
          detector
            .detect(frameSource)
            .then((results) => {
              if (cancelled) return;
              const hit = results.find((result) => result.rawValue.length > 0);
              if (hit !== undefined) {
                stopEverything();
                setPendingToken(hit.rawValue);
              }
            })
            .catch(() => {})
            .finally(() => {
              detecting = false;
            });
        }, 300);
      })
      .catch(() => {
        if (!cancelled) setCameraState("unavailable");
      });

    return () => {
      cancelled = true;
      stopEverything();
    };
  }, [outcome]);

  const secondsLeft = useSecondsUntil(active?.windowEndsAt ?? Number.MAX_SAFE_INTEGER);

  if (outcome !== null) {
    return <OutcomeScreen outcome={outcome} onRetry={() => setOutcome(null)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {active !== null ? (
        <Card className="border-primary/60 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>Class in progress: {active.courseCode}</span>
              <span className="text-muted-foreground font-normal">
                · {active.sectionName} · {active.venueName}
              </span>
              <Badge variant="secondary" className="font-mono">
                Window closes in{" "}
                <span suppressHydrationWarning>
                  {secondsLeft === null ? "--:--" : formatCountdown(secondsLeft)}
                </span>
              </Badge>
            </CardTitle>
            <CardDescription>{active.courseTitle}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine /> Scan the class QR
          </CardTitle>
          <CardDescription>
            Point your camera at the rotating QR shown in class, or paste the check-in code below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {cameraState === "unavailable" ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
              Camera is unavailable on this device — paste the check-in code instead.
            </p>
          ) : (
            <div className="bg-muted relative aspect-video overflow-hidden rounded-lg border">
              <video ref={videoRef} muted playsInline autoPlay className="size-full object-cover" />
              {cameraState !== "active" ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="text-muted-foreground size-6 animate-spin" />
                </div>
              ) : null}
            </div>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(code);
            }}
          >
            <Input
              aria-label="Paste check-in code"
              className="font-mono"
              data-testid="checkin-input"
              placeholder="Paste check-in code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={submitting}
            />
            <Button
              type="submit"
              data-testid="submit-code"
              disabled={submitting || code.trim().length === 0}
            >
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Submit
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
