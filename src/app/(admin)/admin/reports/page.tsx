import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { FileText, Users } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { isReportPeriod, REPORT_PERIODS, type ReportPeriod } from "@/lib/analytics";
import { formatReasonCode } from "@/lib/analytics/labels";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import { cn } from "@/lib/utils";

import { ExportButtons } from "./export-buttons";

export const dynamic = "force-dynamic";

type ReportRow = FunctionReturnType<typeof api.analytics.reportRows>["rows"][number];

const PERIOD_LINK_CLASSNAMES = {
  active: "bg-accent text-accent-foreground rounded-md px-3 py-1.5 text-sm font-medium",
  inactive:
    "text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium",
} as const;

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

function StateBadge({ state }: { state: ReportRow["state"] }) {
  if (state === "verified") {
    return (
      <Badge variant="outline" className="text-verdict-accept">
        verified
      </Badge>
    );
  }
  if (state === "corrected") {
    return (
      <Badge variant="outline" className="text-verdict-accept">
        corrected
      </Badge>
    );
  }
  if (state === "flagged") {
    return (
      <Badge variant="destructive" className="text-verdict-flag">
        flagged
      </Badge>
    );
  }
  if (state === "rejected") {
    return (
      <Badge variant="destructive" className="text-verdict-reject">
        rejected
      </Badge>
    );
  }
  return <Badge variant="secondary">pending</Badge>;
}

function parsePeriod(value: string | undefined): ReportPeriod {
  if (value !== undefined && isReportPeriod(value)) return value;
  return "weekly";
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
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

  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod);

  const client = getConvexClient();
  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });
  const report = await client.query(api.analytics.reportRows, { actorToken, period });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Reports"
        description="Rolling-window attendance reports with compliance exports."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1" aria-label="Report period">
          {REPORT_PERIODS.map((option) => (
            <Link
              key={option}
              href={`/admin/reports?period=${option}`}
              data-testid={`period-${option}`}
              className={cn(
                option === period ? PERIOD_LINK_CLASSNAMES.active : PERIOD_LINK_CLASSNAMES.inactive,
              )}
              aria-current={option === period ? "page" : undefined}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Link>
          ))}
        </nav>
        <ExportButtons rows={report.rows} period={period} label={report.label} />
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="report-summary">
        <span className="text-muted-foreground text-sm">{report.label}</span>
        <Badge variant="outline" className="text-verdict-accept">
          {report.summary.verified} verified
        </Badge>
        <Badge variant="outline" className="text-verdict-flag">
          {report.summary.flagged} flagged
        </Badge>
        <Badge variant="outline" className="text-verdict-reject">
          {report.summary.rejected} rejected
        </Badge>
        <Badge variant="secondary">{report.summary.pending} pending</Badge>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No records in this window"
          description="Check-ins during this window appear here with exports."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Section</th>
                <th className="px-4 py-2 font-medium">State</th>
                <th className="px-4 py-2 font-medium">Reason codes</th>
                <th className="px-4 py-2 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.rows.map((row, index) => (
                <tr key={index} data-testid="report-row">
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{row.studentName}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {row.studentEmail}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2">{row.courseCode}</td>
                  <td className="px-4 py-2">{row.sectionName}</td>
                  <td className="px-4 py-2">
                    <StateBadge state={row.state} />
                  </td>
                  <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                    {row.reasonCodes.length > 0
                      ? row.reasonCodes.map(formatReasonCode).join("; ")
                      : "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                    {formatDate(row.capturedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
