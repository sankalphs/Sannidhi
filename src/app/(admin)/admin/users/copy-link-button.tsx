"use client";

import { Check, Link2, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type CopyLinkButtonProps = {
  email: string;
  appUrl: string;
};

/**
 * Issues a fresh activation link for someone who has not activated yet (the
 * previous link stops working) and copies it. Sannidhi sends no email, so
 * this is how an admin hands a link over.
 */
export function CopyLinkButton({ email, appUrl }: CopyLinkButtonProps) {
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        invite?: { token: string };
        error?: string;
      };
      if (!response.ok || !data.invite) throw new Error(data.error ?? "Could not issue a link");
      const url = `${appUrl}/invite/${data.invite.token}`;
      setLink(url);
      await navigator.clipboard
        .writeText(url)
        .then(() => setCopied(true))
        .catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue a link");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {link !== null ? (
        <input
          readOnly
          value={link}
          aria-label={`Activation link for ${email}`}
          onFocus={(event) => event.currentTarget.select()}
          className="border-input w-48 rounded-md border bg-transparent px-2 py-1 font-mono text-xs"
        />
      ) : null}
      <Button variant="outline" size="xs" disabled={pending} onClick={issue}>
        {pending ? <Loader2 className="animate-spin" /> : copied ? <Check /> : <Link2 />}
        {copied ? "Copied" : "Copy new link"}
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}
