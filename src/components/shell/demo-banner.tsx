import { TriangleAlert } from "lucide-react";

/**
 * Rendered only when the deployment explicitly opts into public demo mode
 * (ENABLE_DEMO_LOGIN=1): visitors get seeded personas carrying full role
 * authority, so every surface announces it.
 */
export function DemoBanner() {
  if (process.env.ENABLE_DEMO_LOGIN !== "1") return null;

  return (
    <div
      role="note"
      data-testid="demo-banner"
      className="bg-chalk text-chalk-foreground px-4 py-2 text-center font-mono text-xs font-medium tracking-[0.08em] uppercase"
    >
      <TriangleAlert className="mr-1.5 inline size-3.5" aria-hidden="true" />
      Demo mode — seeded accounts, not a real institution
    </div>
  );
}
