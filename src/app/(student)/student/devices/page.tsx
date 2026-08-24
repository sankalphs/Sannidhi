import { api } from "../../../../../convex/_generated/api";
import { Smartphone } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

import { BiometricsCard } from "./biometrics-card";
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
  const [devicesResult, requestsResult, recordResult] = await Promise.allSettled([
    client.query(api.devices.listMyDevices, { actorToken }),
    client.query(api.devices.listMyReplacementRequests, { actorToken }),
    client.query(api.enrollment.getMyBiometricRecord, { actorToken }),
  ]);
  const loadFailed = devicesResult.status === "rejected" || requestsResult.status === "rejected";
  if (loadFailed) {
    console.error(
      "[student-devices] device query failed",
      devicesResult.status === "rejected"
        ? devicesResult.reason
        : requestsResult.status === "rejected"
          ? requestsResult.reason
          : undefined,
    );
  }
  if (recordResult.status === "rejected") {
    console.error("[student-devices] biometric record query failed", recordResult.reason);
  }
  const devices = devicesResult.status === "fulfilled" ? devicesResult.value : [];
  const requests = requestsResult.status === "fulfilled" ? requestsResult.value : [];
  const biometricRecord = recordResult.status === "fulfilled" ? recordResult.value : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Student panel"
        title="Devices"
        description="The approved personal device you use for attendance check-in."
      />
      {loadFailed ? (
        <EmptyState
          icon={Smartphone}
          title="Could not load your devices"
          description="Something went wrong while loading your devices. Please refresh the page and try again."
        />
      ) : (
        <DeviceManager initialDevices={devices} initialRequests={requests} />
      )}
      {recordResult.status === "rejected" ? (
        <EmptyState
          icon={Smartphone}
          title="Could not load your biometric settings"
          description="Something went wrong while loading your biometric consent status. Please refresh the page and try again."
        />
      ) : (
        <BiometricsCard initialRecord={biometricRecord} />
      )}
    </div>
  );
}
