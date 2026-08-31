"use client";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { describeConvexError, type ErrorTranslation } from "@/lib/client/describe-error";

const MIN_REASON_LENGTH = 10;

const textareaClasses =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-24 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const ERROR_TRANSLATIONS: ErrorTranslation = [
  { match: "reason_too_short", message: "The reason must be at least 10 characters." },
  {
    match: "student_not_enrolled",
    message: "This student is not enrolled in this session's section.",
  },
  {
    match: "unauthorized",
    message: "You are not authorized to verify attendance for this session.",
  },
  { match: "session_not_active", message: "This session is no longer active." },
];

function describeError(cause: unknown): string {
  return describeConvexError(cause, ERROR_TRANSLATIONS, "Something went wrong. Please try again.");
}

export function ManualVerifyDialog({
  actorToken,
  sessionId,
  student,
  mode = "verify",
  onClose,
}: {
  actorToken: string;
  sessionId: Id<"class_sessions">;
  student: { id: Id<"users">; name: string };
  /** "override" when the row already carries a verdict the faculty is replacing. */
  mode?: "verify" | "override";
  onClose: () => void;
}) {
  const heading = mode === "override" ? "Override verdict" : "Verify manually";
  const submitLabel = mode === "override" ? "Override verdict" : "Verify";
  const verifyManually = useMutation(api.classSessions.verifyManually);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
    reasonRef.current?.focus();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (pending || trimmed.length < MIN_REASON_LENGTH) return;
    setPending(true);
    setError(null);
    try {
      await verifyManually({ actorToken, sessionId, studentId: student.id, reason: trimmed });
      onClose();
    } catch (cause) {
      setError(describeError(cause));
      setPending(false);
    }
  }

  function requestClose() {
    if (!pending) onClose();
  }

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    if (pending) event.preventDefault();
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === "override"
          ? `Override ${student.name}'s verdict`
          : `Verify ${student.name} manually`
      }
      onClose={requestClose}
      onCancel={handleCancel}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
      className="bg-background relative m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border p-6 shadow-lg backdrop:bg-black/60"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        className="absolute top-3 right-3"
        onClick={requestClose}
      >
        <X />
      </Button>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{heading}</h2>
        <p className="text-muted-foreground text-sm">
          Record faculty-attested attendance for <span className="font-medium">{student.name}</span>{" "}
          with a mandatory auditable reason.
        </p>
      </div>
      <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="manual-verify-reason-input" className="text-sm font-medium">
            Reason (required, min 10 characters)
          </label>
          <textarea
            id="manual-verify-reason-input"
            ref={reasonRef}
            data-testid="manual-verify-reason"
            className={textareaClasses}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
            rows={3}
          />
        </div>
        {error !== null ? (
          <p className="text-destructive text-sm" data-testid="manual-verify-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="manual-verify-submit"
            disabled={pending || reason.trim().length < MIN_REASON_LENGTH}
          >
            <ShieldCheck />
            {submitLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
