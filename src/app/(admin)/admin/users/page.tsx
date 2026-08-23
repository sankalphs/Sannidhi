import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { getCachedConvexClient } from "@/lib/convex/server-client";

import { ImportPanel } from "./import-panel";
import { RevokeButton } from "./revoke-button";

type UserRow = FunctionReturnType<typeof api.users.listUsers>[number];

type InviteRow = FunctionReturnType<typeof api.invites.listInvites>[number];

function formatRole(role: string): string {
  return role.replace("_", " ");
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function UserStatusBadge({ status }: { status: UserRow["status"] }) {
  if (status === "invited") return <Badge variant="secondary">invited</Badge>;
  if (status === "suspended") return <Badge variant="destructive">suspended</Badge>;
  return <Badge>active</Badge>;
}

function InviteStatusBadge({ status }: { status: InviteRow["status"] }) {
  if (status === "pending") return <Badge variant="secondary">pending</Badge>;
  if (status === "accepted") return <Badge>accepted</Badge>;
  if (status === "expired") return <Badge variant="outline">expired</Badge>;
  return <Badge variant="destructive">revoked</Badge>;
}

export default async function AdminUsersPage() {
  const client = getCachedConvexClient();
  const institution = await client.query(api.users.getDefaultInstitution, {});

  if (institution === null) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm">People, roles, and enrollments.</p>
        </div>
        <EmptyState
          icon={Users}
          title="No institution yet"
          description="Run `bun run seed` against your local Convex backend to create demo data."
        />
      </div>
    );
  }

  const [users, invites] = await Promise.all([
    client.query(api.users.listUsers, { institutionId: institution._id }),
    client.query(api.invites.listInvites, { institutionId: institution._id }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pendingInvites = invites.filter((invite) => invite.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          People, roles, and enrollments at {institution.name}.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Directory ({users.length})</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user._id}>
                  <td className="px-4 py-2 font-medium">{user.name}</td>
                  <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                    {user.email}
                  </td>
                  <td className="px-4 py-2">{formatRole(user.role)}</td>
                  <td className="px-4 py-2">
                    <UserStatusBadge status={user.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pending invites ({pendingInvites.length})</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invites.map((invite) => (
                <tr key={invite.inviteId}>
                  <td className="px-4 py-2 font-mono text-xs">{invite.email}</td>
                  <td className="px-4 py-2">{formatRole(invite.role)}</td>
                  <td className="px-4 py-2">
                    <InviteStatusBadge status={invite.status} />
                  </td>
                  <td className="text-muted-foreground px-4 py-2">
                    {formatDate(invite.expiresAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {invite.status === "pending" ? (
                      <RevokeButton inviteId={invite.inviteId} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Invite people</h2>
        <ImportPanel
          institutionId={institution._id}
          existingEmails={users.map((user) => user.email)}
          appUrl={appUrl}
        />
      </section>
    </div>
  );
}
