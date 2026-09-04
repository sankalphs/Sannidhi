"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clearQueue } from "@/lib/client/offline-queue";
import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  onBoard = false,
}: {
  className?: string;
  onBoard?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      // Signed offline records carry student names; leaving them behind on a
      // shared classroom device would leak them past this session.
      try {
        clearQueue();
      } catch {
        // Storage can be unavailable (private mode); sign-out must still finish.
      }
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={onBoard ? "ghost" : "ghost"}
      size="sm"
      className={cn(
        onBoard &&
          "text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground",
        className,
      )}
      onClick={handleSignOut}
      disabled={pending}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
