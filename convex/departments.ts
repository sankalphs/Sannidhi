import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { assertSameInstitution, requireAdminUser, requireAnalyticsAuthority } from "./lib/actor";

export type DepartmentRow = {
  id: Id<"departments">;
  code: string;
  name: string;
  createdAt: number;
  courseCount: number;
};

export type DepartmentCourseRow = {
  courseId: Id<"courses">;
  code: string;
  title: string;
  departmentId: Id<"departments"> | null;
  sectionCount: number;
};

/** Catalog with department links: every course of the caller's institution, its department, and section count. */
export const listCoursesWithDepartments = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<DepartmentCourseRow[]> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_institution_code", (q) => q.eq("institutionId", caller.institutionId))
      .collect();

    const rows: DepartmentCourseRow[] = [];
    for (const course of courses) {
      const sectionCount = await ctx.db
        .query("sections")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect()
        .then((sections) => sections.length);
      rows.push({
        courseId: course._id,
        code: course.code,
        title: course.title,
        departmentId: course.departmentId ?? null,
        sectionCount,
      });
    }

    return rows.sort((a, b) => a.code.localeCompare(b.code));
  },
});

/** Department directory for the caller's institution with per-department course counts. */
export const listDepartments = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<DepartmentRow[]> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);

    const [departments, courses] = await Promise.all([
      ctx.db
        .query("departments")
        .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
        .collect(),
      ctx.db
        .query("courses")
        .withIndex("by_institution_code", (q) => q.eq("institutionId", caller.institutionId))
        .collect(),
    ]);

    const courseCountByDepartment = new Map<Id<"departments">, number>();
    for (const course of courses) {
      if (course.departmentId === undefined) continue;
      courseCountByDepartment.set(
        course.departmentId,
        (courseCountByDepartment.get(course.departmentId) ?? 0) + 1,
      );
    }

    return departments
      .map((department) => ({
        id: department._id,
        code: department.code,
        name: department.name,
        createdAt: department.createdAt,
        courseCount: courseCountByDepartment.get(department._id) ?? 0,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  },
});

/** Departments live in one flat namespace per institution: codes are unique and uppercase. */
export const createDepartment = mutation({
  args: {
    actorToken: v.string(),
    code: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);
    const code = args.code.trim().toUpperCase();
    const name = args.name.trim();
    if (code.length === 0) throw new ConvexError("Department code is required");
    if (name.length === 0) throw new ConvexError("Department name is required");

    const existing = await ctx.db
      .query("departments")
      .withIndex("by_institution_code", (q) =>
        q.eq("institutionId", caller.institutionId).eq("code", code),
      )
      .first();
    if (existing !== null) throw new ConvexError("Department code already exists");

    const departmentId = await ctx.db.insert("departments", {
      institutionId: caller.institutionId,
      code,
      name,
      createdAt: Date.now(),
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "identity",
      type: "policy.department_created",
      actorUserId: caller._id,
      payload: { departmentId, code },
    });
    return { departmentId };
  },
});

export const renameDepartment = mutation({
  args: {
    actorToken: v.string(),
    departmentId: v.id("departments"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);
    const department = await ctx.db.get(args.departmentId);
    if (department === null) throw new ConvexError("Department not found");
    assertSameInstitution(caller.institutionId, department.institutionId);

    const name = args.name.trim();
    if (name.length === 0) throw new ConvexError("Department name is required");

    await ctx.db.patch(args.departmentId, { name });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "identity",
      type: "policy.department_renamed",
      actorUserId: caller._id,
      payload: { departmentId: args.departmentId, name },
    });
    return { ok: true as const };
  },
});
