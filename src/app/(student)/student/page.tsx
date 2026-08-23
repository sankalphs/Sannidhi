import { History, ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";

export default function StudentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Student dashboard</h1>
        <p className="text-muted-foreground text-sm">Your attendance at a glance.</p>
      </div>
      <EmptyState
        icon={History}
        title="Attendance history"
        description="Once sessions start being recorded, your attendance timeline will appear here."
      />
      <EmptyState
        icon={ClipboardList}
        title="Requests"
        description="Correction and exemption requests you file will show up here."
      />
    </div>
  );
}
