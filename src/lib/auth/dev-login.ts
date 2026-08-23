export function isDevLoginEnabled(): boolean {
  if (process.env.ENABLE_DEV_LOGIN !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview";
}
