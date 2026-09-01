import {
  ArrowRight,
  BookOpen,
  ChartColumn,
  FileText,
  Inbox,
  Landmark,
  Smartphone,
  Users,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";

type DirectoryCard = {
  icon: typeof Users;
  title: string;
  description: string;
  href: string;
  cta: string;
};

const DIRECTORY: DirectoryCard[] = [
  {
    icon: Users,
    title: "Users",
    description: "Import people, send invites, and manage roles and statuses.",
    href: "/admin/users",
    cta: "Manage users",
  },
  {
    icon: Inbox,
    title: "Access requests",
    description: "Institutions asking to onboard, queued for review.",
    href: "/admin/requests",
    cta: "Review requests",
  },
  {
    icon: Smartphone,
    title: "Devices",
    description: "Approve replacements and keep the device fleet trustworthy.",
    href: "/admin/devices",
    cta: "Review devices",
  },
  {
    icon: BookOpen,
    title: "Courses & sections",
    description: "Catalog, departments, and roster sync for timetables and sessions.",
    href: "/admin/courses",
    cta: "Manage courses",
  },
  {
    icon: Landmark,
    title: "Policies",
    description: "Risk thresholds, step-up rules, and department policy scopes.",
    href: "/admin/policies",
    cta: "Edit policies",
  },
  {
    icon: ChartColumn,
    title: "Analytics",
    description: "Attendance trajectories, subject trends, and verification anomalies.",
    href: "/admin/analytics",
    cta: "Open analytics",
  },
  {
    icon: Inbox,
    title: "Review inbox",
    description: "Early-warning alerts routed to human review.",
    href: "/admin/review",
    cta: "Open inbox",
  },
  {
    icon: FileText,
    title: "Reports",
    description: "Rolling-window reports with CSV and PDF exports.",
    href: "/admin/reports",
    cta: "Open reports",
  },
];

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Admin panel"
        title="Admin dashboard"
        description="Directory, academics, and policy controls for your institution."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Manage</h2>
        <div className="bg-border/70 grid gap-px overflow-hidden rounded-xl border md:grid-cols-2 lg:grid-cols-3">
          {DIRECTORY.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group hover:bg-accent bg-card flex flex-col gap-2 p-5 transition-colors"
            >
              <card.icon className="text-primary size-5" />
              <span className="font-medium">{card.title}</span>
              <span className="text-muted-foreground text-sm leading-relaxed">
                {card.description}
              </span>
              <span className="text-primary mt-1 inline-flex items-center gap-1.5 text-sm font-medium">
                {card.cta}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
