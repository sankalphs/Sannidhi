import { api } from "../../../../../convex/_generated/api";
import { Smartphone } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

import { DeviceManager } from "./device-manager";

export const dynamic = "force-dynamic";

export default async function StudentDevicesPage() {
  const session = await getActiveSession();
  if (session === null) {
    return (
      <EmptyState
        icon={Smartphone}
        title="Sign in required"
        description="Sign in with your passkey to manage your attendance device."
      />
    );
  }

  const client = getConvexClient();
  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });
  const [devices, requests] = await Promise.all([
    client.query(api.devices.listMyDevices, { actorToken }),
    client.query(api.devices.listMyReplacementRequests, { actorToken }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="text-muted-foreground text-sm">
          The approved personal device you use for attendance check-in.
        </p>
      </div>
      <DeviceManager initialDevices={devices} initialRequests={requests} />
    </div>
  );
}
