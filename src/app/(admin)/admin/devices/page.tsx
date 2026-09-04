import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Smartphone } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import {
  DEVICE_STATE_BADGE_VARIANT,
  DEVICE_STATE_LABEL,
} from "@/app/(student)/student/devices/device-state";
import { getConvexClient } from "@/lib/convex/server-client";

import { DeviceActionButton, ReplacementDecisionButtons } from "./device-actions";

export const dynamic = "force-dynamic";

type DeviceRow = FunctionReturnType<typeof api.devices.listDevices>[number];

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

function DeviceStateBadge({ state }: { state: DeviceRow["state"] }) {
  return <Badge variant={DEVICE_STATE_BADGE_VARIANT[state]}>{DEVICE_STATE_LABEL[state]}</Badge>;
}

export default async function AdminDevicesPage() {
  const session = await getActiveSession();
  if (session === null || session.role !== "admin") {
    return (
      <EmptyState
        icon={Smartphone}
        title="Administrator access required"
        description="Device administration is restricted to administrators."
      />
    );
  }

  const client = getConvexClient();
  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });
  const institution = await client.query(api.users.getMyInstitution, { actorToken });
  if (institution === null) {
    return (
      <EmptyState
        icon={Smartphone}
        title="No institution yet"
        description="Run `bun run seed` against your local Convex backend to create demo data."
      />
    );
  }

  const [devices, requests] = await Promise.all([
    client.query(api.devices.listDevices, { actorToken }),
    client.query(api.devices.listAllReplacementRequests, { actorToken }),
  ]);
  const pendingRequests = requests.filter((request) => request.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Devices"
        description={`Approved attendance devices and lifecycle administration at ${institution.name}.`}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Pending replacement approvals ({pendingRequests.length})
        </h2>
        {pendingRequests.length === 0 ? (
          <p className="text-muted-foreground text-sm">No replacement requests awaiting review.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Current device</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 font-medium">Requested</th>
                  <th className="px-4 py-2 text-right font-medium">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingRequests.map((request) => (
                  <tr key={request._id}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{request.studentName}</span>
                      <span className="text-muted-foreground block font-mono text-xs">
                        {request.studentEmail}
                      </span>
                    </td>
                    <td className="px-4 py-2">{request.oldDeviceLabel}</td>
                    <td className="text-muted-foreground max-w-md truncate px-4 py-2">
                      {request.reason}
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-xs">
                      {formatDate(request.requestedAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <ReplacementDecisionButtons requestId={request._id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">All devices ({devices.length})</h2>
        {devices.length === 0 ? (
          <p className="text-muted-foreground text-sm">No devices registered yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 font-medium">Label</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 font-medium">Registered</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devices.map((device) => (
                  <tr key={device._id}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{device.ownerName}</span>
                      <span className="text-muted-foreground block font-mono text-xs">
                        {device.ownerEmail}
                      </span>
                    </td>
                    <td className="px-4 py-2">{device.label}</td>
                    <td className="px-4 py-2">
                      <DeviceStateBadge state={device.state} />
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-xs">
                      {formatDate(device.registeredAt)}
                    </td>
                    <td className="flex justify-end gap-2 px-4 py-2">
                      {device.state === "enrolled" ? (
                        <DeviceActionButton
                          action="activate"
                          deviceId={device._id}
                          label="Activate"
                        />
                      ) : null}
                      {device.state === "suspended" ? (
                        <DeviceActionButton
                          action="activate"
                          deviceId={device._id}
                          label="Reactivate"
                        />
                      ) : null}
                      {["new", "enrolled", "suspended", "active"].includes(device.state) ? (
                        <DeviceActionButton action="revoke" deviceId={device._id} />
                      ) : null}
                      {device.state === "active" ? (
                        <DeviceActionButton action="suspend" deviceId={device._id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
