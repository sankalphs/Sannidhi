import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { mintActorToken } from "@/lib/auth/actor-token";
import { getActiveSession } from "@/lib/auth/server";
import { getConvexClient } from "@/lib/convex/server-client";

import { RosterSyncPanel } from "./roster-sync-panel";

type DepartmentRow = FunctionReturnType<typeof api.departments.listDepartments>[number];
type DepartmentCourseRow = FunctionReturnType<
  typeof api.departments.listCoursesWithDepartments
>[number];

type CatalogCourse = {
  id: string;
  code: string;
  title: string;
  departmentId: string | null;
  sectionCount: number;
};

export default async function AdminCoursesPage() {
  const session = await getActiveSession();
  if (session === null || (session.role !== "admin" && session.role !== "department_authority")) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Administration access required"
        description="Course management is restricted to administrators."
      />
    );
  }

  const actorToken = await mintActorToken({
    userId: session.userId,
    role: session.role,
    ...(session.sid !== undefined ? { sid: session.sid } : {}),
  });

  const client = getConvexClient();
  const [departments, catalog] = await Promise.all([
    client.query(api.departments.listDepartments, { actorToken }),
    client.query(api.departments.listCoursesWithDepartments, { actorToken }),
  ]);

  const isAdmin = session.role === "admin";
  const departmentById = new Map<string, DepartmentRow>(
    departments.map((dept: DepartmentRow) => [dept.id as string, dept]),
  );

  const courses: CatalogCourse[] = catalog.map((course: DepartmentCourseRow) => ({
    id: course.courseId,
    code: course.code,
    title: course.title,
    departmentId: course.departmentId,
    sectionCount: course.sectionCount,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Courses & sections"
        description="Institution catalog with department scopes and SIS/LMS roster sync."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Catalog ({courses.length})</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Sections</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {courses.map((course) => (
                <tr key={course.id}>
                  <td className="px-4 py-2 font-mono text-xs">{course.code}</td>
                  <td className="px-4 py-2">{course.title}</td>
                  <td className="text-muted-foreground px-4 py-2">
                    {course.departmentId !== null
                      ? (departmentById.get(course.departmentId)?.name ?? "Unlinked")
                      : "—"}
                  </td>
                  <td className="px-4 py-2">{course.sectionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Departments ({departments.length})</h2>
        {departments.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No departments yet"
            description="Create departments under Policies to scope courses and policies."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {departments.map((department: DepartmentRow) => (
              <Badge key={department.id} variant="secondary">
                {department.code} — {department.courseCount} course
                {department.courseCount === 1 ? "" : "s"}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <RosterSyncPanel actorToken={actorToken} isAdmin={isAdmin} />
    </div>
  );
}
