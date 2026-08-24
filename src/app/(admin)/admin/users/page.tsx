import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

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
    timeZone: "Asia/Kolkata",
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
  const session = await getActiveSession();
  if (session === null || session.role !== "admin") {
    return (
      <EmptyState
        icon={Users}
        title="Administrator access required"
        description="User management is restricted to administrators."
      />
    );
  }

  const client = getConvexClient();
  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });
  const institution = await client.query(api.users.getMyInstitution, { actorToken });

  if (institution === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Admin" title="Users" description="People, roles, and enrollments." />
        <EmptyState
          icon={Users}
          title="No institution yet"
          description="Run `bun run seed` against your local Convex backend to create demo data."
        />
      </div>
    );
  }

  const [users, invites] = await Promise.all([
    client.query(api.users.listUsers, { actorToken }),
    client.query(api.invites.listInvites, { actorToken }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pendingInvites = invites.filter((invite) => invite.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description={`People, roles, and enrollments at ${institution.name}.`}
      />

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
              {pendingInvites.map((invite) => (
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
                    <RevokeButton inviteId={invite.inviteId} />
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
