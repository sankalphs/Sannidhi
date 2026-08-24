"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceRecordState, AttendanceSummary } from "@/lib/attendance/projection";
import { cn } from "@/lib/utils";

export type HistoryViewRecord = {
  dateKey: string;
  courseCode: string;
  state: AttendanceRecordState;
};

export type SubjectAttendance = {
  sectionId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  summary: AttendanceSummary;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const STATE_CHIP_CLASSES: Record<AttendanceRecordState, string> = {
  verified: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  flagged: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  pending: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-400",
  rejected: "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-400",
  corrected: "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

const STATE_LEGEND_LABELS: Record<AttendanceRecordState, string> = {
  verified: "Verified",
  flagged: "Flagged",
  pending: "Pending",
  rejected: "Rejected",
  corrected: "Corrected",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function localTodayKey(): string {
  const today = new Date();
  return toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
}

function projectionSentence(summary: AttendanceSummary, thresholdPercent: number): string {
  if (summary.totalHeld === 0) return "No counted classes yet.";
  if (summary.percentage >= thresholdPercent) {
    return `You can miss up to ${summary.canMiss} ${summary.canMiss === 1 ? "class" : "classes"}.`;
  }
  return `Attend the next ${summary.mustAttend} ${summary.mustAttend === 1 ? "class" : "classes"} to stay above ${thresholdPercent}%.`;
}

function MonthCalendar({ records }: { records: HistoryViewRecord[] }) {
  const [view, setView] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), monthIndex: today.getMonth() };
  });

  const byDateKey = useMemo(() => {
    const map = new Map<string, HistoryViewRecord[]>();
    for (const record of records) {
      const existing = map.get(record.dateKey);
      if (existing === undefined) map.set(record.dateKey, [record]);
      else existing.push(record);
    }
    return map;
  }, [records]);

  const daysInMonth = new Date(view.year, view.monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(view.year, view.monthIndex, 1).getDay();
  const leadingDays = firstWeekday;
  const trailingDays = (7 - ((leadingDays + daysInMonth) % 7)) % 7;
  const totalCells = leadingDays + daysInMonth + trailingDays;
  const firstCellDate = new Date(view.year, view.monthIndex, 1 - leadingDays);
  const todayKey = localTodayKey();

  const cells: Array<{ dateKey: string; inMonth: boolean }> = [];
  for (let index = 0; index < totalCells; index += 1) {
    const current = new Date(
      firstCellDate.getFullYear(),
      firstCellDate.getMonth(),
      firstCellDate.getDate() + index,
    );
    cells.push({
      dateKey: toDateKey(current.getFullYear(), current.getMonth(), current.getDate()),
      inMonth: current.getMonth() === view.monthIndex && current.getFullYear() === view.year,
    });
  }

  function shiftMonth(delta: number) {
    setView((previous) => {
      const next = new Date(previous.year, previous.monthIndex + delta, 1);
      return { year: next.getFullYear(), monthIndex: next.getMonth() };
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {MONTH_NAMES[view.monthIndex]} {view.year}
        </h2>
        <div className="flex gap-1">
          <Button
            aria-label="Previous month"
            variant="outline"
            size="icon-sm"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Next month"
            variant="outline"
            size="icon-sm"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-muted-foreground py-1 font-medium tracking-wide uppercase"
          >
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const dayRecords = byDateKey.get(cell.dateKey) ?? [];
          return (
            <div
              key={cell.dateKey}
              data-testid={`calendar-day-${cell.dateKey}`}
              className={cn(
                "flex min-h-16 flex-col items-stretch gap-1 rounded-md border p-1 text-left",
                !cell.inMonth && "bg-muted/40 opacity-50",
                cell.dateKey === todayKey && "ring-primary ring-2",
              )}
            >
              <span className={cn("text-xs font-medium", !cell.inMonth && "text-muted-foreground")}>
                {Number(cell.dateKey.slice(-2))}
              </span>
              {dayRecords.slice(0, 3).map((record, index) => (
                <span
                  key={`${record.courseCode}-${record.state}-${index}`}
                  title={`${record.courseCode} · ${STATE_LEGEND_LABELS[record.state]}`}
                  className={cn(
                    "truncate rounded border px-1 text-[10px] leading-4 font-medium",
                    STATE_CHIP_CLASSES[record.state],
                  )}
                >
                  {record.courseCode}
                </span>
              ))}
              {dayRecords.length > 3 ? (
                <span className="text-muted-foreground text-[10px]">
                  +{dayRecords.length - 3} more
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(STATE_CHIP_CLASSES) as AttendanceRecordState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5 text-xs">
            <span className={cn("size-2.5 rounded-full border", STATE_CHIP_CLASSES[state])} />
            <span className="text-muted-foreground">{STATE_LEGEND_LABELS[state]}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function HistoryViews({
  records,
  subjects,
  thresholdPercent,
}: {
  records: HistoryViewRecord[];
  subjects: SubjectAttendance[];
  thresholdPercent: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <MonthCalendar records={records} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Subject-wise attendance</h2>
        {subjects.length === 0 ? (
          <p className="text-muted-foreground text-sm">No subject records yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {subjects.map((subject) => {
              const meetsThreshold = subject.summary.percentage >= thresholdPercent;
              return (
                <Card
                  key={subject.sectionId}
                  className="gap-4 py-4"
                  data-testid={`subject-card-${subject.sectionId}`}
                >
                  <CardHeader>
                    <CardTitle>{subject.courseCode}</CardTitle>
                    <CardDescription>{subject.courseTitle}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="bg-muted relative h-2 w-full rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          meetsThreshold ? "bg-emerald-500" : "bg-destructive",
                        )}
                        style={{ width: `${Math.min(100, subject.summary.percentage)}%` }}
                      />
                      <div
                        aria-hidden
                        className="bg-foreground/70 absolute top-[-3px] h-[14px] w-[2px] rounded"
                        style={{ left: `calc(${thresholdPercent}% - 1px)` }}
                      />
                    </div>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {subject.summary.verifiedCount}/{subject.summary.totalHeld} verified (
                      {subject.summary.percentage}%) · {subject.summary.flaggedCount} flagged ·{" "}
                      {subject.summary.pendingCount} pending
                    </p>
                    <p className={cn("text-xs font-medium", meetsThreshold || "text-destructive")}>
                      {projectionSentence(subject.summary, thresholdPercent)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
