import { BookOpen, GraduationCap, Landmark, ScrollText, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Surface = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const SURFACES: Surface[] = [
  {
    href: "/student",
    title: "Student",
    description: "Track your attendance history and file correction requests.",
    icon: BookOpen,
  },
  {
    href: "/faculty",
    title: "Faculty",
    description: "Run class sessions and keep the roster honest in real time.",
    icon: GraduationCap,
  },
  {
    href: "/admin",
    title: "Admin & department authority",
    description: "Manage people, courses, sections, and attendance policies.",
    icon: Landmark,
  },
  {
    href: "/audit",
    title: "Auditor",
    description: "Read-only access to the append-only event ledger.",
    icon: ScrollText,
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-20">
      <div className="flex max-w-3xl flex-col items-center gap-4 text-center">
        <Badge variant="secondary">Phase 0 scaffold</Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Sannidhi — Adaptive Attendance
        </h1>
        <p className="text-muted-foreground text-lg sm:text-xl">
          One ecosystem for honest, low-friction attendance across classrooms, departments, and
          audits.
        </p>
      </div>
      <div className="mt-12 grid w-full max-w-5xl gap-4 sm:grid-cols-2">
        {SURFACES.map((surface) => (
          <Link key={surface.href} href={surface.href} className="group">
            <Card className="group-hover:border-primary/50 h-full transition-colors">
              <CardHeader>
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <surface.icon className="size-5" />
                </div>
                <CardTitle>{surface.title}</CardTitle>
                <CardDescription>{surface.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-primary text-sm font-medium group-hover:underline">
                Enter surface
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex flex-col items-center gap-2">
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <p className="text-muted-foreground max-w-xl text-center text-sm">
          Passkey login arrives in Phase 1. Until then, protected surfaces bounce unauthenticated
          visitors back here.
        </p>
      </div>
    </main>
  );
}
