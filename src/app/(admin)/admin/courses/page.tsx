import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function AdminCoursesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Courses & sections</h1>
        <p className="text-muted-foreground text-sm">Course catalog and section rosters.</p>
      </div>
      <EmptyState
        icon={BookOpen}
        title="Courses & sections"
        description="Academic data management arrives in Phase 1."
      />
    </div>
  );
}
