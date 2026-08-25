import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function AdminCoursesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Courses & sections"
        description="Course catalog and section rosters."
      />
      <EmptyState
        icon={BookOpen}
        title="Courses & sections"
        description="Course and section management is on the roadmap. Seeded courses already power timetables, class sessions, and the event ledger."
      />
    </div>
  );
}
