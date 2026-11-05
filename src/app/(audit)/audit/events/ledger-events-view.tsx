"use client";

import { api } from "../../../../../convex/_generated/api";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2, ScrollText, ShieldCheck } from "lucide-react";
import { Component, type FormEvent, type ReactNode, useState } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { institutionDayStartMs } from "@/lib/format/datetime";
import {
  LEDGER_CATEGORY_LABEL,
  LEDGER_DISPLAY_CATEGORIES,
  type LedgerDisplayCategory,
} from "@/lib/format/ledger";

import { AttendanceList, LedgerList } from "./history-lists";

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

const MAX_CHAIN_WINDOWS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

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

type View = "ledger" | "attendance";

const ATTENDANCE_STATES = [
  ["verified", "Verified"],
  ["flagged", "Flagged"],
  ["rejected", "Rejected"],
  ["step_up", "Step-up"],
  ["corrected", "Corrected"],
] as const;
type AttendanceState = (typeof ATTENDANCE_STATES)[number][0];

/** What the filter form holds; empty strings mean "any". Dates are institution-clock days. */
type FilterDraft = {
  category: LedgerDisplayCategory | "";
  type: string;
  state: AttendanceState | "";
  person: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: FilterDraft = {
  category: "",
  type: "",
  state: "",
  person: "",
  from: "",
  to: "",
};

/** Query arguments shared by both lists; omits empty fields so the defaults apply. */
function sharedFilters(draft: FilterDraft) {
  const fromMs = institutionDayStartMs(draft.from);
  const toStart = institutionDayStartMs(draft.to);
  return {
    ...(draft.person.trim() ? { person: draft.person.trim() } : {}),
    ...(fromMs !== undefined ? { fromMs } : {}),
    ...(toStart !== undefined ? { toMs: toStart + DAY_MS } : {}),
  };
}

const SELECT_CLASS =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

function LedgerEventsViewInner({ actorToken }: { actorToken: string }) {
  const convex = useConvex();
  const [view, setView] = useState<View>("ledger");
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTERS);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [verifyingAttendanceChain, setVerifyingAttendanceChain] = useState(false);
  const [attendanceChainStatus, setAttendanceChainStatus] = useState<ChainStatus | null>(null);

  const ledgerFilters = {
    ...sharedFilters(applied),
    ...(applied.category ? { category: applied.category } : {}),
    ...(applied.type.trim() ? { type: applied.type.trim() } : {}),
  };
  const attendanceFilters = {
    ...sharedFilters(applied),
    ...(applied.state ? { state: applied.state } : {}),
  };
  const activeFilters = view === "ledger" ? ledgerFilters : attendanceFilters;
  const filtered = Object.keys(activeFilters).length > 0;

  function update<K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied(draft);
  }

  function reset() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
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
            Administrative, security and session events, in one hash chain.
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
            Every check-in decision (verified, flagged, corrected…), kept in a separate chain — so
            its count differs from the ledger&apos;s.
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

      <div className="flex flex-col gap-4">
        <div className="bg-muted/50 flex w-fit gap-1 rounded-lg p-1" role="group" aria-label="Show">
          {(
            [
              ["ledger", "Ledger events"],
              ["attendance", "Attendance records"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? "secondary" : "ghost"}
              aria-pressed={view === value}
              data-testid={`history-view-${value}`}
              onClick={() => setView(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <form
          onSubmit={apply}
          className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Filters"
        >
          {view === "ledger" ? (
            <>
              <label className="flex flex-col gap-1.5 text-xs font-medium">
                Category
                <select
                  className={SELECT_CLASS}
                  value={draft.category}
                  onChange={(event) =>
                    update("category", event.target.value as FilterDraft["category"])
                  }
                >
                  <option value="">All categories</option>
                  {LEDGER_DISPLAY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {LEDGER_CATEGORY_LABEL[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium">
                Event type
                <Input
                  value={draft.type}
                  placeholder="e.g. stepup, invite"
                  onChange={(event) => update("type", event.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              Decision
              <select
                className={SELECT_CLASS}
                value={draft.state}
                onChange={(event) => update("state", event.target.value as FilterDraft["state"])}
              >
                <option value="">All decisions</option>
                {ATTENDANCE_STATES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Person
            <Input
              value={draft.person}
              placeholder="Name or email"
              onChange={(event) => update("person", event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            From
            <Input
              type="date"
              value={draft.from}
              onChange={(event) => update("from", event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            To
            <Input
              type="date"
              value={draft.to}
              onChange={(event) => update("to", event.target.value)}
            />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" data-testid="history-apply-filters">
              Apply filters
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>
        </form>

        {view === "ledger" ? (
          <LedgerList
            key={JSON.stringify(ledgerFilters)}
            actorToken={actorToken}
            filters={ledgerFilters}
            filtered={filtered}
          />
        ) : (
          <AttendanceList
            key={JSON.stringify(attendanceFilters)}
            actorToken={actorToken}
            filters={attendanceFilters}
            filtered={filtered}
          />
        )}
      </div>
    </div>
  );
}
