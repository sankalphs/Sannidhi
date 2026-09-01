"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormField } from "@/app/(auth)/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  describePasswordIssues,
  normalizeUsn,
  validateEmail,
  validatePassword,
  validateUsn,
} from "@/lib/auth/password-policy";

type Status = "idle" | "submitting" | "success";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // The invite link can carry its token as ?invite=…; a manually pasted
  // token is the fallback. One effective token, never an empty override.
  const inviteFromUrl = searchParams.get("invite")?.trim() ?? "";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");

    setStatus("submitting");
    setError(null);

    const usnIssues = validateUsn(value("usn"));
    if (usnIssues.length > 0) {
      setError("Enter a valid USN (4–24 letters and numbers), e.g. 1SI22CS001.");
      setStatus("idle");
      return;
    }
    if (!validateEmail(value("email"))) {
      setError("Enter a valid email address.");
      setStatus("idle");
      return;
    }
    const passwordIssues = validatePassword(value("password"));
    if (passwordIssues.length > 0) {
      setError(describePasswordIssues(passwordIssues));
      setStatus("idle");
      return;
    }
    if (value("password") !== value("confirmPassword")) {
      setError("Passwords do not match.");
      setStatus("idle");
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionCode: value("institutionCode"),
          name: value("name"),
          email: value("email"),
          usn: normalizeUsn(value("usn")),
          password: value("password"),
          confirmPassword: value("confirmPassword"),
          inviteToken: inviteFromUrl || value("inviteToken").trim(),
          website: value("website"),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Could not create your account. Try again shortly.");
        setStatus("idle");
        return;
      }
      setStatus("success");
      router.push(payload.redirect ?? "/student");
      router.refresh();
    } catch {
      setError("Network error while creating your account. Try again shortly.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" data-testid="signup-form">
      <FormField label="Institution code" htmlFor="institutionCode">
        <Input
          id="institutionCode"
          name="institutionCode"
          required
          maxLength={24}
          placeholder="SIT"
          autoComplete="organization"
          className="uppercase"
        />
      </FormField>

      <FormField label="Full name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          placeholder="Ananya Sharma"
          autoComplete="name"
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="USN" htmlFor="usn">
          <Input
            id="usn"
            name="usn"
            required
            maxLength={24}
            placeholder="1SI22CS001"
            autoComplete="off"
            className="uppercase"
          />
        </FormField>
        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            maxLength={254}
            placeholder="ananya@student.edu"
            autoComplete="email"
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirmPassword">
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
          />
        </FormField>
      </div>

      <FormField label="Invite token" htmlFor="inviteToken">
        <Input
          id="inviteToken"
          name="inviteToken"
          required={inviteFromUrl.length === 0}
          maxLength={128}
          placeholder="Paste the token from your invite link"
          autoComplete="off"
          className="font-mono"
          defaultValue={inviteFromUrl}
        />
      </FormField>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Signups need an invite from your institution. Paste the token at the end of your invite link
        (<code>/invite/…</code>), or ask your admin office for one.
      </p>

      {/* Honeypot — hidden from humans, irresistible to bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Use at least 10 characters mixing letters and numbers. You can register a passkey later for
        faster, phishing-resistant sign-in.
      </p>

      {error !== null && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={status === "submitting"}>
        {status === "submitting" ? <Loader2 className="size-4 animate-spin" /> : null}
        Create account
        {status !== "submitting" ? <ArrowRight className="size-4" /> : null}
      </Button>

      <p className="text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link href="/login" className="hover:text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
