export const DEVICE_STATES = [
  "new",
  "enrolled",
  "active",
  "suspended",
  "revoked",
  "replaced",
] as const;

export type DeviceState = (typeof DEVICE_STATES)[number];

export const DEVICE_TRANSITIONS: Readonly<Record<DeviceState, readonly DeviceState[]>> = {
  new: ["enrolled"],
  enrolled: ["active"],
  active: ["suspended", "revoked", "replaced"],
  suspended: ["active", "revoked"],
  revoked: ["replaced"],
  replaced: [],
};

export type TransitionContext = {
  replacesDeviceId?: boolean;
};

export function canTransition(
  from: DeviceState,
  to: DeviceState,
  ctx?: TransitionContext,
): boolean {
  if (!DEVICE_TRANSITIONS[from]?.includes(to)) return false;
  if (to === "replaced" && ctx?.replacesDeviceId !== true) return false;
  return true;
}

export function assertTransition(
  from: DeviceState,
  to: DeviceState,
  ctx?: TransitionContext,
): void {
  if (canTransition(from, to, ctx)) return;

  if (to === "replaced" && DEVICE_TRANSITIONS[from]?.includes("replaced")) {
    throw new Error(
      `Illegal device transition ${from} -> replaced: a successor device (replacesDeviceId) is required`,
    );
  }
  throw new Error(`Illegal device transition: ${from} -> ${to}`);
}
