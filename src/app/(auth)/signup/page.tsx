import Link from "next/link";

import { SignupForm } from "@/app/(auth)/signup/signup-form";

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center sm:text-left">
        <p className="text-muted-foreground font-mono text-xs font-medium tracking-[0.16em] uppercase">
          Get started
        </p>
        <h1 className="font-display text-4xl tracking-tight">Create your account</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Students can self-register with their USN and email. Ask your institution for its signup
          code, then add a passkey any time from your devices page.
        </p>
      </div>

      <SignupForm />

      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
