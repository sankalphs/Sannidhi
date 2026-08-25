import type { ReactNode } from "react";

export function FormField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {hint !== undefined ? (
          <span className="text-muted-foreground font-normal"> {hint}</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
