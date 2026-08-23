"use client";

import { Fingerprint, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";

import { Button } from "@/components/ui/button";
import { ROLE_TO_HOME, type Role } from "@/lib/auth/session";

type EnrollmentStep = "idle" | "starting" | "registering" | "verifying" | "activated" | "error";

type PasskeyEnrollmentStepProps = {
  token: string;
};

function friendlyError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") {
      return "The passkey prompt was cancelled or timed out. Please try again.";
    }
    if (error.name === "InvalidStateError") {
      return "This device already has a passkey registered for your account.";
    }
    return error.message;
  }
  return "Something went wrong while setting up your passkey.";
}

export function PasskeyEnrollmentStep({ token }: PasskeyEnrollmentStepProps) {
  const router = useRouter();
  const [step, setStep] = useState<EnrollmentStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("student");

  async function enroll() {
    setError(null);
    setStep("starting");
    try {
      const startResponse = await fetch("/api/auth/enroll/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!startResponse.ok) {
        const payload = (await startResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Your invite could not be activated");
      }

      if (!browserSupportsWebAuthn()) {
        throw new Error("This browser does not support passkeys. Try a modern browser.");
      }

      const optionsResponse = await fetch("/api/auth/webauthn/register/options", {
        method: "POST",
      });
      if (!optionsResponse.ok) {
        const payload = (await optionsResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not start passkey registration");
      }
      const options = await optionsResponse.json();

      setStep("registering");
      const response = await startRegistration({ optionsJSON: options });

      setStep("verifying");
      const verifyResponse = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!verifyResponse.ok) {
        const payload = (await verifyResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Passkey registration could not be verified");
      }
      const result = (await verifyResponse.json()) as { role?: Role };
      if (result.role !== undefined) setRole(result.role);
      setStep("activated");
    } catch (cause) {
      setError(friendlyError(cause));
      setStep("error");
    }
  }

  if (step === "activated") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-emerald-600/40 bg-emerald-500/5 p-4 text-left">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-emerald-600" />
          Account activated
        </p>
        <p className="text-muted-foreground text-sm">
          Your passkey is registered and ready. Sign in with it from any device you keep it on.
        </p>
        <Button onClick={() => router.push(ROLE_TO_HOME[role])}>Continue</Button>
      </div>
    );
  }

  const pending = step === "starting" || step === "registering" || step === "verifying";
  const pendingCopy =
    step === "starting"
      ? "Activating your invite…"
      : step === "registering"
        ? "Follow your browser's prompt to create the passkey…"
        : "Verifying your passkey…";

  return (
    <div className="flex flex-col gap-2 text-left">
      <Button onClick={enroll} disabled={pending}>
        <Fingerprint />
        Register passkey
      </Button>
      {pending && <p className="text-muted-foreground text-sm">{pendingCopy}</p>}
      {step === "error" && error !== null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
