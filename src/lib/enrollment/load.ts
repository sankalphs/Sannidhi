import { api } from "../../../convex/_generated/api";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import type { EnrollmentGateResult, MissingEnrollmentStep } from "@/lib/enrollment/gate";
import { ENROLLMENT_STEPS } from "@/lib/enrollment/ui";

export const FULLY_LOCKED: EnrollmentGateResult = {
  locked: true,
  completedSteps: { account: false, passkey: false, device: false },
  missingSteps: [...ENROLLMENT_STEPS],
  biometricConsentRecorded: false,
};

export async function loadEnrollmentGate(): Promise<EnrollmentGateResult> {
  const session = await getActiveSession();
  if (session === null) return FULLY_LOCKED;
  try {
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
    return await getConvexClient().query(api.enrollment.getMyEnrollmentStatus, { actorToken });
  } catch {
    return FULLY_LOCKED;
  }
}

export async function loadMissingEnrollmentSteps(): Promise<MissingEnrollmentStep[]> {
  const gate = await loadEnrollmentGate();
  return gate.locked ? [...gate.missingSteps] : [];
}
