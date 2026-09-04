import { api } from "../../../../../convex/_generated/api";
import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { LockedEmptyState } from "@/components/shell/locked-empty-state";
import { PageHeader } from "@/components/shell/page-header";
import {
  DEFAULT_ATTENDANCE_THRESHOLD_PERCENT,
  summarizeAttendance,
} from "@/lib/attendance/projection";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import { loadMissingEnrollmentSteps } from "@/lib/enrollment/load";

import { HistoryViews, type HistoryViewRecord, type SubjectAttendance } from "./history-views";

export const dynamic = "force-dynamic";

type StudentHistoryRow = {
  dateKey: string;
  sectionId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  state: "verified" | "flagged" | "pending" | "rejected" | "corrected";
  decidedAt: number;
  reasonCodes: string[];
};

type HistoryLoadResult = { kind: "error" } | { kind: "rows"; rows: StudentHistoryRow[] };

/** The page guarantees a session before calling; only backend failures land here. */
async function loadStudentHistory(): Promise<HistoryLoadResult> {
  try {
    const activeSession = await getActiveSession();
    if (activeSession === null) return { kind: "error" };
    const actorToken = await mintActorToken({
      userId: activeSession.userId,
      role: activeSession.role,
      ...(activeSession.sid !== undefined ? { sid: activeSession.sid } : {}),
    });
    const rows = await getConvexClient().query(api.history.studentHistory, { actorToken });
    return { kind: "rows", rows };
  } catch (cause) {
    console.error("[student-history] history query failed", cause);
    return { kind: "error" };
  }
}

export default async function StudentHistoryPage() {
  // Authentication first: the enrollment gate reads as fully-locked when
  // signed out, which would mask the sign-in state with enrollment steps.
  const session = await getActiveSession();

  if (session === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Student panel"
          title="Attendance history"
          description="Calendar and subject-wise views."
        />
        <EmptyState
          icon={BookOpen}
          title="Sign in required"
          description="Sign in to view your attendance calendar and subject breakdown."
        />
      </div>
    );
  }

  const missingSteps = await loadMissingEnrollmentSteps();

  if (missingSteps.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Student panel"
          title="Attendance history"
          description="Calendar and subject-wise views."
        />
        <LockedEmptyState missingSteps={missingSteps} />
      </div>
    );
  }

  const history = await loadStudentHistory();

  if (history.kind !== "rows") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Student panel"
          title="Attendance history"
          description="Calendar and subject-wise views."
        />
        <EmptyState
          icon={BookOpen}
          title="Could not load your history"
          description="Something went wrong while loading your attendance. Please refresh the page and try again."
        />
      </div>
    );
  }

  const rows = history.rows;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Student panel"
          title="Attendance history"
          description="Calendar and subject-wise views."
        />
        <EmptyState
          icon={BookOpen}
          title="No attendance yet"
          description="Once you check in to your first class, your calendar and subject breakdown appear here."
        />
      </div>
    );
  }

  const overall = summarizeAttendance(rows);
  const thresholdPercent = DEFAULT_ATTENDANCE_THRESHOLD_PERCENT;

  const grouped = new Map<string, StudentHistoryRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.sectionId);
    if (existing === undefined) grouped.set(row.sectionId, [row]);
    else existing.push(row);
  }

  const subjects: SubjectAttendance[] = [...grouped.entries()]
    .map(([sectionId, sectionRows]) => ({
      sectionId,
      courseId: sectionRows[0].courseId,
      courseCode: sectionRows[0].courseCode,
      courseTitle: sectionRows[0].courseTitle,
      summary: summarizeAttendance(sectionRows),
    }))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));

  const calendarRecords: HistoryViewRecord[] = rows.map((row) => ({
    dateKey: row.dateKey,
    courseCode: row.courseCode,
    state: row.state,
  }));

  const projectionSentence =
    overall.percentage >= thresholdPercent
      ? `You can miss up to ${overall.canMiss} ${overall.canMiss === 1 ? "class" : "classes"}.`
      : `Attend the next ${overall.mustAttend} ${overall.mustAttend === 1 ? "class" : "classes"} to stay above ${thresholdPercent}%.`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Student panel"
        title="Attendance history"
        description="Calendar and subject-wise views."
      />
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-xl border p-6">
        <div>
          <p className="text-5xl font-semibold tracking-tight tabular-nums">
            {overall.percentage}%
          </p>
          <p className="text-muted-foreground text-sm">
            verified across {overall.totalHeld} counted classes · {thresholdPercent}% required
          </p>
        </div>
        <p className="max-w-sm text-sm font-medium">{projectionSentence}</p>
      </section>
      <HistoryViews
        records={calendarRecords}
        subjects={subjects}
        thresholdPercent={thresholdPercent}
      />
    </div>
  );
}
