import type { DeviceState } from "@/lib/devices/lifecycle";

export const DEVICE_STATE_LABEL: Record<DeviceState, string> = {
  new: "New",
  enrolled: "Enrolled",
  active: "Active",
  suspended: "Suspended",
  revoked: "Revoked",
  replaced: "Replaced",
};

export const DEVICE_STATE_BADGE_VARIANT: Record<
  DeviceState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  new: "outline",
  enrolled: "secondary",
  active: "default",
  suspended: "destructive",
  revoked: "destructive",
  replaced: "outline",
};

export type DeviceListItem = {
  _id: string;
  label: string;
  platform: string | null;
  state: DeviceState;
  stateReason: string | null;
  registeredAt: number;
  activatedAt: number | null;
  replacesDeviceId: string | null;
};

export type ReplacementRequestItem = {
  _id: string;
  oldDeviceId: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: number;
  decidedAt: number | null;
  successorDeviceId: string | null;
};

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
