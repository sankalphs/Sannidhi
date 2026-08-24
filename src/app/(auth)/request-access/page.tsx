import Link from "next/link";

import { RequestAccessForm } from "./request-access-form";

export const metadata = {
  title: "Request access — Sannidhi",
};

export default function RequestAccessPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center sm:text-left">
        <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
          Institution onboarding
        </p>
        <h1 className="font-display text-4xl tracking-tight">Request access</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Tell us about your institution. If Sannidhi is a fit, we will set up your departments,
          courses, and policies, then send administrator invites.
        </p>
      </div>

      <RequestAccessForm />

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in with your passkey
        </Link>
      </p>
    </div>
  );
}
