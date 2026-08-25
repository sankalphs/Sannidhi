"use client";

import { Fingerprint, KeyRound } from "lucide-react";
import { useState } from "react";

import { PasswordLoginForm } from "@/app/(auth)/login/password-login-form";
import { PasskeyLoginButton } from "@/app/(auth)/login/passkey-login-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoginMethod = "passkey" | "password";

const METHOD_TABS: Array<{ id: LoginMethod; label: string; icon: typeof Fingerprint }> = [
  { id: "passkey", label: "Passkey", icon: Fingerprint },
  { id: "password", label: "USN / Email", icon: KeyRound },
];

export function LoginMethods() {
  const [method, setMethod] = useState<LoginMethod>("passkey");

  return (
    <div className="flex flex-col gap-4" data-testid="login-methods">
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="border-border bg-card grid grid-cols-2 gap-1 rounded-lg border p-1"
      >
        {METHOD_TABS.map((tab) => {
          const active = method === tab.id;
          return (
            <Button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              variant={active ? "default" : "ghost"}
              size="sm"
              onClick={() => setMethod(tab.id)}
              className={cn("font-mono text-xs tracking-[0.08em] uppercase")}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {method === "passkey" ? (
        <>
          <PasskeyLoginButton />
          <p className="text-muted-foreground text-sm">
            Use the passkey registered to your Sannidhi account — no passwords, no shared secrets.
          </p>
        </>
      ) : (
        <PasswordLoginForm />
      )}
    </div>
  );
}
