import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        The page you are looking for does not exist or has moved.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
