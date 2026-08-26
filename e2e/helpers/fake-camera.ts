import type { BrowserContext, Page } from "@playwright/test";

type CameraTarget = BrowserContext | Page;

type FakeCameraMode = "animated" | "static" | "denied";

/**
 * Canvas constants are tuned against src/lib/biometry/constants.ts:
 * - The large stable circle dominates the 24x24 grayscale embedding, so
 *   enrollment and verification captures stay far above FACE_MATCH_THRESHOLD.
 * - The orbiting dot jumps far enough per paint that pairwise motion between
 *   captured frames stays above LIVENESS_MOTION_FLOOR (0.004).
 * - The static variant repaints identical pixels every draw, so its motion
 *   score stays ~0 and liveness classifies as a spoof.
 */
function cameraInitScript(): (injectedMode: FakeCameraMode) => void {
  return (injectedMode: FakeCameraMode): void => {
    const WIDTH = 320;
    const HEIGHT = 240;
    const CIRCLE_RADIUS = 62;
    const DOT_RADIUS = 26;
    const ORBIT_RADIUS = 84;
    const ORBIT_STEP_RADIANS = 0.8;
    const PAINT_INTERVAL_MS = 66;

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d");
    if (context === null) return;

    let frame = 0;
    const drawFrame = (): void => {
      frame += 1;
      context.fillStyle = "#0b0b0b";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = "#f0f0f0";
      context.beginPath();
      context.arc(WIDTH / 2, HEIGHT / 2, CIRCLE_RADIUS, 0, Math.PI * 2);
      context.fill();
      if (injectedMode === "animated") {
        const angle = frame * ORBIT_STEP_RADIANS;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(
          WIDTH / 2 + ORBIT_RADIUS * Math.cos(angle),
          HEIGHT / 2 + ORBIT_RADIUS * Math.sin(angle),
          DOT_RADIUS,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    };
    drawFrame();

    navigator.mediaDevices.getUserMedia = () =>
      injectedMode === "denied"
        ? Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
        : // A fresh track per call: FaceCapture stops tracks after each
          // capture, so the next capture must receive a live one.
          Promise.resolve(canvas.captureStream(15));
    setInterval(drawFrame, PAINT_INTERVAL_MS);

    const permissions = navigator.permissions;
    if (permissions === undefined) return;
    const originalQuery = permissions.query.bind(permissions);
    permissions.query = (descriptor?: PermissionDescriptor): Promise<PermissionStatus> => {
      if (descriptor !== undefined && descriptor.name === "camera") {
        return Promise.resolve({
          name: descriptor.name,
          state: injectedMode === "denied" ? "denied" : "granted",
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as unknown as PermissionStatus);
      }
      return originalQuery(descriptor as PermissionDescriptor);
    };
  };
}

async function installCamera(target: CameraTarget, mode: FakeCameraMode): Promise<void> {
  await (target as BrowserContext).addInitScript(cameraInitScript(), mode);
}

/** Stable circle + orbiting dot: embeddings match across captures and pass liveness. */
export function installAnimatedCamera(target: CameraTarget): Promise<void> {
  return installCamera(target, "animated");
}

/** Identical frames on every draw: motion score ~0 -> spoof_suspected. */
export function installStaticCamera(target: CameraTarget): Promise<void> {
  return installCamera(target, "static");
}

/** getUserMedia rejects with NotAllowedError. */
export function installDeniedCamera(target: CameraTarget): Promise<void> {
  return installCamera(target, "denied");
}
