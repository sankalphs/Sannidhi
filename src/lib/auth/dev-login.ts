/**
 * Role-switching sign-in for local development, e2e, and Vercel previews.
 * Requires ENABLE_DEV_LOGIN=1 and is hard-off in production deployments.
 * Fixture users behind each role come from `bun run fixtures`.
 */
export function isDevLoginEnabled(): boolean {
  if (process.env.ENABLE_DEV_LOGIN !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview";
}
