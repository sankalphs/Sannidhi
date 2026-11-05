import { TriangleAlert } from "lucide-react";

import { isDevLoginEnabled } from "@/lib/auth/dev-login";

/**
 * Rendered only where development sign-in is reachable (local, e2e,
 * previews): role switching bypasses real authentication, so every surface
 * announces it.
 */
export function DevLoginBanner() {
  if (!isDevLoginEnabled()) return null;

  return (
    <div
      role="note"
      data-testid="dev-login-banner"
      className="bg-chalk text-chalk-foreground px-4 py-2 text-center font-mono text-xs font-medium tracking-[0.08em] uppercase"
    >
      <TriangleAlert className="mr-1.5 inline size-3.5" aria-hidden="true" />
      Development sign-in enabled — not a production deployment
    </div>
  );
}
