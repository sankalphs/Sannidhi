import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Landmark } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

import { DepartmentManager } from "./department-manager";
import { PolicyEditor } from "./policy-editor";

type PolicyOverview = FunctionReturnType<typeof api.institutionPolicies.getPolicyOverview>;
type DepartmentRow = FunctionReturnType<typeof api.departments.listDepartments>[number];

export default async function AdminPoliciesPage() {
  const session = await getActiveSession();
  if (session === null || (session.role !== "admin" && session.role !== "department_authority")) {
    return (
      <EmptyState
        icon={Landmark}
        title="Administration access required"
        description="Policy configuration is restricted to institution administrators."
      />
    );
  }

  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });

  let overview: PolicyOverview | null = null;
  let departments: DepartmentRow[] = [];
  try {
    const client = getConvexClient();
    [overview, departments] = await Promise.all([
      client.query(api.institutionPolicies.getPolicyOverview, { actorToken }),
      client.query(api.departments.listDepartments, { actorToken }),
    ]);
  } catch {
    overview = null;
    departments = [];
  }

  if (overview === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Admin" title="Policies" description="Thresholds and step-up rules." />
        <EmptyState
          icon={Landmark}
          title="No institution yet"
          description="Run `bun run seed` against your local Convex backend to create demo data."
        />
      </div>
    );
  }

  const isAdmin = session.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Policies"
        description="Institution defaults, department scopes, and venue presence rules — applied inside the risk engine at decision time."
      />

      {!isAdmin ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          Read-only view — institution administrators configure policies. You are seeing the policy
          layers for your departments.
        </p>
      ) : null}

      <PolicyEditor
        key="institution"
        scope="institution"
        title="Institution defaults"
        description="Baseline risk thresholds for every session. Venue and department layers override these."
        settings={overview.institution?.settings ?? null}
        revision={overview.institution?.revision ?? null}
        actorToken={actorToken}
        isAdmin={isAdmin}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Venue presence rules</h2>
        <p className="text-muted-foreground text-sm">
          Per-venue overrides of geofence defaults. A venue&apos;s own geofence radius always wins
          over the policy default.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {overview.venues.map((venue) => {
            const venuePolicy = overview.venuePolicies.find(
              (policy) => policy.venueId === venue.id,
            );
            return (
              <PolicyEditor
                key={venue.id}
                scope="venue"
                venueId={venue.id}
                title={venue.name}
                description="Presence rule overrides for this venue."
                settings={venuePolicy?.settings ?? null}
                revision={venuePolicy?.revision ?? null}
                actorToken={actorToken}
                isAdmin={isAdmin}
              />
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Department policies</h2>
        <p className="text-muted-foreground text-sm">
          Delegated policy scopes: departments override institution defaults for their own
          courses&apos; sessions.
        </p>
        {departments.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No departments yet"
            description={
              isAdmin
                ? "Create a department below to delegate a policy scope."
                : "No departments are configured yet."
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {departments.map((department) => {
              const departmentPolicy = overview.departmentPolicies.find(
                (policy) => policy.departmentId === department.id,
              );
              return (
                <PolicyEditor
                  key={department.id}
                  scope="department"
                  departmentId={department.id}
                  title={`${department.code} — ${department.name}`}
                  description={`${department.courseCount} course${department.courseCount === 1 ? "" : "s"} linked`}
                  settings={departmentPolicy?.settings ?? null}
                  revision={departmentPolicy?.revision ?? null}
                  actorToken={actorToken}
                  isAdmin={isAdmin}
                />
              );
            })}
          </div>
        )}
      </section>

      {isAdmin ? <DepartmentManager departments={departments} actorToken={actorToken} /> : null}
    </div>
  );
}
