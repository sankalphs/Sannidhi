"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type RevokeButtonProps = {
  inviteId: string;
};

/** Revokes a pending invite after a second, explicit confirmation click. */
export function RevokeButton({ inviteId }: RevokeButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Revoke failed");
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revoke failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {confirming ? (
        <>
          <Button variant="destructive" size="xs" disabled={pending} onClick={revoke}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Confirm revoke
          </Button>
          <Button variant="ghost" size="xs" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="outline" size="xs" onClick={() => setConfirming(true)}>
          Revoke
        </Button>
      )}
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}
