"use client";

import { api } from "../../../../../convex/_generated/api";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronDown, ChevronRight, Loader2, ScrollText, ShieldCheck } from "lucide-react";
import { Component, type ReactNode, useEffect, useState, Fragment } from "react";

import { VerdictStamp, type Verdict } from "@/components/marketing/verdict-stamp";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Decision } from "@/lib/decision";

type DecisionOutcome = Decision["outcome"];

type LedgerSnapshot = FunctionReturnType<typeof api.ledger.listLedgerEvents>;
type LedgerEvent = LedgerSnapshot["events"][number];

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

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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

function LedgerEventsViewInner({ actorToken }: { actorToken: string }) {
  const convex = useConvex();
  const eventsResult = useQuery(api.ledger.listLedgerEvents, { actorToken, limit: 100 });
  const [olderEvents, setOlderEvents] = useState<LedgerEvent[]>([]);
  const [expandedSeqs, setExpandedSeqs] = useState<ReadonlySet<number>>(new Set());
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [chainStatus, setChainStatus] = useState<
    | { state: "valid"; count: number }
    | { state: "broken"; brokenAtSeq: number }
    | { state: "error" }
    | null
  >(null);

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
      type ChainWindow = FunctionReturnType<typeof api.ledger.verifyChain>;
      let cursorSeq: number | undefined;
      let verifiedCount = 0;
      for (let window = 0; window < MAX_CHAIN_WINDOWS; window += 1) {
        const result: ChainWindow = await convex.query(api.ledger.verifyChain, {
          actorToken,
          limit: 500,
          ...(cursorSeq !== undefined ? { fromSeq: cursorSeq } : {}),
        });
        if (!result.valid) {
          setChainStatus({ state: "broken", brokenAtSeq: result.brokenAtSeq ?? -1 });
          return;
        }
        verifiedCount += result.count;
        if (!("nextCursor" in result) || result.nextCursor === undefined) {
          setChainStatus({ state: "valid", count: verifiedCount });
          return;
        }
        cursorSeq = result.nextCursor;
      }
      setChainStatus({ state: "valid", count: verifiedCount });
    } catch {
      setChainStatus({ state: "error" });
    } finally {
      setVerifyingChain(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Auditor panel"
        title="Event ledger"
        description="Tamper-evident chain of attendance events with the full decision trail behind each verdict."
        actions={
          <>
            {chainStatus !== null ? (
              chainStatus.state === "valid" ? (
                <Badge
                  data-testid="chain-status"
                  className="border-verdict-accept/35 bg-verdict-accept/10 text-verdict-accept"
                >
                  Chain valid · {chainStatus.count} events
                </Badge>
              ) : chainStatus.state === "broken" ? (
                <Badge variant="destructive" data-testid="chain-status">
                  Broken at seq {chainStatus.brokenAtSeq}
                </Badge>
              ) : (
                <Badge variant="destructive" data-testid="chain-status">
                  Verification failed
                </Badge>
              )
            ) : null}
            <Button
              variant="outline"
              data-testid="verify-chain"
              onClick={() => void handleVerifyChain()}
              disabled={verifyingChain}
            >
              {verifyingChain ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Verify chain
            </Button>
          </>
        }
      />
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
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs font-medium">
                <th scope="col" className="pr-4 pb-2">
                  Seq
                </th>
                <th scope="col" className="pr-4 pb-2">
                  Time
                </th>
                <th scope="col" className="pr-4 pb-2">
                  Category
                </th>
                <th scope="col" className="pr-4 pb-2">
                  Type
                </th>
                <th scope="col" className="pr-4 pb-2">
                  Subject
                </th>
                <th scope="col" className="pr-4 pb-2">
                  Actor
                </th>
                <th scope="col" className="pb-2">
                  <span className="sr-only">Expand</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const expanded = expandedSeqs.has(event.seq);
                const decision = extractDecision(event.payload);
                return (
                  <Fragment key={event._id}>
                    <tr
                      data-testid={`ledger-row-${event.seq}`}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-2.5 pr-4 font-mono tabular-nums">{event.seq}</td>
                      <td
                        className="text-muted-foreground py-2.5 pr-4 tabular-nums"
                        suppressHydrationWarning
                      >
                        {formatClock(event.createdAt)}
                      </td>
                      <td className="py-2.5 pr-4">{event.category}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{event.type}</td>
                      <td className="py-2.5 pr-4">
                        {event.subjectName ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 pr-4">
                        {event.actorName ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-expanded={expanded}
                          aria-label={
                            expanded ? `Collapse event ${event.seq}` : `Expand event ${event.seq}`
                          }
                          data-testid={`ledger-toggle-${event.seq}`}
                          onClick={() => toggleExpanded(event.seq)}
                        >
                          {expanded ? <ChevronDown /> : <ChevronRight />}
                        </Button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-b last:border-b-0">
                        <td colSpan={7} className="bg-muted/40 px-2 py-4">
                          <div
                            data-testid={`ledger-evidence-${event.seq}`}
                            className="bg-card flex flex-col gap-3 rounded-lg border p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-muted-foreground text-xs font-medium uppercase">
                                Event hash
                              </span>
                              <code
                                className="max-w-full truncate rounded-md border px-1.5 py-0.5 font-mono text-xs"
                                title={event.eventHash}
                              >
                                {event.eventHash.slice(0, 24)}…
                              </code>
                            </div>
                            {decision !== null ? (
                              <div className="flex flex-col gap-3">
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
                                      <tr
                                        key={`${signal.source}-${index}`}
                                        className="border-b last:border-b-0"
                                      >
                                        <td className="py-1.5 pr-4">{signal.category}</td>
                                        <td className="py-1.5 pr-4 font-mono text-xs">
                                          {signal.source}
                                        </td>
                                        <td className="py-1.5 pr-4">{signal.status}</td>
                                        <td className="text-muted-foreground py-1.5">
                                          {signal.detail ?? "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <p className="text-muted-foreground text-xs">
                                  Policy:{" "}
                                  <span className="font-mono">{decision.policyVersion}</span>
                                </p>
                              </div>
                            ) : null}
                            <pre className="max-h-72 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
                              {JSON.stringify(event.payload, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
