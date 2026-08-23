import { cookies } from "next/headers";

import { COOKIE_NAME, verifySession, type Role } from "./session";

export async function getSessionRole(fallback: Role): Promise<Role> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token === undefined) return fallback;
  const session = await verifySession(token);
  return session?.role ?? fallback;
}
