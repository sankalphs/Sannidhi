"use client";

import { Check, Copy, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLES, type Role } from "@/lib/auth/session";
import { parseInviteCsv } from "@/lib/invites/csv";

type CreatedInvite = {
  email: string;
  userId: string | null;
  inviteId: string;
  token: string;
};

type ImportPanelProps = {
  institutionId: string;
  existingEmails: string[];
  appUrl: string;
};

export function ImportPanel({ institutionId, existingEmails, appUrl }: ImportPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState("");
  const [singleEmail, setSingleEmail] = useState("");
  const [singleName, setSingleName] = useState("");
  const [singleRole, setSingleRole] = useState<Role>("student");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvite[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const parsed = useMemo(
    () => parseInviteCsv(csvText, { existingEmails }),
    [csvText, existingEmails],
  );

  async function submit(invites: { email: string; name: string; role: Role }[]) {
    setSubmitting(true);
    setError(null);
    setCreated([]);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId, invites }),
      });
      const data = (await response.json()) as { invites?: CreatedInvite[]; error?: string };
      if (!response.ok || !data.invites) {
        throw new Error(data.error ?? "Invite request failed");
      }
      setCreated(data.invites);
      setCsvText("");
      setSingleEmail("");
      setSingleName("");
      setSingleRole("student");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invite request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(`${appUrl}/invite/${token}`);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 1500);
    } catch {
      setError("Clipboard access was denied. Copy the link manually instead.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <div>
            <h2 className="font-semibold">Bulk import</h2>
            <p className="text-muted-foreground text-sm">
              Upload or paste CSV with header <code className="text-xs">email,name,role</code>.
            </p>
          </div>
          <label className="text-muted-foreground hover:text-foreground flex w-fit cursor-pointer items-center gap-2 text-sm">
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
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"email,name,role\nstudent@sit.edu.in,Student Name,student"}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px]"
          />
          {csvText.trim().length > 0 && parsed.errors.length > 0 ? (
            <ul className="text-destructive flex list-disc flex-col gap-1 pl-5 text-xs">
              {parsed.errors.map((parseError) => (
                <li key={`${parseError.line}-${parseError.reason}`}>
                  Line {parseError.line}: {parseError.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {csvText.trim().length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {parsed.rows.length} valid row{parsed.rows.length === 1 ? "" : "s"} ready
              {parsed.errors.length > 0 ? `, ${parsed.errors.length} with errors` : ""}.
            </p>
          ) : null}
          <Button
            size="sm"
            className="w-fit"
            disabled={submitting || parsed.rows.length === 0}
            onClick={() => submit(parsed.rows)}
          >
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Import {parsed.rows.length > 0 ? parsed.rows.length : ""} invite
            {parsed.rows.length === 1 ? "" : "s"}
          </Button>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <div>
            <h2 className="font-semibold">Single invite</h2>
            <p className="text-muted-foreground text-sm">
              Create one account and get a one-time link.
            </p>
          </div>
          <Input
            type="email"
            placeholder="email@sit.edu.in"
            value={singleEmail}
            onChange={(event) => setSingleEmail(event.target.value)}
          />
          <Input
            placeholder="Full name"
            value={singleName}
            onChange={(event) => setSingleName(event.target.value)}
          />
          <select
            value={singleRole}
            onChange={(event) => setSingleRole(event.target.value as Role)}
            className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role.replace("_", " ")}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            className="w-fit"
            disabled={
              submitting ||
              singleEmail.trim().length === 0 ||
              singleName.trim().length === 0 ||
              existingEmails.includes(singleEmail.trim().toLowerCase())
            }
            onClick={() =>
              submit([{ email: singleEmail.trim(), name: singleName.trim(), role: singleRole }])
            }
          >
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Create invite
          </Button>
        </section>
      </div>

      {error ? (
        <p className="text-destructive flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4" />
          {error}
        </p>
      ) : null}

      {created.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-amber-600" />
            <h2 className="font-semibold">Invite links — shown only once</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Copy these now. The raw tokens are never stored; only their hashes are kept.
          </p>
          <ul className="flex flex-col gap-2">
            {created.map((invite) => (
              <li
                key={invite.inviteId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="min-w-0 truncate font-mono text-xs">
                  {appUrl}/invite/{invite.token}
                </span>
                <span className="flex items-center gap-2">
                  {!invite.userId ? (
                    <span className="text-muted-foreground text-xs">existing user</span>
                  ) : null}
                  <Button variant="outline" size="xs" onClick={() => copyLink(invite.token)}>
                    {copiedToken === invite.token ? <Check /> : <Copy />}
                    {copiedToken === invite.token ? "Copied" : "Copy"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
