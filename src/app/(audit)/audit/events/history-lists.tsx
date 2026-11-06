"use client";

import { api } from "../../../../../convex/_generated/api";
import { useConvex, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ChevronDown, ChevronRight, Loader2, ScrollText } from "lucide-react";
import { useState } from "react";

import { VerdictStamp, type Verdict } from "@/components/marketing/verdict-stamp";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/decision";
import { formatInstitutionDateTime } from "@/lib/format/datetime";
import { LEDGER_CATEGORY_LABEL, ledgerDisplayCategory } from "@/lib/format/ledger";

const PAGE_SIZE = 100;

export type LedgerFilters = Omit<
  FunctionArgs<typeof api.ledger.listLedgerEvents>,
  "actorToken" | "limit" | "cursorSeq"
>;
export type AttendanceFilters = Omit<
  FunctionArgs<typeof api.ledger.listAttendanceRecords>,
  "actorToken" | "limit" | "cursorSeq"
>;

type LedgerEvent = FunctionReturnType<typeof api.ledger.listLedgerEvents>["events"][number];
type AttendanceRecord = FunctionReturnType<
  typeof api.ledger.listAttendanceRecords
>["records"][number];
type Page<T> = { items: T[]; nextCursor?: number };

/**
 * A live first page plus older pages fetched on demand. The first "Load
 * more" snapshots the live page, so rows it later drops (as newer events
 * arrive) stay listed and the history has no gap.
 */
function usePagedHistory<T extends { seq: number }>(
  first: Page<T> | undefined,
  fetchOlder: (cursorSeq: number) => Promise<Page<T>>,
) {
  const [loaded, setLoaded] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const cursor = loaded !== null ? loaded.nextCursor : first?.nextCursor;

  async function loadMore() {
    if (first === undefined || cursor === undefined || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchOlder(cursor);
      setLoaded((current) => ({
        items: [...(current?.items ?? first.items), ...page.items],
        nextCursor: page.nextCursor,
      }));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const seen = new Set<number>();
  const items = [...(first?.items ?? []), ...(loaded?.items ?? [])]
    .filter((item) => !seen.has(item.seq) && seen.add(item.seq))
    .sort((a, b) => b.seq - a.seq);
  return {
    items,
    ready: first !== undefined,
    hasMore: cursor !== undefined,
    loading,
    failed,
    loadMore,
  };
}

function useExpanded() {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  function toggle(seq: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(seq)) next.add(seq);
      return next;
    });
  }
  return { isExpanded: (seq: number) => expanded.has(seq), toggle };
}

function LoadMore({
  history,
  noun,
}: {
  history: { hasMore: boolean; loading: boolean; failed: boolean; loadMore: () => Promise<void> };
  noun: string;
}) {
  if (!history.hasMore) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        data-testid="history-load-more"
        disabled={history.loading}
        onClick={() => void history.loadMore()}
      >
        {history.loading ? <Loader2 className="animate-spin" /> : null}
        Load older {noun}
      </Button>
      {history.failed ? (
        <span className="text-destructive text-xs">Couldn&apos;t load more. Try again.</span>
      ) : null}
    </div>
  );
}

function ExpandToggle({
  seq,
  expanded,
  onToggle,
  testId,
}: {
  seq: number;
  expanded: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse #${seq}` : `Expand #${seq}`}
      data-testid={testId}
      onClick={onToggle}
    >
      {expanded ? <ChevronDown /> : <ChevronRight />}
    </Button>
  );
}

function HashLine({ hash }: { hash: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs font-medium uppercase">Event hash</span>
      <code
        className="max-w-full truncate rounded-md border px-1.5 py-0.5 font-mono text-xs"
        title={hash}
      >
        {hash.slice(0, 24)}…
      </code>
    </div>
  );
}

function ReasonCodes({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {codes.map((code) => (
        <span
          key={code}
          className="text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-[11px] break-all"
        >
          {code}
        </span>
      ))}
    </div>
  );
}

const OUTCOME_VERDICT: Record<Decision["outcome"], Verdict> = {
  accept: "accept",
  step_up: "step-up",
  flag: "flag",
  reject: "reject",
};

function DecisionEvidence({ decision }: { decision: Decision }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <VerdictStamp verdict={OUTCOME_VERDICT[decision.outcome]} />
      <ReasonCodes codes={decision.reasonCodes} />
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs font-medium">
              <th scope="col" className="pr-4 pb-1.5">
                Category
              </th>
              <th scope="col" className="pr-4 pb-1.5">
                Source
              </th>
              <th scope="col" className="pr-4 pb-1.5">
                Status
              </th>
              <th scope="col" className="pb-1.5">
                Detail
              </th>
            </tr>
          </thead>
          <tbody>
            {decision.evidence.signals.map((signal, index) => (
              <tr key={`${signal.source}-${index}`} className="border-b last:border-b-0">
                <td className="py-1.5 pr-4">{signal.category}</td>
                <td className="py-1.5 pr-4 font-mono text-xs">{signal.source}</td>
                <td className="py-1.5 pr-4">{signal.status}</td>
                <td className="text-muted-foreground py-1.5">{signal.detail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Policy: <span className="font-mono">{decision.policyVersion}</span>
      </p>
    </div>
  );
}

const OUTCOME_VALUES: readonly string[] = ["accept", "step_up", "flag", "reject"];
const SIGNAL_CATEGORY_VALUES: readonly string[] = ["identity", "device", "presence", "person"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidSignal(signal: unknown): signal is Decision["evidence"]["signals"][number] {
  if (!isRecord(signal)) return false;
  if (typeof signal.source !== "string" || typeof signal.status !== "string") return false;
  if (!SIGNAL_CATEGORY_VALUES.includes(signal.category as string)) return false;
  return signal.detail === undefined || typeof signal.detail === "string";
}

/** Ledger payloads are untyped; only a well-formed decision is rendered as evidence. */
function extractDecision(payload: unknown): Decision | null {
  if (!isRecord(payload) || !isRecord(payload.decision)) return null;
  const decision = payload.decision;
  if (typeof decision.outcome !== "string" || !OUTCOME_VALUES.includes(decision.outcome)) {
    return null;
  }
  if (
    !Array.isArray(decision.reasonCodes) ||
    !decision.reasonCodes.every((code) => typeof code === "string")
  ) {
    return null;
  }
  if (typeof decision.policyVersion !== "string" || typeof decision.decidedAt !== "number") {
    return null;
  }
  if (!isRecord(decision.evidence) || !Array.isArray(decision.evidence.signals)) return null;
  if (!decision.evidence.signals.every(isValidSignal)) return null;
  return decision as Decision;
}

/** Removed users no longer resolve; their ledger payload still names them. */
function payloadEmail(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.email === "string" ? payload.email : null;
}

function Loading({ title }: { title: string }) {
  return <EmptyState icon={Loader2} title={title} description="Fetching the append-only trail." />;
}

/** Newest-first event ledger with on-demand older pages. */
export function LedgerList({
  actorToken,
  filters,
  filtered,
}: {
  actorToken: string;
  filters: LedgerFilters;
  filtered: boolean;
}) {
  const convex = useConvex();
  const first = useQuery(api.ledger.listLedgerEvents, { actorToken, limit: PAGE_SIZE, ...filters });
  const history = usePagedHistory<LedgerEvent>(
    first && { items: first.events, nextCursor: first.nextCursor },
    async (cursorSeq) => {
      const page = await convex.query(api.ledger.listLedgerEvents, {
        actorToken,
        limit: PAGE_SIZE,
        cursorSeq,
        ...filters,
      });
      return { items: page.events, nextCursor: page.nextCursor };
    },
  );
  const { isExpanded, toggle } = useExpanded();

  if (!history.ready) return <Loading title="Loading ledger events" />;
  if (history.items.length === 0 && !history.hasMore) {
    return (
      <EmptyState
        icon={ScrollText}
        title={filtered ? "No matching ledger events" : "No ledger events yet"}
        description={
          filtered
            ? "Try a wider date range or clear some filters."
            : "Events appear here as soon as attendance decisions and administrative actions are recorded."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {history.items.length > 0 ? (
        <ol className="divide-y rounded-xl border" aria-label="Ledger events, newest first">
          {history.items.map((event) => {
            const expanded = isExpanded(event.seq);
            const decision = expanded ? extractDecision(event.payload) : null;
            const subject = event.subjectName ?? payloadEmail(event.payload);
            return (
              <li key={event._id} className="flex flex-col gap-3 px-3 py-3 sm:px-4">
                <div data-testid={`ledger-row-${event.seq}`} className="flex items-start gap-3">
                  <span className="text-muted-foreground w-10 shrink-0 pt-0.5 font-mono text-xs tabular-nums">
                    #{event.seq}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="outline">
                        {LEDGER_CATEGORY_LABEL[ledgerDisplayCategory(event.category, event.type)]}
                      </Badge>
                      <code className="font-mono text-xs break-all">{event.type}</code>
                    </div>
                    <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      <time
                        dateTime={new Date(event.createdAt).toISOString()}
                        className="tabular-nums"
                      >
                        {formatInstitutionDateTime(event.createdAt, { seconds: true })}
                      </time>
                      {subject !== null ? (
                        <span className="break-all">Subject: {subject}</span>
                      ) : null}
                      {event.actorName !== null ? <span>By: {event.actorName}</span> : null}
                    </p>
                  </div>
                  <ExpandToggle
                    seq={event.seq}
                    expanded={expanded}
                    onToggle={() => toggle(event.seq)}
                    testId={`ledger-toggle-${event.seq}`}
                  />
                </div>
                {expanded ? (
                  <div
                    data-testid={`ledger-evidence-${event.seq}`}
                    className="bg-muted/40 flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:p-4"
                  >
                    <HashLine hash={event.eventHash} />
                    {decision !== null ? <DecisionEvidence decision={decision} /> : null}
                    <pre className="max-h-72 max-w-full overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          No matches among the most recent events yet — load older ones to keep searching.
        </p>
      )}
      <LoadMore history={history} noun="ledger events" />
    </div>
  );
}

const STATE_LABEL: Record<string, string> = {
  verified: "Verified",
  flagged: "Flagged",
  rejected: "Rejected",
  step_up: "Step-up",
  corrected: "Corrected",
};

const STATE_BADGE: Record<string, string> = {
  verified: "border-verdict-accept/35 bg-verdict-accept/10 text-verdict-accept",
  flagged: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Newest-first attendance_events — every check-in decision, accepted ones included. */
export function AttendanceList({
  actorToken,
  filters,
  filtered,
}: {
  actorToken: string;
  filters: AttendanceFilters;
  filtered: boolean;
}) {
  const convex = useConvex();
  const first = useQuery(api.ledger.listAttendanceRecords, {
    actorToken,
    limit: PAGE_SIZE,
    ...filters,
  });
  const history = usePagedHistory<AttendanceRecord>(
    first && { items: first.records, nextCursor: first.nextCursor },
    async (cursorSeq) => {
      const page = await convex.query(api.ledger.listAttendanceRecords, {
        actorToken,
        limit: PAGE_SIZE,
        cursorSeq,
        ...filters,
      });
      return { items: page.records, nextCursor: page.nextCursor };
    },
  );
  const { isExpanded, toggle } = useExpanded();

  if (!history.ready) return <Loading title="Loading attendance records" />;
  if (history.items.length === 0 && !history.hasMore) {
    return (
      <EmptyState
        icon={ScrollText}
        title={filtered ? "No matching attendance records" : "No attendance records yet"}
        description={
          filtered
            ? "Try a wider date range or clear some filters."
            : "Check-in decisions appear here as students mark attendance."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {history.items.length > 0 ? (
        <ol className="divide-y rounded-xl border" aria-label="Attendance records, newest first">
          {history.items.map((record) => {
            const expanded = isExpanded(record.seq);
            return (
              <li key={record._id} className="flex flex-col gap-3 px-3 py-3 sm:px-4">
                <div
                  data-testid={`attendance-record-${record.seq}`}
                  className="flex items-start gap-3"
                >
                  <span className="text-muted-foreground w-10 shrink-0 pt-0.5 font-mono text-xs tabular-nums">
                    #{record.seq}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="outline" className={STATE_BADGE[record.state]}>
                        {STATE_LABEL[record.state] ?? record.state}
                      </Badge>
                      <span className="text-sm font-medium">{record.studentName ?? "—"}</span>
                      {record.courseCode !== null ? (
                        <span className="text-muted-foreground text-xs">
                          {record.courseCode} · {record.sectionName}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      <time
                        dateTime={new Date(record.capturedAt).toISOString()}
                        className="tabular-nums"
                      >
                        {formatInstitutionDateTime(record.capturedAt, { seconds: true })}
                      </time>
                      <span>{record.origin}</span>
                      {record.recordedByName !== null ? (
                        <span>By: {record.recordedByName}</span>
                      ) : null}
                    </p>
                    {record.decision !== null ? (
                      <ReasonCodes codes={record.decision.reasonCodes} />
                    ) : null}
                  </div>
                  <ExpandToggle
                    seq={record.seq}
                    expanded={expanded}
                    onToggle={() => toggle(record.seq)}
                    testId={`attendance-toggle-${record.seq}`}
                  />
                </div>
                {expanded ? (
                  <div className="bg-muted/40 flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:p-4">
                    <HashLine hash={record.eventHash} />
                    {record.note !== null ? <p className="text-sm">Note: {record.note}</p> : null}
                    {record.decision !== null ? (
                      <DecisionEvidence decision={record.decision} />
                    ) : (
                      <p className="text-muted-foreground text-xs">No decision trail attached.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          No matches among the most recent records yet — load older ones to keep searching.
        </p>
      )}
      <LoadMore history={history} noun="attendance records" />
    </div>
  );
}
