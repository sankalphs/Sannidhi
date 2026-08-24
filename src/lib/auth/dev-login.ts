function devLoginFlagEnabled(): boolean {
  return process.env.ENABLE_DEV_LOGIN === "1";
}

/**
 * Local development and Vercel previews: role switching for engineering and review.
 */
export function isDevLoginEnabled(): boolean {
  if (!devLoginFlagEnabled()) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview";
}

/**
 * Public demo mode: explicitly opted into per deployment (ENABLE_DEMO_LOGIN=1),
 * including production. Lets visitors explore every role panel with seeded data.
 * Must stay off for real institutional deployments.
 */
export function isDemoLoginEnabled(): boolean {
  if (process.env.ENABLE_DEMO_LOGIN === "1") return true;
  return isDevLoginEnabled();
}
