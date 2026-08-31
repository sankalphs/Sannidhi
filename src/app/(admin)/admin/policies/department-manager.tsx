"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Building2, Loader2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeConvexError } from "@/lib/client/describe-error";

type DepartmentRow = {
  id: Id<"departments">;
  code: string;
  name: string;
  createdAt: number;
  courseCount: number;
};

function describeError(cause: unknown): string {
  return describeConvexError(cause, [], "Could not update departments. Please try again.");
}

/**
 * Admin-side department administration: create, rename, and scope
 * department authorities and courses into departments. Membership edits use
 * full-replace semantics through assignUserToDepartments.
 */
export function DepartmentManager({
  departments,
  actorToken,
}: {
  departments: DepartmentRow[];
  actorToken: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createDepartment = useMutation(api.departments.createDepartment);
  const renameDepartment = useMutation(api.departments.renameDepartment);

  async function run(key: string, action: () => Promise<unknown>) {
    if (pending !== null) return;
    setPending(key);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPending(null);
    }
  }

  async function create() {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (trimmedCode.length === 0 || trimmedName.length === 0) {
      setError("Department code and name are required");
      return;
    }
    await run("create", async () => {
      await createDepartment({ actorToken, code: trimmedCode, name: trimmedName });
      setCode("");
      setName("");
    });
  }

  async function rename(departmentId: Id<"departments">) {
    const next = renames[departmentId]?.trim();
    if (!next) return;
    await run(`rename:${departmentId}`, async () => {
      await renameDepartment({ actorToken, departmentId, name: next });
      setRenames((current) => {
        const rest = { ...current };
        delete rest[departmentId];
        return rest;
      });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <h2 className="text-lg font-semibold">Departments</h2>
        <p className="text-muted-foreground text-sm">
          Multi-department administration — create departments and link policy scopes. Assign
          members and courses from the directory below.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Code</span>
          <Input
            className="w-28"
            placeholder="CSE"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <Input
            className="w-64"
            placeholder="Computer Science & Engineering"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <Button size="sm" onClick={create} disabled={pending !== null}>
          {pending === "create" ? <Loader2 className="animate-spin" /> : null}
          Create department
        </Button>
      </div>

      {error ? (
        <p className="text-destructive flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4" />
          {error}
        </p>
      ) : null}

      {departments.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Courses</th>
                <th className="px-4 py-2 font-medium">Rename</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {departments.map((department) => (
                <tr key={department.id}>
                  <td className="px-4 py-2 font-mono text-xs">{department.code}</td>
                  <td className="px-4 py-2">{department.name}</td>
                  <td className="text-muted-foreground px-4 py-2">{department.courseCount}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <Input
                        className="h-8 w-48"
                        placeholder="New name"
                        value={renames[department.id] ?? ""}
                        onChange={(event) =>
                          setRenames((current) => ({
                            ...current,
                            [department.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={
                          pending !== null || (renames[department.id] ?? "").trim().length === 0
                        }
                        onClick={() => rename(department.id)}
                      >
                        {pending === `rename:${department.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : null}
                        Save
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Building2 className="size-4" />
          No departments yet — create the first one above.
        </p>
      )}
    </section>
  );
}
