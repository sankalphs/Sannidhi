import Link from "next/link";

import { cn } from "@/lib/utils";

export function Seal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-7", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" stroke="currentColor" strokeWidth="3" />
      <path
        d="M9.5 16.5L14 21L22.5 11.5"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className, href = "/" }: { className?: string; href?: string | null }) {
  const content = (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Seal />
      <span className="font-display text-xl leading-none tracking-tight">Sannidhi</span>
    </span>
  );
  if (href === null) return content;
  return (
    <Link href={href} className="focus-visible:ring-ring rounded-md focus-visible:outline-none">
      {content}
    </Link>
  );
}
