import { ConvexError, v } from "convex/values";

import { enrollmentKey, sectionKey } from "../src/lib/roster/keys";
import { computeRosterDiff } from "../src/lib/roster/diff";
import type { RosterCatalogSnapshot, RosterRow } from "../src/lib/roster/types";
import { hashInviteToken, randomToken } from "../src/lib/invites/token";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminUser } from "./lib/actor";
import { MAX_ROSTER_ROWS, normalizeRosterRows } from "./lib/rosterSyncRows";

const rosterRowValidator = v.object({
  departmentCode: v.string(),
  departmentName: v.string(),
  courseCode: v.string(),
  courseTitle: v.string(),
  sectionName: v.string(),
  term: v.optional(v.string()),
  studentEmail: v.string(),
  studentName: v.string(),
  studentUsn: v.optional(v.string()),
  sourceRow: v.optional(v.number()),
});

/** Days a roster-sync invite stays redeemable; matches the invites default TTL. */
const INVITE_TTL_DAYS = 7;

function assertRowLimit(rows: RosterRow[]): void {
  if (rows.length > MAX_ROSTER_ROWS) {
    throw new ConvexError(`too many rows (max ${MAX_ROSTER_ROWS} per call)`);
  }
}

/**
 * Everything the institution already has, shaped for computeRosterDiff.
 * Section identity in the diff is (courseCode, sectionName, term), so course
 * codes are resolved onto sections here; students are keyed by lowercase
 * email. Enrollments are gathered per section (by_section) over the
 * institution's own sections only.
 */
async function loadInstitutionSnapshot(
  ctx: QueryCtx | MutationCtx,
  institutionId: Id<"institutions">,
): Promise<RosterCatalogSnapshot> {
  const [departments, courses, students] = await Promise.all([
    ctx.db
      .query("departments")
      .withIndex("by_institution", (q) => q.eq("institutionId", institutionId))
      .collect(),
    ctx.db
      .query("courses")
      .withIndex("by_institution_code", (q) => q.eq("institutionId", institutionId))
      .collect(),
    ctx.db
      .query("users")
      .withIndex("by_institution", (q) => q.eq("institutionId", institutionId))
      .collect(),
  ]);

  const sections: RosterCatalogSnapshot["sections"] = [];
  const sectionIds: Id<"sections">[] = [];
  const courseCodeById = new Map<Id<"courses">, string>();
  const sectionsPerCourse = await Promise.all(
    courses.map((course) =>
      ctx.db
        .query("sections")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect(),
    ),
  );
  courses.forEach((course, index) => {
    courseCodeById.set(course._id, course.code.toUpperCase());
    for (const section of sectionsPerCourse[index] ?? []) {
      sections.push({
        id: section._id,
        courseId: course._id,
        name: section.name,
        term: section.term ?? null,
      });
      sectionIds.push(section._id);
    }
  });

  const enrollments: RosterCatalogSnapshot["enrollments"] = [];
  const enrollmentsPerSection = await Promise.all(
    sectionIds.map((sectionId) =>
      ctx.db
        .query("enrollments")
        .withIndex("by_section", (q) => q.eq("sectionId", sectionId))
        .collect(),
    ),
  );
  for (const rows of enrollmentsPerSection) {
    for (const row of rows) {
      enrollments.push({ studentId: row.studentId, sectionId: row.sectionId });
    }
  }

  const studentsByEmail: RosterCatalogSnapshot["studentsByEmail"] = {};
  for (const student of students) {
    if (student.role !== "student") continue;
    studentsByEmail[student.email.toLowerCase()] = {
      id: student._id,
      name: student.name,
      usn: student.usn ?? null,
    };
  }

  return {
    departments: departments.map((department) => ({
      id: department._id,
      code: department.code,
      name: department.name,
    })),
    courses: courses.map((course) => ({
      id: course._id,
      code: course.code,
      title: course.title,
      departmentId: course.departmentId ?? null,
    })),
    sections,
    enrollments,
    studentsByEmail,
  };
}

/** Preview what applyRosterSync would change, without writing anything. */
export const previewRosterSync = query({
  args: { actorToken: v.string(), rows: v.array(rosterRowValidator) },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    assertRowLimit(args.rows);
    const { rows, issues } = normalizeRosterRows(args.rows);
    const snapshot = await loadInstitutionSnapshot(ctx, admin.institutionId);
    return { diff: computeRosterDiff(rows, snapshot), issues };
  },
});

/**
 * Applies a normalized roster: creates missing departments, courses,
 * sections, and enrollments for existing students, and student invites for
 * unknown emails. Idempotent by construction — the diff is computed against
 * current state immediately before writing, so re-applying the same file is
 * a no-op. Invite tokens are generated but never returned or logged.
 */
export const applyRosterSync = mutation({
  args: { actorToken: v.string(), rows: v.array(rosterRowValidator) },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    assertRowLimit(args.rows);
    const { rows, issues } = normalizeRosterRows(args.rows);
    const snapshot = await loadInstitutionSnapshot(ctx, admin.institutionId);
    const diff = computeRosterDiff(rows, snapshot);
    const now = Date.now();

    // Departments first: course creation and linking need their ids.
    const departmentIdByCode = new Map<string, string>();
    for (const department of snapshot.departments) {
      departmentIdByCode.set(department.code.toUpperCase(), department.id);
    }
    const departmentsCreated = diff.departmentsToCreate.length;
    for (const department of diff.departmentsToCreate) {
      const id = await ctx.db.insert("departments", {
        institutionId: admin.institutionId,
        code: department.code,
        name: department.name,
        createdAt: now,
      });
      departmentIdByCode.set(department.code.toUpperCase(), id);
    }

    // coursesToUpdate carries departmentId: null when the row's department
    // was created above — resolve it through the row that flagged the update.
    let coursesUpdated = 0;
    for (const course of diff.coursesToUpdate) {
      const rowDepartmentCode = rows.find((row) => row.courseCode === course.code)?.departmentCode;
      const departmentId =
        course.departmentId !== null
          ? course.departmentId
          : (departmentIdByCode.get(rowDepartmentCode ?? "") ?? null);
      await ctx.db.patch(course.id as Id<"courses">, {
        title: course.title,
        ...(departmentId !== null ? { departmentId: departmentId as Id<"departments"> } : {}),
      });
      coursesUpdated += 1;
    }

    const courseIdByCode = new Map<string, string>();
    for (const course of snapshot.courses) {
      courseIdByCode.set(course.code.toUpperCase(), course.id);
    }
    const coursesCreated = diff.coursesToCreate.length;
    for (const course of diff.coursesToCreate) {
      const departmentId = departmentIdByCode.get(course.departmentCode.toUpperCase());
      const id = await ctx.db.insert("courses", {
        institutionId: admin.institutionId,
        code: course.code,
        title: course.title,
        ...(departmentId !== undefined ? { departmentId: departmentId as Id<"departments"> } : {}),
      });
      courseIdByCode.set(course.code.toUpperCase(), id);
    }

    const sectionIdByKey = new Map<string, string>();
    const courseCodeByCourseId = new Map<string, string>(
      snapshot.courses.map((course) => [course.id, course.code.toUpperCase()]),
    );
    for (const section of snapshot.sections) {
      const courseCode = courseCodeByCourseId.get(section.courseId);
      if (courseCode === undefined) continue;
      sectionIdByKey.set(
        sectionKey(courseCode, section.name, section.term ?? undefined),
        section.id,
      );
    }
    const sectionsCreated = diff.sectionsToCreate.length;
    for (const section of diff.sectionsToCreate) {
      const courseId = courseIdByCode.get(section.courseCode.toUpperCase());
      if (courseId === undefined) continue;
      const id = await ctx.db.insert("sections", {
        courseId: courseId as Id<"courses">,
        name: section.sectionName,
        ...(section.term !== undefined ? { term: section.term } : {}),
      });
      sectionIdByKey.set(
        sectionKey(section.courseCode.toUpperCase(), section.sectionName, section.term),
        id,
      );
    }

    // Invite unknown emails BEFORE enrollments so a first-pass sync fully
    // materializes their enrollments too. The createInvites core is embedded
    // in its public mutation, so this replicates its minimal path: an
    // "invited" users row when the email is unknown (redeemInvite requires
    // one), then a pending invite with a real, unreturned token. Skipped
    // when an unexpired pending invite already exists for this email.
    const studentNameByEmail = new Map<string, string>();
    for (const row of rows) {
      if (!studentNameByEmail.has(row.studentEmail)) {
        studentNameByEmail.set(row.studentEmail, row.studentName);
      }
    }
    const invitedUserIdByEmail = new Map<string, Id<"users">>();
    let invitesCreated = 0;
    for (const email of diff.pendingInviteEmails) {
      const existingInvites = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const alreadyInvited = existingInvites.some(
        (invite) =>
          invite.institutionId === admin.institutionId &&
          invite.status === "pending" &&
          invite.expiresAt > now,
      );
      if (alreadyInvited) continue;

      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existingUser !== null) {
        // The email resolves to a user of another institution or a non-student
        // role: the global by_email index is not scoped, so verify before
        // attaching an invite to it. Prefer the source CSV row parseRosterCsv
        // stamped (positions drift when invalid rows are filtered out); fall
        // back to the submitted array position for direct API callers.
        if (existingUser.institutionId !== admin.institutionId || existingUser.role !== "student") {
          const submittedIndex = args.rows.findIndex(
            (row) => row.studentEmail.trim().toLowerCase() === email,
          );
          const sourceRow =
            submittedIndex === -1 ? 0 : (args.rows[submittedIndex].sourceRow ?? submittedIndex + 1);
          issues.push({
            row: sourceRow,
            field: "student_email",
            message: `"${email}" belongs to an existing account that cannot be invited as a student here`,
          });
          continue;
        }
      } else {
        const name = studentNameByEmail.get(email);
        const userId = await ctx.db.insert("users", {
          institutionId: admin.institutionId,
          email,
          name: name !== undefined && name.length > 0 ? name : (email.split("@")[0] ?? email),
          role: "student",
          status: "invited",
          createdAt: now,
        });
        invitedUserIdByEmail.set(email, userId);
      }

      const tokenHash = await hashInviteToken(randomToken());
      await ctx.db.insert("invites", {
        institutionId: admin.institutionId,
        email,
        role: "student",
        tokenHash,
        status: "pending",
        invitedByUserId: admin._id,
        createdAt: now,
        expiresAt: now + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
      });
      invitesCreated += 1;
    }

    // Rows for newly invited students were excluded from the diff's
    // enrollments (their user rows did not exist at diff time); synthesize
    // them here so one sync pass materializes the full roster.
    const enrollmentsToCreate = [...diff.enrollmentsToCreate];
    const invitedEmails = new Set(diff.pendingInviteEmails);
    const seenNewStudentEnrollment = new Set<string>();
    for (const row of rows) {
      if (!invitedEmails.has(row.studentEmail)) continue;
      const key = enrollmentKey(row);
      if (seenNewStudentEnrollment.has(key)) continue;
      seenNewStudentEnrollment.add(key);
      enrollmentsToCreate.push({
        studentEmail: row.studentEmail,
        courseCode: row.courseCode.toUpperCase(),
        sectionName: row.sectionName,
        term: row.term,
      });
    }

    let enrollmentsCreated = 0;
    for (const enrollment of enrollmentsToCreate) {
      const student = snapshot.studentsByEmail[enrollment.studentEmail];
      const studentId =
        student !== undefined
          ? (student.id as Id<"users">)
          : invitedUserIdByEmail.get(enrollment.studentEmail);
      if (studentId === undefined) continue;
      const sectionId = sectionIdByKey.get(
        sectionKey(enrollment.courseCode.toUpperCase(), enrollment.sectionName, enrollment.term),
      );
      if (sectionId === undefined) continue;
      await ctx.db.insert("enrollments", {
        studentId,
        sectionId: sectionId as Id<"sections">,
        enrolledAt: now,
      });
      enrollmentsCreated += 1;
    }

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: admin.institutionId,
      category: "identity",
      type: "roster.sync_applied",
      actorUserId: admin._id,
      payload: {
        counts: {
          departments: departmentsCreated,
          coursesCreated,
          coursesUpdated,
          sections: sectionsCreated,
          enrollments: enrollmentsCreated,
          invites: invitesCreated,
        },
      },
    });

    return {
      departmentsCreated,
      coursesCreated,
      coursesUpdated,
      sectionsCreated,
      enrollmentsCreated,
      enrollmentsExisting: diff.enrollmentsExisting,
      invitesCreated,
      issues: [...issues, ...diff.droppedRows],
    };
  },
});
