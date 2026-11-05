/** Placeholder shaped like a PageHeader plus content; the default export of each role's loading.tsx. */
export function PageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
    >
      <span className="sr-only">Loading…</span>
      <div className="border-border/70 flex flex-col gap-3 border-b pb-6" aria-hidden>
        <div className="bg-muted h-3 w-24 rounded" />
        <div className="bg-muted h-9 w-64 max-w-full rounded" />
        <div className="bg-muted h-4 w-96 max-w-full rounded" />
      </div>
      <div className="bg-muted/60 h-40 rounded-xl" aria-hidden />
      <div className="bg-muted/60 h-24 rounded-xl" aria-hidden />
    </div>
  );
}
