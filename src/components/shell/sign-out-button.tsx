"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type SignOutButtonProps = {
  devLoginEnabled: boolean;
};

export function SignOutButton({ devLoginEnabled }: SignOutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!devLoginEnabled) return null;

  async function handleSignOut() {
    setPending(true);
    try {
      await fetch("/api/dev-session", { method: "DELETE" });
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={pending}>
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
