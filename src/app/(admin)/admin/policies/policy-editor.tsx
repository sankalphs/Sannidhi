"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_RETENTION_DAYS } from "@/lib/compliance/retention";
import { type PolicySettings, validatePolicySettings } from "@/lib/policies/settings";

type PolicyScope = "institution" | "department" | "venue";

type PolicyEditorProps = {
  scope: PolicyScope;
  title: string;
  description: string;
  settings: PolicySettings | null;
  revision: number | null;
  actorToken: string;
  isAdmin: boolean;
  departmentId?: Id<"departments">;
  venueId?: Id<"venues">;
};

type NumberKey = keyof Pick<
  PolicySettings,
  | "anomalyFlagThreshold"
  | "locationDefaultRadiusMeters"
  | "locationInconclusiveMarginMeters"
  | "locationMaxAccuracyMarginMeters"
  | "retentionDays"
>;

type BooleanKey = keyof Pick<PolicySettings, "stepUpOnWeakDevice" | "strictPresence">;

const NUMBER_FIELDS: { key: NumberKey; label: string; hint: string; scopes: PolicyScope[] }[] = [
  {
    key: "anomalyFlagThreshold",
    label: "Anomaly flag threshold",
    hint: "Security failures before an attempt is flagged for review",
    scopes: ["institution", "department", "venue"],
  },
  {
    key: "locationDefaultRadiusMeters",
    label: "Geofence radius (m)",
    hint: "Default when a venue has no radius of its own",
    scopes: ["institution", "department", "venue"],
  },
  {
    key: "locationInconclusiveMarginMeters",
    label: "Inconclusive margin (m)",
    hint: "Distance past the radius before a fix counts as a mismatch",
    scopes: ["institution", "department", "venue"],
  },
  {
    key: "locationMaxAccuracyMarginMeters",
    label: "Accuracy cap (m)",
    hint: "How much GPS accuracy widens the accepted band",
    scopes: ["institution", "department", "venue"],
  },
  {
    key: "retentionDays",
    label: "Retention (days)",
    hint: "Audit history horizon enforced by the daily ledger sweep",
    scopes: ["institution"],
  },
];

const BOOLEAN_FIELDS: { key: BooleanKey; label: string; hint: string; defaultChecked: boolean }[] =
  [
    {
      key: "stepUpOnWeakDevice",
      label: "Step up on weak device trust",
      hint: "Uncheck to accept weak or missing device signals without a step-up challenge",
      defaultChecked: true,
    },
    {
      key: "strictPresence",
      label: "Strict presence",
      hint: "Location mismatches escalate to faculty review instead of a step-up challenge",
      defaultChecked: false,
    },
  ];

function describeError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (typeof data === "string") return data;
  }
  return "Could not save the policy. Please try again.";
}

/**
 * Sparse editor for one policy layer. Fields left blank stay unset so the
 * layer below (venue → department → institution → built-in defaults) keeps
 * supplying the value; only explicitly entered keys are saved.
 */
export function PolicyEditor({
  scope,
  title,
  description,
  settings,
  revision,
  actorToken,
  isAdmin,
  departmentId,
  venueId,
}: PolicyEditorProps) {
  const router = useRouter();
  const [values, setValues] = useState<Partial<Record<NumberKey, string>>>({});
  const [booleans, setBooleans] = useState<Partial<Record<BooleanKey, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);

  const saveInstitution = useMutation(api.institutionPolicies.saveInstitutionPolicy);
  const saveDepartment = useMutation(api.institutionPolicies.saveDepartmentPolicy);
  const saveVenue = useMutation(api.institutionPolicies.saveVenuePolicy);
  const clearScope = useMutation(api.institutionPolicies.clearPolicyScope);

  const saved: PolicySettings = settings ?? {};
  const hasRow = settings !== null;
  const currentRevision = savedRevision ?? revision;

  function collectSettings(): PolicySettings {
    const next: Record<string, number | boolean> = {};
    for (const field of NUMBER_FIELDS) {
      if (!field.scopes.includes(scope)) continue;
      const raw = values[field.key]?.trim();
      if (raw !== undefined && raw.length > 0) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) next[field.key] = parsed;
      } else if (typeof saved[field.key] === "number") {
        next[field.key] = saved[field.key] as number;
      }
    }
    for (const field of BOOLEAN_FIELDS) {
      const override = booleans[field.key];
      if (override !== undefined) {
        next[field.key] = override;
      } else if (typeof saved[field.key] === "boolean") {
        next[field.key] = saved[field.key] as boolean;
      }
    }
    return next as PolicySettings;
  }

  async function save() {
    if (saving) return;
    const next = collectSettings();
    const issues = validatePolicySettings(next);
    if (issues.length > 0) {
      setError(issues.join("; "));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let result: { revision: number };
      if (scope === "institution") {
        result = await saveInstitution({ actorToken, settings: next });
      } else if (scope === "department") {
        if (departmentId === undefined) throw new Error("Missing department");
        result = await saveDepartment({ actorToken, departmentId, settings: next });
      } else {
        if (venueId === undefined) throw new Error("Missing venue");
        result = await saveVenue({ actorToken, venueId, settings: next });
      }
      setSavedRevision(result.revision);
      router.refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    if (saving) return;
    if (!window.confirm("Clear this policy layer? The layer below takes over immediately.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await clearScope({
        actorToken,
        scope,
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(venueId !== undefined ? { venueId } : {}),
      });
      setSavedRevision(null);
      setValues({});
      setBooleans({});
      router.refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      data-testid={`policy-card-${scope}`}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <div className="flex items-center gap-2" data-testid="policy-card-badge">
          {hasRow ? <Badge variant="secondary">Revision {currentRevision}</Badge> : null}
          {!hasRow ? <Badge variant="outline">defaults</Badge> : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {NUMBER_FIELDS.filter((field) => field.scopes.includes(scope)).map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-sm font-medium">{field.label}</span>
            <Input
              type="number"
              value={
                values[field.key] ??
                (typeof saved[field.key] === "number" ? String(saved[field.key]) : "")
              }
              disabled={!isAdmin}
              placeholder="inherited"
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
            <span className="text-muted-foreground text-xs">
              {field.key === "retentionDays" && typeof saved.retentionDays !== "number"
                ? `Default ${DEFAULT_RETENTION_DAYS} days`
                : field.hint}
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-2">
        {BOOLEAN_FIELDS.map((field) => (
          <label key={field.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="accent-primary mt-0.5 size-4"
              disabled={!isAdmin}
              checked={
                booleans[field.key] ??
                (typeof saved[field.key] === "boolean"
                  ? (saved[field.key] as boolean)
                  : field.defaultChecked)
              }
              onChange={(event) =>
                setBooleans((current) => ({ ...current, [field.key]: event.target.checked }))
              }
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{field.label}</span>
              <span className="text-muted-foreground text-xs">{field.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            Save {scope} policy
          </Button>
          {hasRow ? (
            <Button size="sm" variant="outline" onClick={clearOverride} disabled={saving}>
              Clear override
            </Button>
          ) : null}
          {savedRevision !== null ? (
            <span className="text-muted-foreground text-xs">
              Saved as revision {savedRevision} — decisions now stamp{" "}
              <code>risk-engine/v1+policy:{savedRevision}</code>
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
