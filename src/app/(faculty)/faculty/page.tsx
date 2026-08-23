import { Presentation } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function FacultyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Faculty dashboard</h1>
        <p className="text-muted-foreground text-sm">Run and review your class sessions.</p>
      </div>
      <EmptyState
        icon={Presentation}
        title="Class sessions"
        description="No active session. Start one from your timetable when class begins."
      />
    </div>
  );
}
