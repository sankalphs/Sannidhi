"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type BiometricRecordView = {
  consentVersion: string;
  consentedAt: number | null;
  faceTemplateRef: string | null;
  faceEnrolledAt: number | null;
  withdrawnAt: number | null;
};

export type BiometricUiState = "no-consent" | "consented" | "face-ref-enrolled" | "withdrawn";

export function deriveBiometricUiState(record: BiometricRecordView | null): BiometricUiState {
  if (record === null || record.consentedAt === null) return "no-consent";
  if (record.withdrawnAt !== null) return "withdrawn";
  if (record.faceTemplateRef !== null) return "face-ref-enrolled";
  return "consented";
}

const STATE_BADGE: Record<
  BiometricUiState,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  "no-consent": { label: "No consent recorded", variant: "outline" },
  consented: { label: "Consented", variant: "secondary" },
  "face-ref-enrolled": { label: "Face template reference enrolled", variant: "default" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
};

export function BiometricsCard({ initialRecord }: { initialRecord: BiometricRecordView | null }) {
  const router = useRouter();
  const [record, setRecord] = useState<BiometricRecordView | null>(initialRecord);
  useEffect(() => {
    setRecord(initialRecord);
  }, [initialRecord]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = deriveBiometricUiState(record);

  async function act(action: "consent-and-enroll" | "withdraw") {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/enrollment/biometrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Request failed");
      }
      if (action === "withdraw") {
        setRecord((current) => (current ? { ...current, withdrawnAt: Date.now() } : current));
      } else {
        const faceTemplateRef =
          typeof data.faceTemplateRef === "string" ? data.faceTemplateRef : null;
        const faceEnrolledAt = typeof data.faceEnrolledAt === "number" ? data.faceEnrolledAt : null;
        setRecord((current) =>
          current
            ? { ...current, faceTemplateRef, faceEnrolledAt, withdrawnAt: null }
            : {
                consentVersion: "",
                consentedAt: Date.now(),
                faceTemplateRef,
                faceEnrolledAt,
                withdrawnAt: null,
              },
        );
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setBusy(false);
    }
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
          Stored with your consent: a record that you agreed (with its version) and a numeric
          face-template reference used for matching during step-up verification.
        </li>
        <li>
          Never stored: raw images or photographs of your face. Only the template reference is kept,
          per spec &sect;16.
        </li>
        <li>
          Consent is optional today. It only becomes relevant once the institution enables biometric
          step-up verification in a later phase.
        </li>
        <li>
          Withdraw anytime; withdrawal stops all future biometric checks immediately. Past consent
          and audit entries are retained until the institutional retention period deletes them.
        </li>
      </ul>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {record?.consentedAt !== null && record !== null ? (
        <p className="text-muted-foreground text-xs">
          Consent version <span className="font-mono">{record.consentVersion}</span>
          {record.faceTemplateRef !== null ? (
            <>
              {" "}
              · template reference <span className="font-mono">{record.faceTemplateRef}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {state === "no-consent" || state === "withdrawn" ? (
          <Button size="sm" disabled={busy} onClick={() => void act("consent-and-enroll")}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Give consent &amp; enroll face (stub)
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void act("withdraw")}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Withdraw consent
          </Button>
        )}
      </div>
    </section>
  );
}
