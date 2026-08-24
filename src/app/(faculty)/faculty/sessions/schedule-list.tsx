"use client";

import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { GuestSessionDialog } from "./guest-session-dialog";

export type ScheduleRow = FunctionReturnType<typeof api.classSessions.listMySchedule>[number];

function describeError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (typeof data === "string") {
      if (data === "session_already_active") {
        return "A session is already running for this section.";
      }
      if (data === "unauthorized") {
        return "You are not authorized to start this session.";
      }
      return data;
    }
  }
  return "Something went wrong. Please try again.";
}

function formatMinutes(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function StatusBadge({ status }: { status: "active" | "paused" | "closed" | null }) {
  if (status === null) return null;
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>;
  return <Badge variant="outline">Closed</Badge>;
}

function ScheduleCard({
  row,
  starting,
  disabled,
  error,
  onStart,
}: {
  row: ScheduleRow;
  starting: boolean;
  disabled: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const resumable = row.sessionId !== null && row.sessionStatus !== null;
  return (
    <li className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <div className="text-sm font-medium tabular-nums">
          {formatMinutes(row.startMinutes)}
          <span className="text-muted-foreground"> – {formatMinutes(row.endMinutes)}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {row.courseCode} · {row.courseTitle}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {row.sectionName} · {row.venueName}
          </p>
          {error !== null ? <p className="text-destructive mt-1 text-xs">{error}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="secondary">{row.enrolledCount} enrolled</Badge>
        {resumable ? (
          <>
            <StatusBadge status={row.sessionStatus} />
            <Button asChild size="sm" variant="outline">
              <Link href={`/faculty/sessions/${row.sessionId}`}>Resume</Link>
            </Button>
          </>
        ) : row.slotId !== null ? (
          <Button size="sm" data-testid="start-slot" onClick={onStart} disabled={disabled}>
            <Play />
            {starting ? "Starting…" : "Start class"}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ScheduleList({
  actorToken,
  initialRows,
}: {
  actorToken: string;
  initialRows: ScheduleRow[];
}) {
  const router = useRouter();
  const startFromSlot = useMutation(api.classSessions.startFromSlot);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [errorsBySlot, setErrorsBySlot] = useState<Record<string, string>>({});
  const today = new Date().getDay();

  const todaysRows = initialRows.filter((row) => row.dayOfWeek === today);
  const otherRows = initialRows
    .filter((row) => row.dayOfWeek !== today)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes);

  async function handleStart(row: ScheduleRow) {
    const slotId = row.slotId;
    if (slotId === null || pendingSlotId !== null) return;
    setPendingSlotId(slotId);
    setErrorsBySlot((prev) => {
      if (!(slotId in prev)) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    try {
      const result = await startFromSlot({ actorToken, slotId });
      router.push(`/faculty/sessions/${result.sessionId}`);
    } catch (cause) {
      setErrorsBySlot((prev) => ({ ...prev, [slotId]: describeError(cause) }));
    } finally {
      setPendingSlotId(null);
    }
  }

  function renderCards(rows: ScheduleRow[]) {
    return (
      <ol className="flex flex-col gap-3">
        {rows.map((row) => (
          <ScheduleCard
            key={row.slotId ?? `guest-${row.sectionId}`}
            row={row}
            starting={row.slotId !== null && pendingSlotId === row.slotId}
            disabled={pendingSlotId !== null}
            error={row.slotId !== null ? (errorsBySlot[row.slotId] ?? null) : null}
            onStart={() => void handleStart(row)}
          />
        ))}
      </ol>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Today&apos;s schedule</h2>
          <GuestSessionDialog actorToken={actorToken} />
        </div>
        {todaysRows.length === 0 ? (
          <EmptyState
            title="No classes scheduled today"
            description="Nothing on your timetable for today. You can still run a guest session."
          />
        ) : (
          renderCards(todaysRows)
        )}
      </section>
      {otherRows.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Other days</h2>
          {renderCards(otherRows)}
        </section>
      ) : null}
    </div>
  );
}
