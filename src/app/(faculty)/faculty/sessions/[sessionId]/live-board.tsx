"use client";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { ShieldCheck, Timer, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { VerdictStamp } from "@/components/marketing/verdict-stamp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatReasonCode } from "@/lib/analytics/labels";

import { ManualVerifyDialog } from "./manual-verify-dialog";

export type BoardSnapshot = FunctionReturnType<typeof api.classSessions.getBoard>;
type BoardRow = BoardSnapshot["rows"][number];
type RowState = BoardRow["state"];
type ChallengeInfo = NonNullable<BoardRow["challenge"]>;
type SpotRecheckFailure = Extract<
  FunctionReturnType<typeof api.challenges.requestSpotRecheck>,
  { kind: "error" }
>;

const STATE_ORDER: readonly RowState[] = [
  "verified",
  "challenged",
  "flagged",
  "pending",
  "rejected",
];

const SPOT_ERROR_COPY: Record<SpotRecheckFailure["reason"], string> = {
  unauthorized: "You are not authorized to request re-checks for this session.",
  session_not_active: "The session is not active, so re-checks cannot be requested.",
  no_eligible_students: "No verified students are available to re-check.",
  student_not_eligible: "This student has no verifiable attendance to re-check.",
};

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function StateBadge({ state }: { state: RowState }) {
  if (state === "verified") return <VerdictStamp verdict="accept" label="Verified" />;
  if (state === "challenged") return <VerdictStamp verdict="step-up" />;
  if (state === "flagged") return <VerdictStamp verdict="flag" label="Flagged" />;
  if (state === "pending") return <Badge variant="secondary">Pending</Badge>;
  return <VerdictStamp verdict="reject" label="Rejected" />;
}

/**
 * Ticks client-side only; renders a placeholder until mounted so server and
 * client markup agree on first paint.
 */
function ChallengeCountdown({
  studentId,
  challenge,
}: {
  studentId: Id<"users">;
  challenge: ChallengeInfo;
}) {
  const [nowTs, setNowTs] = useState<number | null>(null);

  useEffect(() => {
    setNowTs(Date.now());
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft =
    nowTs === null ? null : Math.max(0, Math.ceil((challenge.expiresAt - nowTs) / 1000));

  return (
    <span
      data-testid={`challenge-countdown-${studentId}`}
      className="border-verdict-stepup/40 bg-verdict-stepup/10 text-verdict-stepup inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums"
    >
      <Timer className="size-3" />
      {secondsLeft === null ? "--:--" : formatMmSs(secondsLeft)}
      <span className="font-sans font-normal tracking-normal normal-case">
        {challenge.kind === "checkin_stepup" ? "verification" : "re-check"}
      </span>
    </span>
  );
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
  const requestSpotRecheck = useMutation(api.challenges.requestSpotRecheck);
  const [verifyTarget, setVerifyTarget] = useState<BoardRow | null>(null);
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [spotError, setSpotError] = useState<string | null>(null);

  const rows = [...board.rows].sort(
    (a, b) =>
      STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
      a.studentName.localeCompare(b.studentName),
  );

  const countByState = (state: RowState) =>
    rows.reduce((total, row) => (row.state === state ? total + 1 : total), 0);

  async function handleSpotRecheck(studentId?: Id<"users">) {
    if (recheckBusy) return;
    setRecheckBusy(true);
    setSpotError(null);
    try {
      const result = await requestSpotRecheck(
        studentId === undefined ? { actorToken, sessionId } : { actorToken, sessionId, studentId },
      );
      if (result.kind === "error") {
        setSpotError(SPOT_ERROR_COPY[result.reason]);
      }
    } catch {
      setSpotError("Could not request a re-check. Please try again.");
    } finally {
      setRecheckBusy(false);
    }
  }

  return (
    <>
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
          <p className="text-muted-foreground text-sm">
            Manual verification records faculty-attested attendance with a mandatory auditable
            reason. Re-checks ask a verified student to confirm their face on the spot.
          </p>
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
              data-testid="board-count-challenged"
              className="border-verdict-stepup/35 bg-verdict-stepup/10 text-verdict-stepup"
            >
              Challenged {countByState("challenged")}
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
            <Button
              variant="outline"
              size="xs"
              className="ml-auto"
              data-testid="spot-recheck-random"
              disabled={recheckBusy || countByState("verified") === 0}
              onClick={() => void handleSpotRecheck()}
            >
              Random recheck
            </Button>
          </div>
          {spotError !== null ? (
            <p className="text-destructive text-sm" data-testid="spot-error" role="alert">
              {spotError}
            </p>
          ) : null}
          {rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students enrolled"
              description="The roster appears once students enroll in this section."
            />
          ) : (
            <ul className="-mx-6 divide-y border-t px-6 lg:max-h-[70vh] lg:overflow-auto">
              {rows.map((row) => (
                <li
                  key={row.studentId}
                  data-testid={`board-row-${row.studentId}`}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{row.studentName}</span>
                      <StateBadge state={row.state} />
                      {row.state === "challenged" && row.challenge !== null ? (
                        <ChallengeCountdown studentId={row.studentId} challenge={row.challenge} />
                      ) : null}
                    </div>
                    <p className="text-muted-foreground truncate text-xs">{row.email}</p>
                    <p
                      className="text-muted-foreground text-xs tabular-nums"
                      suppressHydrationWarning
                    >
                      {row.checkedInAt !== null
                        ? `Checked in ${formatClock(row.checkedInAt)}`
                        : "Not checked in"}
                      {row.updatedAt !== null && row.updatedAt !== row.checkedInAt
                        ? ` · updated ${formatClock(row.updatedAt)}`
                        : ""}
                    </p>
                    {row.reasonCodes.length > 0 ? (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {row.reasonCodes.map((code) => (
                          <span
                            key={code}
                            title={code}
                            className="text-muted-foreground rounded-md border px-1.5 py-0.5 text-[11px]"
                          >
                            {formatReasonCode(code)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0">
                    {row.state === "verified" ? (
                      row.challenge?.kind === "spot_recheck" ? (
                        <span
                          data-testid={`spot-pending-${row.studentId}`}
                          className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400"
                        >
                          Spot re-check requested
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          data-testid={`spot-recheck-${row.studentId}`}
                          disabled={recheckBusy}
                          onClick={() => void handleSpotRecheck(row.studentId)}
                        >
                          Recheck
                        </Button>
                      )
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        data-testid={`manual-verify-${row.studentId}`}
                        onClick={() => setVerifyTarget(row)}
                      >
                        <ShieldCheck />
                        {row.state === "pending" ? "Verify" : "Override"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {verifyTarget !== null ? (
        <ManualVerifyDialog
          actorToken={actorToken}
          sessionId={sessionId}
          student={{ id: verifyTarget.studentId, name: verifyTarget.studentName }}
          mode={verifyTarget.state === "pending" ? "verify" : "override"}
          onClose={() => setVerifyTarget(null)}
        />
      ) : null}
    </>
  );
}
