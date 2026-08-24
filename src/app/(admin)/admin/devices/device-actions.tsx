"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type AdminAction = "suspend" | "revoke" | "activate";

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
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

export function DeviceActionButton({
  action,
  deviceId,
}: {
  action: AdminAction;
  deviceId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      await postJson("/api/admin/devices", { action, deviceId });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Button
        variant={action === "revoke" ? "destructive" : "outline"}
        size="xs"
        disabled={pending}
        onClick={run}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {action === "activate" ? "Reactivate" : action}
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}

export function ReplacementDecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setPending(decision);
    setError(null);
    try {
      await postJson("/api/admin/devices/replacement", { requestId, decision });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Button size="xs" disabled={pending !== null} onClick={() => decide("approve")}>
        {pending === "approve" ? <Loader2 className="animate-spin" /> : null}
        Approve
      </Button>
      <Button
        variant="outline"
        size="xs"
        disabled={pending !== null}
        onClick={() => decide("reject")}
      >
        {pending === "reject" ? <Loader2 className="animate-spin" /> : null}
        Reject
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}
