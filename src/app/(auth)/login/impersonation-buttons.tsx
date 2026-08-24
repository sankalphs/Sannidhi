"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ROLES, ROLE_TO_HOME, type Role } from "@/lib/auth/session";

type ImpersonationButtonsProps = {
  enabled: boolean;
};

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  faculty: "Faculty",
  department_authority: "Department authority",
  admin: "Admin",
  auditor: "Auditor",
};

export function ImpersonationButtons({ enabled }: ImpersonationButtonsProps) {
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function impersonate(role: Role) {
    setPendingRole(role);
    setError(null);
    try {
      const response = await fetch("/api/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        setError(`Could not start the ${ROLE_LABELS[role]} session (error ${response.status}).`);
        return;
      }
      router.push(ROLE_TO_HOME[role]);
      router.refresh();
    } catch {
      setError("Network error while starting the session. Try again.");
    } finally {
      setPendingRole(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {ROLES.map((role) => (
          <Button
            key={role}
            variant="outline"
            onClick={() => void impersonate(role)}
            disabled={pendingRole !== null}
          >
            {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>
      {error !== null && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
