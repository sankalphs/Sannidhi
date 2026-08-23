import { BookOpen, Landmark, Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="text-muted-foreground text-sm">Directory, academics, and policy controls.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <EmptyState
          icon={Users}
          title="Users"
          description="People, roles, and enrollments will be managed here."
        />
        <EmptyState
          icon={BookOpen}
          title="Courses & sections"
          description="Course catalog and section rosters will live here."
        />
        <EmptyState
          icon={Landmark}
          title="Policies"
          description="Attendance thresholds and step-up rules will be configured here."
        />
      </div>
    </div>
  );
}
