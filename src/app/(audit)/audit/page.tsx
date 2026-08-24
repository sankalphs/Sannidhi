import { ScrollText } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Auditor panel"
        title="Audit dashboard"
        description="Read-only visibility into system events."
      />
      <EmptyState
        icon={ScrollText}
        title="Event ledger"
        description="An append-only, hash-chained trail of attendance decisions and administrative actions will stream in here."
        action={
          <Link href="/audit/events" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open the ledger
          </Link>
        }
      />
    </div>
  );
}
