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

  if (!enabled) return null;

  async function impersonate(role: Role) {
    setPendingRole(role);
    const response = await fetch("/api/dev-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      setPendingRole(null);
      return;
    }
    router.push(ROLE_TO_HOME[role]);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ROLES.map((role) => (
        <Button
          key={role}
          variant="outline"
          onClick={() => impersonate(role)}
          disabled={pendingRole !== null}
        >
          {ROLE_LABELS[role]}
        </Button>
      ))}
    </div>
  );
}
