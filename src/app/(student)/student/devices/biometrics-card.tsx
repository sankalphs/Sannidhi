"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FaceCapture } from "@/components/biometry/face-capture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatDate } from "./device-state";

export type BiometricRecordView = {
  consentVersion: string;
  consentedAt: number | null;
  faceTemplateRef: string | null;
  faceEnrolledAt: number | null;
  withdrawnAt: number | null;
  embeddingVersion?: string | null;
};

export type BiometricUiState = "no-consent" | "consented" | "face-enrolled";

export function deriveBiometricUiState(record: BiometricRecordView | null): BiometricUiState {
  if (record === null || record.consentedAt === null || record.withdrawnAt !== null) {
    return "no-consent";
  }
  if (record.faceTemplateRef !== null) return "face-enrolled";
  return "consented";
}

const STATE_BADGE: Record<
  BiometricUiState,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  "no-consent": { label: "No consent recorded", variant: "outline" },
  consented: { label: "Consented", variant: "secondary" },
  "face-enrolled": { label: "Face enrolled", variant: "default" },
};

export function BiometricsCard({ initialRecord }: { initialRecord: BiometricRecordView | null }) {
  const router = useRouter();
  const [record, setRecord] = useState<BiometricRecordView | null>(initialRecord);
  useEffect(() => {
    setRecord(initialRecord);
  }, [initialRecord]);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = deriveBiometricUiState(record);

  async function postAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch("/api/enrollment/biometrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Request failed");
    }
    return data;
  }

  async function handleCapture(embedding: number[]) {
    setError(null);
    setBusy(true);
    try {
      // The consent disclosure above is shown before capture starts, so the
      // explicit acknowledgement travels with the enrollment request.
      const data = await postAction({
        action: "enroll-face",
        embedding,
        consentAcknowledged: true,
      });
      if (data.record !== null && data.record !== undefined) {
        setRecord(data.record as BiometricRecordView);
      }
      setCapturing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    setError(null);
    setBusy(true);
    try {
      await postAction({ action: "withdraw" });
      setRecord(null);
      setCapturing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function handleUnavailable(reason: "denied" | "unavailable") {
    setCapturing(false);
    setError(
      reason === "denied"
        ? "Camera access was denied. Allow camera permission and try again."
        : "Camera is unavailable on this device.",
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Fingerprint className="size-5" />
          Biometric verification (optional)
        </h2>
        <Badge variant={STATE_BADGE[state].variant}>{STATE_BADGE[state].label}</Badge>
      </div>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
        <li>
          Stored with your consent: a record that you agreed (with its version) and a numeric face
          template computed entirely on your device, used for matching during step-up verification.
        </li>
        <li>
          Never stored: raw images or photographs of your face. Frames are read on-device and
          discarded immediately; only the resulting numbers travel to the server.
        </li>
        <li>
          Consent is optional. It only matters once the institution enables biometric step-up
          verification for a class session.
        </li>
        <li>
          Withdraw anytime; withdrawal stops all future biometric checks immediately and deletes
          your stored face template. Past consent and audit entries are retained until the
          institutional retention period removes them.
        </li>
      </ul>
      {error ? (
        <p role="alert" data-testid="biometric-error" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {record !== null && record.consentedAt !== null && record.withdrawnAt === null ? (
        <p className="text-muted-foreground text-xs">
          Consent version <span className="font-mono">{record.consentVersion}</span>
        </p>
      ) : null}
      {state === "face-enrolled" && record !== null ? (
        <p data-testid="biometric-status" className="text-muted-foreground text-xs">
          Face enrolled
          {record.faceEnrolledAt !== null ? (
            <>
              {" "}
              · <span suppressHydrationWarning>{formatDate(record.faceEnrolledAt)}</span>
            </>
          ) : null}{" "}
          · template <span className="font-mono">{record.embeddingVersion ?? "unknown"}</span>
        </p>
      ) : null}
      {(state === "no-consent" || state === "consented") &&
        (capturing ? (
          <FaceCapture
            title="Enroll your face"
            description="A few frames are scanned on this device; nothing is uploaded until you finish."
            submitLabel="Scan & enroll"
            busy={busy}
            onCapture={(result) => void handleCapture(result.embedding)}
            onUnavailable={handleUnavailable}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              data-testid="biometric-enroll"
              disabled={busy}
              onClick={() => {
                setError(null);
                setCapturing(true);
              }}
            >
              {state === "consented" ? "Enroll face" : "Give consent & enroll face"}
            </Button>
            {state === "consented" ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="biometric-withdraw"
                disabled={busy}
                onClick={() => void handleWithdraw()}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                Withdraw consent
              </Button>
            ) : null}
          </div>
        ))}
      {state === "face-enrolled" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="biometric-withdraw"
            disabled={busy}
            onClick={() => void handleWithdraw()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            Withdraw consent
          </Button>
        </div>
      ) : null}
    </section>
  );
}
