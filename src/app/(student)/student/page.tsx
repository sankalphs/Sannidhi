import { Check, Circle, ClipboardList, Fingerprint, History } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { loadEnrollmentGate } from "@/lib/enrollment/load";
import type { EnrollmentGateResult } from "@/lib/enrollment/gate";
import { isPasskeyRecommended } from "@/lib/enrollment/gate";
import { ENROLLMENT_STEPS, missingStepCopy } from "@/lib/enrollment/ui";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";

import { PendingChallengeBanner } from "./check-in/step-up-challenge";

export const dynamic = "force-dynamic";

async function loadActorToken(): Promise<string | null> {
  try {
    const session = await getActiveSession();
    if (session === null) return null;
    return await mintActorToken({
      userId: session.userId,
      role: session.role,
      ...(session.sid !== undefined ? { sid: session.sid } : {}),
    });
  } catch {
    return null;
  }
}

function EnrollmentChecklist({
  completedSteps,
}: {
  completedSteps: EnrollmentGateResult["completedSteps"];
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Enrollment checklist</h2>
        <Badge variant="secondary">Attendance locked</Badge>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {ENROLLMENT_STEPS.map((step) => (
          <li key={step} className="flex items-center gap-2">
            {completedSteps[step] ? (
              <Check className="text-verdict-accept size-4" />
            ) : (
              <Circle className="text-muted-foreground size-4" />
            )}
            <span>{missingStepCopy(step)}</span>
            {completedSteps[step] ? (
              <Badge variant="default">done</Badge>
            ) : step === "passkey" ? (
              <Badge variant="secondary">recommended</Badge>
            ) : (
              <Badge variant="outline">pending</Badge>
            )}
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

function PasskeyRecommendation() {
  return (
    <section className="border-border bg-card flex flex-col gap-2 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Fingerprint className="size-4" />
          Add a passkey
        </h2>
        <Badge variant="secondary">Recommended</Badge>
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Attendance works with your password, but a passkey is faster, phishing-resistant, and
        required for step-up checks when something looks risky.
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
  const [gate, actorToken] = await Promise.all([loadEnrollmentGate(), loadActorToken()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Student panel"
        title="Student dashboard"
        description="Your attendance at a glance."
      />
      {actorToken !== null ? <PendingChallengeBanner actorToken={actorToken} /> : null}
      {gate.locked ? <EnrollmentChecklist completedSteps={gate.completedSteps} /> : null}
      {isPasskeyRecommended(gate) ? <PasskeyRecommendation /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="border-border bg-card flex flex-col gap-2 rounded-xl border p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="text-muted-foreground size-4" />
            Attendance history
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your calendar and subject-wise attendance, with threshold projections as the term
            progresses.
          </p>
          <Link
            href="/student/history"
            className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
          >
            View attendance history
          </Link>
        </section>
        <section className="border-border bg-card flex flex-col gap-2 rounded-xl border p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardList className="text-muted-foreground size-4" />
            Requests
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            File corrections, exemptions, and on-duty requests, and follow their review status.
          </p>
          <Link
            href="/student/requests"
            className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
          >
            Manage requests
          </Link>
        </section>
      </div>
    </div>
  );
}
