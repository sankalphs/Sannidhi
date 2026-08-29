import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { LineChart, ShieldAlert, Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { formatReasonCode } from "@/lib/analytics/labels";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

export const dynamic = "force-dynamic";

type TrajectoryRow = FunctionReturnType<typeof api.analytics.attendanceTrajectories>[number];
type SectionTrendRow = FunctionReturnType<typeof api.analytics.sectionTrends>[number];
type AnomalyDashboard = FunctionReturnType<typeof api.analytics.anomalyDashboard>;

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function TrendCell({ trend }: { trend: TrajectoryRow["trend"] }) {
  if (trend === "improving") {
    return <span className="text-verdict-accept">Improving</span>;
  }
  if (trend === "declining") {
    return <span className="text-verdict-flag">Declining</span>;
  }
  return <span className="text-muted-foreground">Steady</span>;
}

function StatCard({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="bg-card rounded-xl border p-5">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="font-mono text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function TrajectoriesTable({ rows }: { rows: TrajectoryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
          <tr>
            <th className="px-4 py-2 font-medium">Student</th>
            <th className="px-4 py-2 font-medium">Held</th>
            <th className="px-4 py-2 font-medium">Present</th>
            <th className="px-4 py-2 font-medium">Attendance</th>
            <th className="px-4 py-2 font-medium">Trend</th>
            <th className="px-4 py-2 font-medium">Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.studentId} data-testid="trajectory-row">
              <td className="px-4 py-2">
                <div className="flex flex-col">
                  <span className="font-medium">{row.studentName}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {row.studentEmail}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.summary.totalHeld}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.summary.verifiedCount}</td>
              <td className="px-4 py-2">
                <div className="flex min-w-28 flex-col gap-1">
                  <span className="font-mono tabular-nums">{row.summary.percentage}%</span>
                  <div className="bg-muted h-1.5 w-full rounded" aria-hidden>
                    <div
                      className={
                        row.summary.percentage >= 75
                          ? "bg-verdict-accept h-1.5 rounded"
                          : "bg-verdict-flag h-1.5 rounded"
                      }
                      style={{ width: `${row.summary.percentage}%` }}
                    />
                  </div>
                </div>
              </td>
              <td className="px-4 py-2">
                <TrendCell trend={row.trend} />
              </td>
              <td className="px-4 py-2">
                {row.atRisk ? (
                  <span className="text-verdict-flag font-medium">At risk</span>
                ) : (
                  <span className="text-muted-foreground">On track</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionTrendsTable({ rows }: { rows: SectionTrendRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
          <tr>
            <th className="px-4 py-2 font-medium">Course</th>
            <th className="px-4 py-2 font-medium">Sessions</th>
            <th className="px-4 py-2 font-medium">Enrolled</th>
            <th className="px-4 py-2 font-medium">Verified</th>
            <th className="px-4 py-2 font-medium">Flagged</th>
            <th className="px-4 py-2 font-medium">Rejected</th>
            <th className="px-4 py-2 font-medium">Late arrivals</th>
            <th className="px-4 py-2 font-medium">Attendance rate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.sectionId} data-testid="section-trend-row">
              <td className="px-4 py-2">
                <div className="flex flex-col">
                  <span className="font-medium">{row.courseCode}</span>
                  <span className="text-muted-foreground text-xs">{row.courseTitle}</span>
                </div>
              </td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.sessionsHeld}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.enrolledCount}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.verifiedTotal}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.flaggedTotal}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.rejectedTotal}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{row.lateArrivals}</td>
              <td className="px-4 py-2">
                {row.attendanceRatePct === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    className={
                      row.attendanceRatePct < 75
                        ? "text-verdict-flag font-mono tabular-nums"
                        : "font-mono tabular-nums"
                    }
                  >
                    {row.attendanceRatePct}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomalyPanels({ dashboard }: { dashboard: AnomalyDashboard }) {
  const { proxyAttempts, verification } = dashboard;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Proxy attempts by student</h3>
        {proxyAttempts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No proxy-pattern flags in the window.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {proxyAttempts.map((attempt) => (
              <div
                key={attempt.studentId}
                data-testid="proxy-attempt-card"
                className="bg-card flex flex-col gap-2 rounded-xl border p-4"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{attempt.studentName}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {attempt.studentEmail}
                  </span>
                </div>
                <p className="text-sm">
                  {attempt.flaggedCount}{" "}
                  {attempt.flaggedCount === 1 ? "flagged check-in" : "flagged check-ins"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {attempt.reasonCodes.map((code) => (
                    <Badge key={code} variant="outline">
                      {formatReasonCode(code)}
                    </Badge>
                  ))}
                </div>
                <p className="text-muted-foreground font-mono text-xs">
                  {formatDate(attempt.latestAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Ledger anomaly events</h3>
        {verification.byType.length === 0 && verification.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No verification anomalies in the window.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {verification.byType.map((entry) => (
                <div
                  key={entry.type}
                  data-testid="anomaly-type-row"
                  className="flex items-center justify-between gap-2"
                >
                  <span className="font-mono text-xs">{entry.type}</span>
                  <Badge>{entry.count}</Badge>
                </div>
              ))}
            </div>
            {verification.recent.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {verification.recent.map((event, index) => (
                  <li key={index} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono">{event.type}</span>
                    <span className="text-muted-foreground">{formatDate(event.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const session = await getActiveSession();
  if (session === null || (session.role !== "admin" && session.role !== "department_authority")) {
    return (
      <EmptyState
        icon={Users}
        title="Administrator access required"
        description="Analytics are visible to administrators and department authority."
      />
    );
  }

  const client = getConvexClient();
  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });
  const [overview, trajectories, sectionTrends, anomalies] = await Promise.all([
    client.query(api.analytics.overview, { actorToken }),
    client.query(api.analytics.attendanceTrajectories, { actorToken }),
    client.query(api.analytics.sectionTrends, { actorToken }),
    client.query(api.analytics.anomalyDashboard, { actorToken }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Analytics"
        description="Attendance trajectories, cohort trends, and verification anomalies — for investigation and early intervention."
      />
      <p className="text-muted-foreground -mt-4 text-sm">
        Alerts route into the review inbox — nothing here acts on a student automatically.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={overview.students} testId="stat-students" />
        <StatCard label="Sections" value={overview.sections} testId="stat-sections" />
        <StatCard label="Sessions held" value={overview.sessionsHeld} testId="stat-sessions" />
        <div className="bg-card rounded-xl border p-5">
          <p className="text-sm">
            Open alerts
            {overview.openAlerts > 0 ? <ShieldAlert className="ml-1 inline size-3.5" /> : null}
          </p>
          <p
            className={`font-mono text-2xl font-semibold tabular-nums ${overview.openAlerts > 0 ? "text-verdict-flag" : ""}`}
            data-testid="stat-open-alerts"
          >
            {overview.openAlerts}
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Attendance trajectories</h2>
        {trajectories.length === 0 ? (
          <EmptyState
            icon={LineChart}
            title="No trajectories yet"
            description="Attendance history builds up as sessions run."
          />
        ) : (
          <TrajectoriesTable rows={trajectories} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Subject trends</h2>
        <SectionTrendsTable rows={sectionTrends} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Verification anomalies (past 28 days)</h2>
        <AnomalyPanels dashboard={anomalies} />
      </section>
    </div>
  );
}
