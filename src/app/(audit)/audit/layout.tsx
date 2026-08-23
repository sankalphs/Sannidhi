import { AppShell } from "@/components/shell/app-shell";
import { ROLE_NAV } from "@/lib/auth/nav";
import type { Role } from "@/lib/auth/session";

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  const role: Role = "auditor";
  return (
    <AppShell role={role} nav={ROLE_NAV[role]}>
      {children}
    </AppShell>
  );
}
