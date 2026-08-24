import { api } from "../../../../convex/_generated/api";
import { Check, Circle, ClipboardList, History } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";
import type { EnrollmentGateResult } from "@/lib/enrollment/gate";
import { ENROLLMENT_STEPS, missingStepCopy } from "@/lib/enrollment/ui";

export const dynamic = "force-dynamic";

const FULLY_LOCKED: EnrollmentGateResult = {
  locked: true,
  completedSteps: { account: false, passkey: false, device: false },
  missingSteps: ["account", "passkey", "device"],
  biometricConsentRecorded: false,
};

async function loadEnrollmentGate(): Promise<EnrollmentGateResult | null> {
  const session = await getActiveSession();
  if (session === null) return null;
  try {
    const client = getConvexClient();
    const actorToken = await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
    return await client.query(api.enrollment.getMyEnrollmentStatus, { actorToken });
  } catch {
    return FULLY_LOCKED;
  }
}

function EnrollmentChecklist({
  completedSteps,
}: {
  completedSteps: EnrollmentGateResult["completedSteps"];
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Enrollment checklist</h2>
        <Badge variant="secondary">Attendance locked</Badge>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {ENROLLMENT_STEPS.map((step) => (
          <li key={step} className="flex items-center gap-2">
            {completedSteps[step] ? (
              <Check className="text-primary size-4" />
            ) : (
              <Circle className="text-muted-foreground size-4" />
            )}
            <span>{missingStepCopy(step)}</span>
            <Badge variant={completedSteps[step] ? "default" : "outline"}>
              {completedSteps[step] ? "done" : "pending"}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        Finish these steps on your devices page to unlock attendance features.
      </p>
      <Link
        href="/student/devices"
        className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
      >
        Go to devices
      </Link>
    </section>
  );
}

export default async function StudentPage() {
  const gate = await loadEnrollmentGate();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Student dashboard</h1>
        <p className="text-muted-foreground text-sm">Your attendance at a glance.</p>
      </div>
      {gate !== null && gate.locked ? (
        <EnrollmentChecklist completedSteps={gate.completedSteps} />
      ) : null}
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
