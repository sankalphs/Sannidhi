"use client";

import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { startAuthentication } from "@simplewebauthn/browser";

import { Button } from "@/components/ui/button";

const WEBAUTHN_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), WEBAUTHN_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function passkeysUnsupported(): boolean {
  return typeof window === "undefined" || !window.PublicKeyCredential;
}

export function PasskeyLoginButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithPasskey() {
    setPending(true);
    setError(null);
    try {
      if (passkeysUnsupported()) {
        throw new Error(
          "This browser does not support passkeys. Use demo access below or switch browsers.",
        );
      }
      const optionsResponse = await fetch("/api/auth/webauthn/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!optionsResponse.ok) {
        const payload = (await optionsResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not start passkey sign-in");
      }
      const options = await optionsResponse.json();

      const response = await withTimeout(
        startAuthentication({ optionsJSON: options }),
        "Passkey sign-in timed out. Try again, or use the demo access below.",
      );

      const verifyResponse = await fetch("/api/auth/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!verifyResponse.ok) {
        const payload = (await verifyResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Passkey verification failed");
      }
      const result = (await verifyResponse.json()) as { redirect?: string };
      router.push(result.redirect ?? "/");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Passkey sign-in was cancelled or is unavailable on this device",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button size="lg" className="w-full" onClick={signInWithPasskey} disabled={pending}>
        <Fingerprint />
        {pending ? "Waiting for your passkey…" : "Sign in with passkey"}
      </Button>
      {error !== null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
