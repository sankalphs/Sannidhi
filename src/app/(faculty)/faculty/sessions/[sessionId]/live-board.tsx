"use client";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { VerdictStamp } from "@/components/marketing/verdict-stamp";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type BoardSnapshot = FunctionReturnType<typeof api.classSessions.getBoard>;
type BoardRow = BoardSnapshot["rows"][number];
type RowState = BoardRow["state"];

const STATE_ORDER: readonly RowState[] = ["verified", "flagged", "pending", "rejected"];

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function StateBadge({ state }: { state: RowState }) {
  if (state === "verified") return <VerdictStamp verdict="accept" label="Verified" />;
  if (state === "flagged") return <VerdictStamp verdict="flag" label="Flagged" />;
  if (state === "pending") return <Badge variant="secondary">Pending</Badge>;
  return <VerdictStamp verdict="reject" label="Rejected" />;
}

export function LiveBoard({
  actorToken,
  sessionId,
  initialSnapshot,
}: {
  actorToken: string;
  sessionId: Id<"class_sessions">;
  initialSnapshot: BoardSnapshot;
}) {
  const board = useQuery(api.classSessions.getBoard, { actorToken, sessionId }) ?? initialSnapshot;

  const rows = [...board.rows].sort(
    (a, b) =>
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      a.studentName.localeCompare(b.studentName),
  );

  const countByState = (state: RowState) =>
    rows.reduce((total, row) => (row.state === state ? total + 1 : total), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live roster</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <span className="relative flex size-2 motion-reduce:animate-none">
            <span className="bg-muted-foreground/60 absolute inline-flex size-full animate-ping rounded-full opacity-75 motion-reduce:hidden" />
            <span className="bg-muted-foreground relative inline-flex size-2 rounded-full" />
          </span>
          Updated live
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            data-testid="board-count-verified"
            className="border-verdict-accept/35 bg-verdict-accept/10 text-verdict-accept"
          >
            Verified {countByState("verified")}
          </Badge>
          <Badge
            data-testid="board-count-flagged"
            className="border-verdict-flag/40 bg-verdict-flag/10 text-verdict-flag"
          >
            Flagged {countByState("flagged")}
          </Badge>
          <Badge variant="secondary" data-testid="board-count-pending">
            Pending {countByState("pending")}
          </Badge>
          <Badge
            data-testid="board-count-rejected"
            className="border-verdict-reject/35 bg-verdict-reject/10 text-verdict-reject"
          >
            Rejected {countByState("rejected")}
          </Badge>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students enrolled"
            description="The roster appears once students enroll in this section."
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs font-medium">
                  <th scope="col" className="pr-4 pb-2">
                    Student
                  </th>
                  <th scope="col" className="pr-4 pb-2">
                    State
                  </th>
                  <th scope="col" className="pr-4 pb-2">
                    Checked in
                  </th>
                  <th scope="col" className="pb-2">
                    Reasons
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.studentId}
                    data-testid={`board-row-${row.studentId}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="py-2.5 pr-4">
                      <div className="font-medium">{row.studentName}</div>
                      <div className="text-muted-foreground text-xs">{row.email}</div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <StateBadge state={row.state} />
                    </td>
                    <td
                      className="text-muted-foreground py-2.5 pr-4 tabular-nums"
                      suppressHydrationWarning
                    >
                      {row.checkedInAt !== null ? formatClock(row.checkedInAt) : "—"}
                    </td>
                    <td className="py-2.5">
                      {row.reasonCodes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.reasonCodes.map((code) => (
                            <span
                              key={code}
                              className="text-muted-foreground rounded-md border px-1.5 py-0.5 text-[11px]"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
