import { cn } from "@/lib/utils";

export type Verdict = "accept" | "step-up" | "flag" | "reject";

const VERDICT_STYLES: Record<Verdict, string> = {
  accept: "text-verdict-accept border-verdict-accept/35 bg-verdict-accept/10",
  "step-up": "text-verdict-stepup border-verdict-stepup/35 bg-verdict-stepup/10",
  flag: "text-verdict-flag border-verdict-flag/40 bg-verdict-flag/10",
  reject: "text-verdict-reject border-verdict-reject/35 bg-verdict-reject/10",
};

const VERDICT_LABELS: Record<Verdict, string> = {
  accept: "Accept",
  "step-up": "Step-up",
  flag: "Flag",
  reject: "Reject",
};

export function VerdictStamp({
  verdict,
  className,
  label,
}: {
  verdict: Verdict;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tracking-[0.08em] uppercase",
        VERDICT_STYLES[verdict],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label ?? VERDICT_LABELS[verdict]}
    </span>
  );
}
