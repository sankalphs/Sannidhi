"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CAPTURE_FRAME_COUNT,
  CAPTURE_INTERVAL_MS,
  assessLiveness,
  averageEmbeddings,
  frameStats,
  normalizeToEmbedding,
  type LivenessAssessment,
  type RawFrame,
} from "@/lib/biometry";

type CaptureStatus = "off" | "active" | "scanning";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function FaceCapture({
  title,
  description,
  submitLabel,
  busy = false,
  onCapture,
  onUnavailable,
  className,
}: {
  title: string;
  description?: string;
  submitLabel?: string;
  busy?: boolean;
  onCapture: (result: { embedding: number[]; liveness: LivenessAssessment }) => void;
  onUnavailable?: (reason: "denied" | "unavailable") => void;
  className?: string;
}) {
  const [status, setStatus] = useState<CaptureStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current !== null) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    // Reset on mount: StrictMode's dev remount reuses the ref after cleanup
    // set it, which would otherwise poison every later capture.
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stopStream();
    };
  }, [stopStream]);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera is unavailable on this device.");
      onUnavailable?.("unavailable");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320 },
        audio: false,
      });
      if (unmountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video !== null) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setStatus("active");
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
      setError(
        denied
          ? "Camera access was denied. Allow camera permission and try again."
          : "Camera is unavailable on this device.",
      );
      onUnavailable?.(denied ? "denied" : "unavailable");
    }
  }, [onUnavailable]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (video === null || status !== "active") return;
    setStatus("scanning");
    try {
      const width = video.videoWidth || 320;
      const height = video.videoHeight || 240;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("canvas_unavailable");

      // Frames stay on-device: only derived numbers (embedding vector + luminance
      // stats) ever cross this boundary, never raw pixels.
      const samples: { vector: number[]; meanLuminance: number }[] = [];
      for (let i = 0; i < CAPTURE_FRAME_COUNT; i += 1) {
        await sleep(CAPTURE_INTERVAL_MS);
        if (unmountedRef.current) return;
        context.drawImage(video, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const frame: RawFrame = { data: imageData.data, width, height };
        samples.push({
          vector: normalizeToEmbedding(frame),
          meanLuminance: frameStats(frame).meanLuminance,
        });
      }
      onCapture({
        embedding: averageEmbeddings(samples.map((sample) => sample.vector)),
        liveness: assessLiveness(samples),
      });
    } catch {
      setError("Could not read frames from the camera. Try again.");
    } finally {
      stopStream();
      if (!unmountedRef.current) setStatus("off");
    }
  }, [onCapture, status, stopStream]);

  return (
    <div
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-6 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm leading-none font-semibold">{title}</h3>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      <div className="bg-muted relative aspect-video overflow-hidden rounded-lg border">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          data-testid="face-preview"
          className={cn("size-full object-cover", status === "off" && "invisible")}
        />
        {status === "off" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Camera is off</span>
          </div>
        ) : null}
        {status === "scanning" ? (
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
            <span
              data-testid="face-status"
              className="bg-background/80 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
            >
              <Loader2 className="size-3 animate-spin" /> Scanning…
            </span>
          </div>
        ) : null}
      </div>
      {error !== null ? (
        <p role="alert" data-testid="face-error" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {status === "scanning" ? (
        <Button
          type="button"
          disabled
          data-testid="face-capture"
          aria-label={submitLabel ?? "Scan now"}
        >
          {submitLabel ?? "Scan now"}
        </Button>
      ) : (
        <Button
          type="button"
          data-testid={status === "off" ? "face-start" : "face-capture"}
          disabled={busy}
          onClick={() => {
            if (status === "off") void startCamera();
            else void capture();
          }}
        >
          {status === "off" ? "Start camera" : (submitLabel ?? "Scan now")}
        </Button>
      )}
    </div>
  );
}
