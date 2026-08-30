import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
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

export type DepartmentMemberRow = {
  userId: Id<"users">;
  name: string;
  email: string;
  role: Doc<"users">["role"];
  usn: string | null;
};

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

/**
 * Full-replace department membership for a user; an empty list unassigns them
 * from every department. Duplicates in the input are collapsed.
 */
export const assignUserToDepartments = mutation({
  args: {
    actorToken: v.string(),
    userId: v.id("users"),
    departmentIds: v.array(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);

    const user = await ctx.db.get(args.userId);
    if (user === null) throw new ConvexError("User not found");
    assertSameInstitution(caller.institutionId, user.institutionId);

    const departmentIds = [...new Set(args.departmentIds)];
    for (const departmentId of departmentIds) {
      const department = await ctx.db.get(departmentId);
      if (department === null) throw new ConvexError("Department not found");
      assertSameInstitution(caller.institutionId, department.institutionId);
    }

    await ctx.db.patch(args.userId, {
      ...(departmentIds.length > 0 ? { departmentIds } : { departmentIds: undefined }),
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "identity",
      type: "policy.user_departments_assigned",
      actorUserId: caller._id,
      subjectUserId: args.userId,
      payload: { userId: args.userId, departmentIds },
    });
    return { ok: true as const };
  },
});

/** Assign (or with departmentId: null, unassign) a course from a department. */
export const assignCourseToDepartment = mutation({
  args: {
    actorToken: v.string(),
    courseId: v.id("courses"),
    departmentId: v.union(v.id("departments"), v.null()),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdminUser(ctx, args.actorToken);

    const course = await ctx.db.get(args.courseId);
    if (course === null) throw new ConvexError("Course not found");
    assertSameInstitution(caller.institutionId, course.institutionId);

    if (args.departmentId !== null) {
      const department = await ctx.db.get(args.departmentId);
      if (department === null) throw new ConvexError("Department not found");
      assertSameInstitution(caller.institutionId, department.institutionId);
    }

    await ctx.db.patch(args.courseId, {
      ...(args.departmentId !== null
        ? { departmentId: args.departmentId }
        : { departmentId: undefined }),
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "identity",
      type: "policy.course_department_assigned",
      actorUserId: caller._id,
      payload: { courseId: args.courseId, departmentId: args.departmentId },
    });
    return { ok: true as const };
  },
});

/** Roster of one department; department authorities see only their own departments. */
export const listDepartmentMembers = query({
  args: {
    actorToken: v.string(),
    departmentId: v.id("departments"),
  },
  handler: async (ctx, args): Promise<DepartmentMemberRow[]> => {
    const caller = await requireAnalyticsAuthority(ctx, args.actorToken);

    const department = await ctx.db.get(args.departmentId);
    if (department === null) throw new ConvexError("Department not found");
    assertSameInstitution(caller.institutionId, department.institutionId);

    if (caller.role === "department_authority") {
      const ownDepartmentIds = caller.departmentIds ?? [];
      if (!ownDepartmentIds.includes(args.departmentId)) {
        throw new ConvexError("Not your department");
      }
    }

    const users = await ctx.db
      .query("users")
      .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
      .collect();

    return users
      .filter((user) => (user.departmentIds ?? []).includes(args.departmentId))
      .map((user) => ({
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        usn: user.usn ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
