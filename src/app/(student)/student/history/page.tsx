import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function StudentHistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance history</h1>
        <p className="text-muted-foreground text-sm">Calendar and subject-wise views.</p>
      </div>
      <EmptyState
        icon={BookOpen}
        title="Attendance history"
        description="Calendar and subject-wise attendance views arrive with sessions in Phase 2."
      />
    </div>
  );
}
