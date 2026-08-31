"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatReasonCode } from "@/lib/analytics/labels";
import { describeConvexError, type ErrorTranslation } from "@/lib/client/describe-error";

type ReviewAlertRow = {
  id: Id<"review_alerts">;
  kind: "low_attendance" | "proxy_attempt" | "verification_anomaly";
  status: "open" | "acknowledged" | "dismissed";
  studentId: Id<"users"> | null;
  studentName: string | null;
  studentEmail: string | null;
  factors: string[];
  detectedAt: number;
  resolvedAt: number | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
};

const KIND_BADGES: Record<
  ReviewAlertRow["kind"],
  { label: string; variant: "secondary" | "destructive" | "outline" }
> = {
  low_attendance: { label: "Low attendance", variant: "secondary" },
  proxy_attempt: { label: "Proxy attempt", variant: "destructive" },
  verification_anomaly: { label: "Verification anomaly", variant: "outline" },
};

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

const ERROR_TRANSLATIONS: ErrorTranslation = [
  { match: "unauthorized", message: "You are not authorized to resolve this alert." },
  { match: "alert_not_found", message: "This alert no longer exists." },
  { match: "alert_not_open", message: "This alert was already resolved." },
];

function describeError(cause: unknown): string {
  return describeConvexError(cause, ERROR_TRANSLATIONS, "Could not record the decision. Please try again.");
}

/**
 * Live review inbox: server-fetched rows render immediately while the convex
 * subscription keeps them in sync; acknowledge/dismiss actions stay per-row.
 */
export function ReviewInbox({
  initialRows,
  actorToken,
  canScan,
}: {
  initialRows: ReviewAlertRow[];
  actorToken: string;
  canScan: boolean;
}) {
  const router = useRouter();
  const liveRows = useQuery(api.reviewAlerts.listReviewAlerts, { actorToken });
  const resolveAlert = useMutation(api.reviewAlerts.resolveReviewAlert);
  const runScan = useMutation(api.reviewAlerts.triggerScan);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const rows = liveRows ?? initialRows;
  const openCount = rows.filter((row) => row.status === "open").length;
  const acknowledgedCount = rows.filter((row) => row.status === "acknowledged").length;
  const dismissedCount = rows.filter((row) => row.status === "dismissed").length;

  async function decide(alertId: Id<"review_alerts">, decision: "acknowledge" | "dismiss") {
    if (pendingId !== null) return;
    setPendingId(alertId);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[alertId];
      return next;
    });
    try {
      await resolveAlert({ actorToken, alertId, decision });
      router.refresh();
    } catch (cause) {
      setRowErrors((current) => ({ ...current, [alertId]: describeError(cause) }));
    } finally {
      setPendingId(null);
    }
  }

  async function triggerScan() {
    if (scanning) return;
    setScanning(true);
    setScanResult(null);
    try {
      const result = await runScan({ actorToken });
      setScanResult(`Scan created ${result.alertsCreated} alerts`);
      router.refresh();
    } catch {
      setScanResult("Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm" data-testid="inbox-summary">
          {openCount} open · {acknowledgedCount} acknowledged · {dismissedCount} dismissed
        </p>
        {canScan ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="run-scan"
            disabled={scanning}
            onClick={() => void triggerScan()}
          >
            {scanning ? "Scanning…" : "Run scan"}
          </Button>
        ) : null}
        {scanResult !== null ? (
          <span className="text-sm" role="status" data-testid="scan-result">
            {scanResult}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No alerts"
          description={
            canScan
              ? "The daily scan routes early-warning alerts here. Run a scan to check now."
              : "The daily scan routes early-warning alerts here. Ask an administrator to run a scan."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Factors</th>
                <th className="px-4 py-2 font-medium">Detected</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Resolved</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} data-testid="review-alert-row" data-kind={row.kind}>
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {row.studentName ?? <span className="text-muted-foreground">—</span>}
                      </span>
                      {row.studentEmail !== null ? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {row.studentEmail}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={KIND_BADGES[row.kind].variant}>
                      {KIND_BADGES[row.kind].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {row.factors.length > 0 ? (
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {row.factors.map((factor) => (
                          <Badge key={factor} variant="outline">
                            {formatReasonCode(factor)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                    {formatDate(row.detectedAt)}
                  </td>
                  <td className="px-4 py-2">
                    {row.status === "open" ? (
                      <Badge>open</Badge>
                    ) : row.status === "acknowledged" ? (
                      <Badge variant="secondary">acknowledged</Badge>
                    ) : (
                      <Badge variant="outline">dismissed</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {row.resolvedByName !== null && row.resolvedAt !== null ? (
                      <div className="flex flex-col">
                        <span>{row.resolvedByName}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {formatDate(row.resolvedAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {row.status === "open" ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="xs"
                            data-testid="acknowledge-alert"
                            disabled={pendingId !== null}
                            onClick={() => void decide(row.id, "acknowledge")}
                          >
                            Acknowledge
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            data-testid="dismiss-alert"
                            disabled={pendingId !== null}
                            onClick={() => void decide(row.id, "dismiss")}
                          >
                            Dismiss
                          </Button>
                        </div>
                        {rowErrors[row.id] !== undefined ? (
                          <span className="text-verdict-flag text-xs" data-testid="alert-error">
                            {rowErrors[row.id]}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
