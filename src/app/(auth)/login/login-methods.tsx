"use client";

import { Fingerprint, KeyRound } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { PasswordLoginForm } from "@/app/(auth)/login/password-login-form";
import { PasskeyLoginButton } from "@/app/(auth)/login/passkey-login-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoginMethod = "passkey" | "password";

const METHOD_TABS: Array<{ id: LoginMethod; label: string; icon: typeof Fingerprint }> = [
  { id: "passkey", label: "Passkey", icon: Fingerprint },
  { id: "password", label: "USN / Email", icon: KeyRound },
];

/**
 * Both panels stay mounted so each tab's aria-controls resolves and in-progress
 * input survives switching; the hidden panel is skipped by tab and screen readers.
 * No tabIndex: panels contain focusable content, so they stay out of the tab order.
 */
function TabPanel({
  method,
  active,
  children,
}: {
  method: LoginMethod;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`login-panel-${method}`}
      aria-labelledby={`login-tab-${method}`}
      className={cn(
        "focus-visible:ring-ring/50 flex-col gap-4 rounded-md outline-none focus-visible:ring-[3px]",
        active ? "flex" : "hidden",
      )}
    >
      {children}
    </div>
  );
}

export function LoginMethods() {
  const [method, setMethod] = useState<LoginMethod>("passkey");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTab = (index: number) => {
    const tab = METHOD_TABS[index];
    if (!tab) return;
    setMethod(tab.id);
    tabRefs.current[index]?.focus();
  };

  const onTablistKeyDown = (event: React.KeyboardEvent) => {
    const currentIndex = METHOD_TABS.findIndex((tab) => tab.id === method);
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectTab((currentIndex + 1) % METHOD_TABS.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectTab((currentIndex - 1 + METHOD_TABS.length) % METHOD_TABS.length);
        break;
      case "Home":
        event.preventDefault();
        selectTab(0);
        break;
      case "End":
        event.preventDefault();
        selectTab(METHOD_TABS.length - 1);
        break;
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="login-methods">
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="border-border bg-card grid grid-cols-2 gap-1 rounded-lg border p-1"
      >
        {METHOD_TABS.map((tab, index) => {
          const active = method === tab.id;
          return (
            <Button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`login-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`login-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              variant={active ? "default" : "ghost"}
              size="sm"
              onClick={() => setMethod(tab.id)}
              onKeyDown={onTablistKeyDown}
              className={cn("font-mono text-xs tracking-[0.08em] uppercase")}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      <TabPanel method="passkey" active={method === "passkey"}>
        <PasskeyLoginButton />
        <p className="text-muted-foreground text-sm">
          Use the passkey registered to your Sannidhi account — no passwords, no shared secrets.
        </p>
      </TabPanel>
      <TabPanel method="password" active={method === "password"}>
        <PasswordLoginForm />
      </TabPanel>
    </div>
  );
}
