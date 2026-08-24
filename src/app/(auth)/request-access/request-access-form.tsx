"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  { value: "administrator", label: "Administrator / registrar" },
  { value: "faculty", label: "Faculty member" },
  { value: "department_authority", label: "Department authority" },
  { value: "other", label: "Other" },
] as const;

const inputClass =
  "focus-visible:ring-ring border-input bg-card h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50";

const labelClass = "text-sm font-medium";

type Status = "idle" | "submitting" | "success";

export function RequestAccessForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("submitting");
    setError(null);
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution: data.get("institution"),
          name: data.get("name"),
          email: data.get("email"),
          requestedRole: data.get("requestedRole"),
          note: data.get("note"),
          website: data.get("website"),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not submit the request. Try again shortly.");
        setStatus("idle");
        return;
      }
      setStatus("success");
      router.refresh();
    } catch {
      setError("Network error while submitting. Try again shortly.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-4 rounded-xl border p-8 text-center">
        <span className="border-verdict-accept text-verdict-accept bg-verdict-accept/10 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium tracking-[0.12em] uppercase">
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          Request received
        </span>
        <h2 className="font-display text-2xl tracking-tight">Thank you — we have it in writing.</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your institution is in the review queue. If it looks like a fit, we will email you an
          administrator invite with setup steps for departments, courses, and policies.
        </p>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" data-testid="request-access-form">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="institution" className={labelClass}>
          Institution name
        </label>
        <Input
          id="institution"
          name="institution"
          required
          minLength={2}
          maxLength={200}
          placeholder="Siddaganga Institute of Technology"
          autoComplete="organization"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={labelClass}>
            Your name
          </label>
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="Priya Menon"
            autoComplete="name"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className={labelClass}>
            Work email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            maxLength={254}
            placeholder="priya@sit.edu.in"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="requestedRole" className={labelClass}>
          You are a
        </label>
        <select
          id="requestedRole"
          name="requestedRole"
          required
          defaultValue="administrator"
          className={cn(inputClass, "appearance-none")}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className={labelClass}>
          Anything we should know?{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={1000}
          placeholder="Roughly 4,000 students across 12 departments, currently on paper attendance…"
          className={cn(inputClass, "h-auto resize-y py-2.5")}
        />
      </div>

      {/* Honeypot — hidden from humans, irresistible to bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error !== null && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={status === "submitting"}>
        {status === "submitting" ? <Loader2 className="size-4 animate-spin" /> : null}
        Submit request
        {status !== "submitting" ? <ArrowRight className="size-4" /> : null}
      </Button>
      <p className="text-muted-foreground text-xs leading-relaxed">
        We only use these details to evaluate your institution for onboarding. No account is created
        and nothing is shared.
      </p>
    </form>
  );
}
