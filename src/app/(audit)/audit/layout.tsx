import { AppShell } from "@/components/shell/app-shell";
import { ROLE_NAV } from "@/lib/auth/nav";
import { getSessionRole } from "@/lib/auth/server";

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const role = await getSessionRole("auditor");
  return (
    <AppShell role={role} nav={ROLE_NAV[role]}>
      {children}
    </AppShell>
  );
}
