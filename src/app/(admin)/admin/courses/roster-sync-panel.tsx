"use client";

import { api } from "../../../../../convex/_generated/api";
import { useConvex, useMutation } from "convex/react";
import { FileUp, Loader2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RosterDiff } from "@/lib/roster/types";
import { parseRosterCsv } from "@/lib/roster/csv";

type ApplyResult = {
  departmentsCreated: number;
  coursesCreated: number;
  coursesUpdated: number;
  sectionsCreated: number;
  enrollmentsCreated: number;
  enrollmentsExisting: number;
  invitesCreated: number;
  issues: { row: number; field: string; message: string }[];
};

function describeError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (typeof data === "string") return data;
  }
  return "Roster sync failed. Please try again.";
}

/**
 * SIS/LMS roster sync: paste or upload a CSV, preview the exact diff against
 * the institution's catalog, then apply it idempotently. Students without an
 * account receive invites; nothing existing is ever overwritten.
 */
export function RosterSyncPanel({ actorToken, isAdmin }: { actorToken: string; isAdmin: boolean }) {
  const router = useRouter();
  const convex = useConvex();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<RosterDiff | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySync = useMutation(api.rosterSync.applyRosterSync);

  const parsed = useMemo(() => parseRosterCsv(csvText), [csvText]);
  const hasRows = parsed.rows.length > 0;

  async function loadSample() {
    setError(null);
    setPreview(null);
    setApplied(null);
    try {
      const response = await fetch("/samples/roster-sample.csv");
      if (!response.ok) throw new Error("Sample dataset could not be loaded");
      setCsvText(await response.text());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sample dataset could not be loaded");
    }
  }

  async function runPreview() {
    if (previewing || !hasRows) return;
    setPreviewing(true);
    setError(null);
    setPreview(null);
    setApplied(null);
    try {
      const result = await convex.query(api.rosterSync.previewRosterSync, {
        actorToken,
        rows: parsed.rows,
      });
      setPreview(result.diff);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPreviewing(false);
    }
  }

  async function apply() {
    if (applying || !hasRows) return;
    setApplying(true);
    setError(null);
    try {
      const result = await applySync({ actorToken, rows: parsed.rows });
      setApplied(result as ApplyResult);
      setPreview(null);
      setCsvText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div>
        <h2 className="text-lg font-semibold">Roster sync (SIS/LMS)</h2>
        <p className="text-muted-foreground text-sm">
          Sync an external roster export against the catalog — departments, courses, sections,
          enrollments, and invites for students without accounts. Applying is idempotent: rows
          already in the catalog are counted, never duplicated. Up to 500 rows per sync.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-sm">
          <FileUp className="size-4" />
          Choose CSV file
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setCsvText(await file.text());
            }}
          />
        </label>
        <Button variant="outline" size="sm" onClick={loadSample} disabled={previewing || applying}>
          Load sample dataset
        </Button>
        <Button size="sm" onClick={runPreview} disabled={!hasRows || previewing || applying}>
          {previewing ? <Loader2 className="animate-spin" /> : null}
          Preview sync
        </Button>
        {isAdmin ? (
          <Button size="sm" onClick={apply} disabled={!hasRows || applying}>
            {applying ? <Loader2 className="animate-spin" /> : null}
            Apply sync
          </Button>
        ) : null}
      </div>

      <textarea
        value={csvText}
        onChange={(event) => setCsvText(event.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={
          "department_code,department_name,course_code,course_title,section_name,term,student_email,student_name,usn"
        }
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px]"
      />

      {parsed.issues.length > 0 ? (
        <ul className="text-destructive flex list-disc flex-col gap-1 pl-5 text-xs">
          {parsed.issues.slice(0, 10).map((issue, index) => (
            <li key={`${issue.row}-${issue.field}-${index}`}>
              Row {issue.row} ({issue.field}): {issue.message}
            </li>
          ))}
          {parsed.issues.length > 10 ? <li>… {parsed.issues.length - 10} more</li> : null}
        </ul>
      ) : null}

      {hasRows ? (
        <p className="text-muted-foreground text-xs">
          {parsed.rows.length} valid row{parsed.rows.length === 1 ? "" : "s"} ready
          {parsed.issues.length > 0 ? `, ${parsed.issues.length} dropped` : ""}.
        </p>
      ) : null}

      {error ? (
        <p className="text-destructive flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4" />
          {error}
        </p>
      ) : null}

      {preview !== null ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
          <h3 className="font-semibold">Preview</h3>
          <div className="flex flex-wrap gap-2">
            {preview.departmentsToCreate.length > 0 ? (
              <Badge variant="secondary">
                {preview.departmentsToCreate.length} new department
                {preview.departmentsToCreate.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {preview.coursesToCreate.length > 0 ? (
              <Badge variant="secondary">
                {preview.coursesToCreate.length} new course
                {preview.coursesToCreate.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {preview.coursesToUpdate.length > 0 ? (
              <Badge variant="outline">
                {preview.coursesToUpdate.length} course update
                {preview.coursesToUpdate.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {preview.sectionsToCreate.length > 0 ? (
              <Badge variant="secondary">
                {preview.sectionsToCreate.length} new section
                {preview.sectionsToCreate.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {preview.enrollmentsToCreate.length > 0 ? (
              <Badge variant="secondary">
                {preview.enrollmentsToCreate.length} new enrollment
                {preview.enrollmentsToCreate.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {preview.enrollmentsExisting > 0 ? (
              <Badge variant="outline">{preview.enrollmentsExisting} already enrolled</Badge>
            ) : null}
            {preview.pendingInviteEmails.length > 0 ? (
              <Badge variant="destructive">
                {preview.pendingInviteEmails.length} student
                {preview.pendingInviteEmails.length === 1 ? "" : "s"} to invite
              </Badge>
            ) : null}
          </div>

          {preview.departmentsToCreate.length > 0 ? (
            <div className="text-sm">
              <span className="text-muted-foreground">Departments: </span>
              {preview.departmentsToCreate.map((dept) => `${dept.code} (${dept.name})`).join(", ")}
            </div>
          ) : null}

          {preview.pendingInviteEmails.length > 0 ? (
            <div className="text-sm">
              <span className="text-muted-foreground">Invite emails: </span>
              <span className="font-mono text-xs">{preview.pendingInviteEmails.join(", ")}</span>
            </div>
          ) : null}

          {preview.droppedRows.length > 0 ? (
            <ul className="text-destructive list-disc pl-5 text-xs">
              {preview.droppedRows.map((issue, index) => (
                <li key={`${issue.row}-${index}`}>
                  Row {issue.row} ({issue.field}): {issue.message}
                </li>
              ))}
            </ul>
          ) : null}

          {!isAdmin ? (
            <p className="text-muted-foreground text-xs">
              Preview only — institution administrators apply roster syncs.
            </p>
          ) : null}
        </div>
      ) : null}

      {applied !== null ? (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <h3 className="font-semibold">Sync applied</h3>
          <div className="flex flex-wrap gap-2">
            <Badge>{applied.departmentsCreated} departments</Badge>
            <Badge>{applied.coursesCreated} courses created</Badge>
            {applied.coursesUpdated > 0 ? (
              <Badge variant="outline">{applied.coursesUpdated} courses updated</Badge>
            ) : null}
            <Badge>{applied.sectionsCreated} sections</Badge>
            <Badge>{applied.enrollmentsCreated} enrollments</Badge>
            <Badge variant="outline">{applied.enrollmentsExisting} already enrolled</Badge>
            <Badge>{applied.invitesCreated} invites</Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Invites are pending on the Users page — each student receives a one-time enrollment
            link.
          </p>
        </div>
      ) : null}
    </section>
  );
}
