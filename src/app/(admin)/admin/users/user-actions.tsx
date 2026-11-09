"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ROLES, type Role } from "@/lib/auth/session";
import { statusChangeRefusal, type AccountStatus } from "@/lib/users/status-change";

type UserActionsProps = {
  userId: string;
  name: string;
  role: Role;
  status: AccountStatus | undefined;
  isSelf: boolean;
};

type Change = { status: "active" | "suspended" } | { role: Role } | { remove: true };

function describe(change: Change, name: string): string {
  if ("remove" in change) return `Remove ${name} and revoke their invite?`;
  if ("role" in change) return `Make ${name} ${change.role.replace("_", " ")} and sign them out?`;
  return change.status === "suspended"
    ? `Suspend ${name} and sign them out?`
    : `Reactivate ${name}?`;
}

/**
 * Per-row role and status controls for the Users directory. Every change is
 * two-step: pick it, then confirm. Your own row offers neither. People who
 * never activated can be removed outright; the server refuses if they have
 * any history.
 */
export function UserActions({ userId, name, role, status, isSelf }: UserActionsProps) {
  const router = useRouter();
  const [change, setChange] = useState<Change | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isSelf) return <span className="text-muted-foreground text-xs">you</span>;

  async function confirm() {
    if (change === null) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "remove" in change ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("remove" in change ? { userId } : { userId, ...change }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Update failed");
      setChange(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  if (change !== null) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs">{describe(change, name)}</span>
        <Button
          variant={
            "remove" in change || ("status" in change && change.status === "suspended")
              ? "destructive"
              : "default"
          }
          size="xs"
          disabled={pending}
          onClick={confirm}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Confirm
        </Button>
        <Button variant="ghost" size="xs" disabled={pending} onClick={() => setChange(null)}>
          Cancel
        </Button>
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <select
        aria-label={`Role for ${name}`}
        value={role}
        onChange={(event) => setChange({ role: event.target.value as Role })}
        className="border-input h-7 rounded-md border bg-transparent px-2 text-xs"
      >
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {option.replace("_", " ")}
          </option>
        ))}
      </select>
      {statusChangeRefusal(status, "suspended", isSelf) === null ? (
        <Button variant="outline" size="xs" onClick={() => setChange({ status: "suspended" })}>
          Suspend
        </Button>
      ) : null}
      {statusChangeRefusal(status, "active", isSelf) === null ? (
        <Button variant="outline" size="xs" onClick={() => setChange({ status: "active" })}>
          Reactivate
        </Button>
      ) : null}
      {status === "invited" ? (
        <Button variant="outline" size="xs" onClick={() => setChange({ remove: true })}>
          Remove
        </Button>
      ) : null}
    </span>
  );
}
