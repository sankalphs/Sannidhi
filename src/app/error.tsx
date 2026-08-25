"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="bg-destructive/15 text-destructive flex size-14 items-center justify-center rounded-full">
        <TriangleAlert className="size-8" />
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        This surface failed to load. Your data is safe — the event ledger records everything. Try
        again, or head back to the home page.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
      {error.digest !== undefined ? (
        <p className="text-muted-foreground font-mono text-xs">Digest: {error.digest}</p>
      ) : null}
    </div>
  );
}
