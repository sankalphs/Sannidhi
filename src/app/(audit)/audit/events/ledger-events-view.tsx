"use client";

import { api } from "../../../../../convex/_generated/api";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronDown, ChevronRight, Loader2, ScrollText, ShieldCheck } from "lucide-react";
import { Component, type ReactNode, useEffect, useState } from "react";

import { VerdictStamp, type Verdict } from "@/components/marketing/verdict-stamp";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/decision";
import { formatInstitutionDateTime } from "@/lib/format/datetime";
import { LEDGER_CATEGORY_LABEL, ledgerDisplayCategory } from "@/lib/format/ledger";

type DecisionOutcome = Decision["outcome"];

type LedgerSnapshot = FunctionReturnType<typeof api.ledger.listLedgerEvents>;
type LedgerEvent = LedgerSnapshot["events"][number];

type ChainWindow = FunctionReturnType<typeof api.ledger.verifyChain>;
type ChainStatus =
  | { state: "valid"; count: number }
  | { state: "truncated"; count: number }
  | { state: "broken"; brokenAtSeq: number }
  | { state: "error" };

type FetchChainPage = (args: {
  actorToken: string;
  limit: number;
  fromSeq?: number;
}) => Promise<ChainWindow>;

/**
 * Walks a whole chain through its windowed verify query until it ends or
 * breaks. Hitting the walk cap is a distinct "truncated" verdict: only a
 * chain that actually reached its end may report as valid.
 */
async function walkChain(fetchPage: FetchChainPage, actorToken: string): Promise<ChainStatus> {
  let cursorSeq: number | undefined;
  let verifiedCount = 0;
  try {
    for (let window = 0; window < MAX_CHAIN_WINDOWS; window += 1) {
      const result = await fetchPage({
        actorToken,
        limit: 500,
        ...(cursorSeq !== undefined ? { fromSeq: cursorSeq } : {}),
      });
      if (!result.valid) {
        return { state: "broken", brokenAtSeq: result.brokenAtSeq ?? -1 };
      }
      verifiedCount += result.count;
      if (!("nextCursor" in result) || result.nextCursor === undefined) {
        return { state: "valid", count: verifiedCount };
      }
      cursorSeq = result.nextCursor;
    }
    return { state: "truncated", count: verifiedCount };
  } catch {
    return { state: "error" };
  }
}

const OUTCOME_VERDICT: Record<DecisionOutcome, Verdict> = {
  accept: "accept",
  step_up: "step-up",
  flag: "flag",
  reject: "reject",
};

class LedgerErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      return (
        <EmptyState
          icon={ScrollText}
          title="Ledger unavailable"
          description="This account is not authorized to read the event ledger, or the query failed. Sign in with an administrator or auditor account."
        />
      );
    }
    return this.props.children;
  }
}

const OUTCOME_VALUES: readonly string[] = ["accept", "step_up", "flag", "reject"];
const CATEGORY_VALUES: readonly string[] = ["identity", "device", "presence", "person"];
const MAX_LEDGER_PAGES = 20;
const MAX_CHAIN_WINDOWS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidSignal(signal: unknown): signal is Decision["evidence"]["signals"][number] {
  if (!isRecord(signal)) return false;
  if (typeof signal.source !== "string" || typeof signal.status !== "string") return false;
  if (!CATEGORY_VALUES.includes(signal.category as string)) return false;
  return signal.detail === undefined || typeof signal.detail === "string";
}

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

export function LedgerEventsView({ actorToken }: { actorToken: string }) {
  return (
    <LedgerErrorBoundary>
      <LedgerEventsViewInner actorToken={actorToken} />
    </LedgerErrorBoundary>
  );
}

function ChainStatusBadge({
  status,
  testId,
  label,
  noun,
}: {
  status: ChainStatus | null;
  testId: string;
  label: string;
  noun: string;
}) {
  if (status === null) return null;
  if (status.state === "valid") {
    return (
      <Badge
        data-testid={testId}
        className="border-verdict-accept/35 bg-verdict-accept/10 text-verdict-accept"
      >
        {label} valid · {status.count} {noun}
      </Badge>
    );
  }
  if (status.state === "truncated") {
    return (
      <Badge
        data-testid={testId}
        className="border-amber-500/40 bg-amber-500/10 whitespace-normal text-amber-600 dark:text-amber-400"
      >
        {label} partially verified · first {status.count} {noun} valid, walk limit reached
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" data-testid={testId}>
      {status.state === "broken"
        ? `${label} broken at seq ${status.brokenAtSeq}`
        : "Verification failed"}
    </Badge>
  );
}

function LedgerEventsViewInner({ actorToken }: { actorToken: string }) {
  const convex = useConvex();
  const eventsResult = useQuery(api.ledger.listLedgerEvents, { actorToken, limit: 100 });
  const [olderEvents, setOlderEvents] = useState<LedgerEvent[]>([]);
  const [expandedSeqs, setExpandedSeqs] = useState<ReadonlySet<number>>(new Set());
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [verifyingAttendanceChain, setVerifyingAttendanceChain] = useState(false);
  const [attendanceChainStatus, setAttendanceChainStatus] = useState<ChainStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOlderEvents([]);
    async function loadOlder() {
      if (eventsResult === undefined || eventsResult.nextCursor === undefined) return;
      const collected: LedgerEvent[] = [];
      let cursorSeq: number | undefined = eventsResult.nextCursor;
      try {
        for (let page = 0; page < MAX_LEDGER_PAGES && cursorSeq !== undefined; page += 1) {
          const result: LedgerSnapshot = await convex.query(api.ledger.listLedgerEvents, {
            actorToken,
            limit: 100,
            ...(cursorSeq !== undefined ? { cursorSeq } : {}),
          });
          collected.push(...result.events);
          cursorSeq = result.nextCursor;
        }
      } catch {
        return;
      }
      if (!cancelled) setOlderEvents(collected);
    }
    void loadOlder();
    return () => {
      cancelled = true;
    };
  }, [convex, actorToken, eventsResult]);

  const seenSeqs = new Set<number>();
  const events = [...(eventsResult?.events ?? []), ...olderEvents]
    .filter((event) => {
      if (seenSeqs.has(event.seq)) return false;
      seenSeqs.add(event.seq);
      return true;
    })
    .sort((a, b) => b.seq - a.seq);

  function toggleExpanded(seq: number) {
    setExpandedSeqs((current) => {
      const next = new Set(current);
      if (next.has(seq)) {
        next.delete(seq);
      } else {
        next.add(seq);
      }
      return next;
    });
  }

  async function handleVerifyChain() {
    if (verifyingChain) return;
    setVerifyingChain(true);
    try {
      setChainStatus(
        await walkChain((args) => convex.query(api.ledger.verifyChain, args), actorToken),
      );
    } finally {
      setVerifyingChain(false);
    }
  }

  async function handleVerifyAttendanceChain() {
    if (verifyingAttendanceChain) return;
    setVerifyingAttendanceChain(true);
    try {
      setAttendanceChainStatus(
        await walkChain((args) => convex.query(api.ledger.verifyAttendanceChain, args), actorToken),
      );
    } finally {
      setVerifyingAttendanceChain(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Auditor panel"
        title="Event ledger"
        description="Tamper-evident chain of attendance events with the full decision trail behind each verdict."
      />
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Chain integrity">
        <div className="flex flex-col items-start gap-2 rounded-xl border p-4">
          <p className="text-sm font-medium">Ledger events</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            The administrative and security events listed below, in one hash chain.
          </p>
          <Button
            variant="outline"
            size="sm"
            data-testid="verify-chain"
            onClick={() => void handleVerifyChain()}
            disabled={verifyingChain}
          >
            {verifyingChain ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Verify ledger events
          </Button>
          <ChainStatusBadge
            status={chainStatus}
            testId="chain-status"
            label="Ledger chain"
            noun="ledger events"
          />
        </div>
        <div className="flex flex-col items-start gap-2 rounded-xl border p-4">
          <p className="text-sm font-medium">Attendance records</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Every check-in state change (verified, flagged, corrected…), kept in a separate chain —
            so its count differs from the ledger&apos;s.
          </p>
          <Button
            variant="outline"
            size="sm"
            data-testid="verify-attendance-chain"
            onClick={() => void handleVerifyAttendanceChain()}
            disabled={verifyingAttendanceChain}
          >
            {verifyingAttendanceChain ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Verify attendance records
          </Button>
          <ChainStatusBadge
            status={attendanceChainStatus}
            testId="attendance-chain-status"
            label="Attendance chain"
            noun="attendance records"
          />
        </div>
      </section>
      {eventsResult === undefined ? (
        <EmptyState
          icon={Loader2}
          title="Loading ledger events"
          description="Fetching the append-only event trail."
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No ledger events yet"
          description="Events appear here as soon as attendance decisions and administrative actions are recorded."
        />
      ) : (
        <ol className="divide-y rounded-xl border" aria-label="Ledger events, newest first">
          {events.map((event) => (
            <LedgerRow
              key={event._id}
              event={event}
              expanded={expandedSeqs.has(event.seq)}
              onToggle={() => toggleExpanded(event.seq)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function LedgerRow({
  event,
  expanded,
  onToggle,
}: {
  event: LedgerEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const decision = extractDecision(event.payload);
  return (
    <li className="flex flex-col gap-3 px-3 py-3 sm:px-4">
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
            <time dateTime={new Date(event.createdAt).toISOString()} className="tabular-nums">
              {formatInstitutionDateTime(event.createdAt, { seconds: true })}
            </time>
            {event.subjectName !== null ? <span>Subject: {event.subjectName}</span> : null}
            {event.actorName !== null ? <span>By: {event.actorName}</span> : null}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse event ${event.seq}` : `Expand event ${event.seq}`}
          data-testid={`ledger-toggle-${event.seq}`}
          onClick={onToggle}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
      </div>
      {expanded ? (
        <div
          data-testid={`ledger-evidence-${event.seq}`}
          className="bg-muted/40 flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:p-4"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium uppercase">Event hash</span>
            <code
              className="max-w-full truncate rounded-md border px-1.5 py-0.5 font-mono text-xs"
              title={event.eventHash}
            >
              {event.eventHash.slice(0, 24)}…
            </code>
          </div>
          {decision !== null ? <DecisionEvidence decision={decision} /> : null}
          <pre className="max-h-72 max-w-full overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      ) : null}
    </li>
  );
}

function DecisionEvidence({ decision }: { decision: Decision }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <VerdictStamp verdict={OUTCOME_VERDICT[decision.outcome]} />
      {decision.reasonCodes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {decision.reasonCodes.map((code) => (
            <span
              key={code}
              className="text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-[11px]"
            >
              {code}
            </span>
          ))}
        </div>
      ) : null}
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
