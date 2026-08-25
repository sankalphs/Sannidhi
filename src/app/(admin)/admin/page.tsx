import { ArrowRight, BookOpen, Inbox, Landmark, Smartphone, Users } from "lucide-react";
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
];

const UPCOMING = [
  {
    icon: BookOpen,
    title: "Courses & sections",
    description:
      "Course and section management is on the roadmap — the seeded catalog already powers timetables and sessions.",
  },
  {
    icon: Landmark,
    title: "Policies",
    description: "Attendance thresholds and step-up rules arrive in a later phase.",
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
        <div className="bg-border/70 grid gap-px overflow-hidden rounded-xl border md:grid-cols-3">
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Arriving soon</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {UPCOMING.map((card) => (
            <div
              key={card.title}
              className="border-border flex flex-col gap-2 rounded-xl border border-dashed p-5"
            >
              <card.icon className="text-muted-foreground size-5" />
              <span className="font-medium">{card.title}</span>
              <span className="text-muted-foreground text-sm">{card.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
