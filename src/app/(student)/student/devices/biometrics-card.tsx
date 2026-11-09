"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FaceCapture } from "@/components/biometry/face-capture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runPasskeyStepUp } from "@/lib/client/passkey-step-up";

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

export function BiometricsCard({
  initialRecord,
  studentId,
}: {
  initialRecord: BiometricRecordView | null;
  studentId: string;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<BiometricRecordView | null>(initialRecord);
  useEffect(() => {
    setRecord(initialRecord);
  }, [initialRecord]);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A scan held back because replacing a template needs a fresh passkey step-up.
  // Bound to the student who captured it: another sign-in in this tab must not
  // be able to enroll that scan for a different account.
  const [pending, setPending] = useState<{ studentId: string; embedding: number[] } | null>(null);
  const pendingEmbedding = pending !== null && pending.studentId === studentId ? pending : null;
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

  async function enrollFace(embedding: number[]) {
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
    setPending(null);
    router.refresh();
  }

  async function handleCapture(embedding: number[]) {
    setError(null);
    setBusy(true);
    try {
      await enrollFace(embedding);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Request failed";
      if (/identity re-verification required/i.test(message)) {
        setCapturing(false);
        setPending({ studentId, embedding });
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReverify() {
    if (pendingEmbedding === null) return;
    setError(null);
    setBusy(true);
    try {
      await runPasskeyStepUp();
      await enrollFace(pendingEmbedding.embedding);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Identity re-verification failed");
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
      // A scan waiting on passkey verification must not survive withdrawal.
      setPending(null);
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
          Camera check (optional)
        </h2>
        <Badge variant={STATE_BADGE[state].variant}>{STATE_BADGE[state].label}</Badge>
      </div>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
        <li>
          What it is: a quick camera check some check-ins ask for. It compares a coarse brightness
          pattern of your face with your enrollment. It cannot reliably tell people apart, so it
          only helps your faculty member review a check-in; it is not biometric identification.
        </li>
        <li>
          Stored with your consent: a record that you agreed (with its version) and the numeric
          template computed entirely on your device, used for comparison during step-up checks.
        </li>
        <li>
          Never stored: raw images or photographs of your face. Frames are read on-device and
          discarded immediately; only the resulting numbers travel to the server.
        </li>
        <li>
          Consent is optional. It only matters when a check-in asks for an extra step; without it,
          you can ask your faculty member to verify you instead.
        </li>
        <li>
          Withdraw anytime; withdrawal stops all future camera checks immediately and deletes your
          stored face template. Past consent and audit entries are retained until the institutional
          retention period removes them.
        </li>
      </ul>
      {error ? (
        <p role="alert" data-testid="biometric-error" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {pendingEmbedding !== null ? (
        <div
          data-testid="biometric-reverify"
          className="flex flex-col items-start gap-2 rounded-lg border p-3"
        >
          <p className="text-sm">
            You have enrolled a face template before, so replacing it needs a fresh identity check.
            Confirm it&apos;s you with your passkey to finish enrolling this scan.
          </p>
          <Button size="sm" disabled={busy} onClick={() => void handleReverify()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Verify with passkey
          </Button>
        </div>
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
