import { AppShell } from "@/components/shell/app-shell";
import { ROLE_NAV } from "@/lib/auth/nav";
import { canReviewAccessRequests, getSessionRole } from "@/lib/auth/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await getSessionRole("admin");
  // Access requests are operator-only; other admins never see the nav item.
  const showRequests = role === "admin" && (await canReviewAccessRequests());
  const nav = ROLE_NAV[role].filter((item) => item.href !== "/admin/requests" || showRequests);
  return (
    <AppShell role={role} nav={nav}>
      {children}
    </AppShell>
  );
}
