"use client";

import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { startAuthentication } from "@simplewebauthn/browser";

import { Button } from "@/components/ui/button";

export function PasskeyLoginButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithPasskey() {
    setPending(true);
    setError(null);
    try {
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

      const response = await startAuthentication({ optionsJSON: options });

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
    <div className="flex flex-col items-center gap-2">
      <Button onClick={signInWithPasskey} disabled={pending}>
        <Fingerprint />
        {pending ? "Waiting for your passkey…" : "Sign in with passkey"}
      </Button>
      {error !== null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
