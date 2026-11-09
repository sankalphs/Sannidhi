import { startAuthentication } from "@simplewebauthn/browser";

/**
 * Runs the passkey step-up ceremony that refreshes the session's fresh-auth
 * window for sensitive operations (device replacement, biometric
 * re-enrollment). Call it straight from a click handler so the browser keeps
 * the user gesture WebAuthn needs; throws when verification fails.
 */
export async function runPasskeyStepUp(): Promise<void> {
  const options = await fetch("/api/auth/webauthn/step-up/options", { method: "POST" });
  if (!options.ok) throw new Error("Step-up could not start");
  const assertion = await startAuthentication({ optionsJSON: await options.json() });
  const verification = await fetch("/api/auth/webauthn/step-up/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: assertion }),
  });
  if (!verification.ok) throw new Error("Identity re-verification failed");
}
