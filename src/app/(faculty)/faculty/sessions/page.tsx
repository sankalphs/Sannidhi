import { GraduationCap } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function FacultySessionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class sessions</h1>
        <p className="text-muted-foreground text-sm">Start and monitor your sessions.</p>
      </div>
      <EmptyState
        icon={GraduationCap}
        title="Class sessions"
        description="Session control arrives with rotating QR check-in in Phase 2."
      />
    </div>
  );
}
