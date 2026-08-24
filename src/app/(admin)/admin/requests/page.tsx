import { Inbox, type LucideIcon } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

import { ReviewButton } from "./review-button";

const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  faculty: "Faculty",
  department_authority: "Department authority",
  other: "Other",
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export default async function AdminAccessRequestsPage() {
  const session = await getActiveSession();
  if (session === null || session.role !== "admin") {
    return (
      <EmptyState
        icon={Inbox}
        title="Administrator access required"
        description="Access requests are visible to administrators only."
      />
    );
  }

  const client = getConvexClient();
  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });
  const requests = await client.query(api.accessRequests.list, { actorToken });
  const newCount = requests.filter((request) => request.status === "new").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Access requests"
        description="Institutions asking to onboard onto Sannidhi. Review, then reach out from your own inbox."
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={Inbox as LucideIcon}
          title="No requests yet"
          description="Requests submitted from the public access form will appear here."
        />
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Queue ({newCount} new · {requests.length} total)
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Institution</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                  <th className="px-4 py-2 font-medium">Submitted</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((request) => (
                  <tr key={request.id} data-testid="access-request-row">
                    <td className="px-4 py-2 font-medium">{request.institution}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span>{request.name}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {request.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">{ROLE_LABELS[request.requestedRole]}</td>
                    <td className="text-muted-foreground max-w-56 truncate px-4 py-2 text-xs">
                      {request.note ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                      {formatDate(request.submittedAt)}
                    </td>
                    <td className="px-4 py-2">
                      {request.status === "new" ? (
                        <Badge>new</Badge>
                      ) : (
                        <Badge variant="secondary">reviewed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {request.status === "new" ? (
                        <ReviewButton requestId={request.id} />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
