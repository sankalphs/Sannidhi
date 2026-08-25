"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormField } from "@/app/(auth)/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { classifyIdentifier } from "@/lib/auth/password-policy";

export function PasswordLoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");

    setPending(true);
    setError(null);
    try {
      const identifier = value("identifier");
      const needsInstitution = classifyIdentifier(identifier) === "usn";
      if (needsInstitution && value("institutionCode").trim().length === 0) {
        throw new Error("Enter your institution code to sign in with a USN.");
      }
      const response = await fetch("/api/auth/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          password: value("password"),
          institutionCode: value("institutionCode"),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not sign in. Try again shortly.");
      }
      router.push(payload.redirect ?? "/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" data-testid="password-login-form">
      <FormField label="USN or email" htmlFor="identifier">
        <Input
          id="identifier"
          name="identifier"
          required
          maxLength={254}
          placeholder="1SI22CS001 or ananya@student.edu"
          autoComplete="username"
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
        <FormField label="Password" htmlFor="loginPassword">
          <Input
            id="loginPassword"
            name="password"
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
          />
        </FormField>
        <FormField label="Institution code" htmlFor="loginInstitutionCode" hint="(for USN)">
          <Input
            id="loginInstitutionCode"
            name="institutionCode"
            maxLength={24}
            placeholder="SIT"
            autoComplete="off"
            className="uppercase"
          />
        </FormField>
      </div>

      {error !== null && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound />}
        {pending ? "Signing in…" : "Sign in with password"}
      </Button>
    </form>
  );
}
