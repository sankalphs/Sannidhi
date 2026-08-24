"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { ROLE_TO_HOME, type Role } from "@/lib/auth/session";

type PersonaPickerProps = {
  highlightRole?: Role | null;
};

const PERSONAS: { role: Role; label: string; description: string }[] = [
  { role: "student", label: "Student", description: "Check in, history, devices" },
  { role: "faculty", label: "Faculty", description: "Sessions and live board" },
  { role: "department_authority", label: "Dept authority", description: "Courses and policies" },
  { role: "admin", label: "Admin", description: "People, devices, invites" },
  { role: "auditor", label: "Auditor", description: "Read-only ledger" },
];

export function PersonaPicker({ highlightRole }: PersonaPickerProps) {
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enterAs(role: Role) {
    setPendingRole(role);
    setError(null);
    try {
      const response = await fetch("/api/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        setError(`Could not start the ${role} session (error ${response.status}).`);
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
    <div className="flex flex-col gap-3" data-testid="persona-picker">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PERSONAS.map((persona) => {
          const highlighted = highlightRole === persona.role;
          return (
            <button
              key={persona.role}
              type="button"
              data-testid={`persona-${persona.role}`}
              disabled={pendingRole !== null}
              onClick={() => void enterAs(persona.role)}
              className={cn(
                "hover:bg-accent focus-visible:ring-ring flex flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none disabled:cursor-wait disabled:opacity-60",
                highlighted
                  ? "border-primary bg-primary/5 ring-primary/40 ring-2"
                  : "border-border",
              )}
            >
              <span className="text-sm font-medium">{persona.label}</span>
              <span className="text-muted-foreground text-xs">{persona.description}</span>
            </button>
          );
        })}
      </div>
      {error !== null && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
