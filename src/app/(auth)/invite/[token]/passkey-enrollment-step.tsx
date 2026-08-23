import { Fingerprint } from "lucide-react";

export function PasskeyEnrollmentStep() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 text-left">
      <p className="flex items-center gap-2 font-medium">
        <Fingerprint className="text-muted-foreground size-4" />
        Next step: register your passkey
      </p>
      <p className="text-muted-foreground text-sm">
        Passkey enrollment arrives with the authentication rollout. Once live, this is where you
        will create the passkey that unlocks your account.
      </p>
    </div>
  );
}
