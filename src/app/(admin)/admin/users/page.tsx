import { Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function AdminUsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">People, roles, and enrollments.</p>
      </div>
      <EmptyState
        icon={Users}
        title="Users"
        description="User management arrives with identity enrollment in Phase 1."
      />
    </div>
  );
}
