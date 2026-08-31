import type { RosterCatalogSnapshot, RosterDiff, RosterIssue, RosterRow } from "./types";
import { enrollmentKey, sectionKey } from "./keys";

export { sectionKey };

/**
 * Computes an apply/preview diff between normalized roster rows and an
 * institution catalog snapshot. Pure — the mutation resolves ids after
 * creating departments and links toCreate-department courses afterwards.
 */
export function computeRosterDiff(rows: RosterRow[], snapshot: RosterCatalogSnapshot): RosterDiff {
  const droppedRows: RosterIssue[] = [];
  const addIssue = (row: RosterRow | undefined, field: string, message: string) => {
    droppedRows.push({
      row: row?.sourceRow ?? 0,
      field,
      message,
    });
  };

  const usable: RosterRow[] = [];
  for (const row of rows) {
    const fields = [row.departmentCode, row.courseCode, row.sectionName, row.studentEmail];
    if (fields.some((value) => value.trim().length === 0)) {
      addIssue(
        row,
        "row",
        `row for "${row.studentEmail}" (${row.courseCode} ${row.sectionName}) is empty after trimming`,
      );
      continue;
    }
    usable.push(row);
  }

  const departmentsByCode = new Map<string, RosterCatalogSnapshot["departments"][number]>();
  for (const department of snapshot.departments) {
    departmentsByCode.set(department.code.toUpperCase(), department);
  }

  const coursesByCode = new Map<string, RosterCatalogSnapshot["courses"][number]>();
  for (const course of snapshot.courses) {
    coursesByCode.set(course.code.toUpperCase(), course);
  }

  const sectionsByKey = new Map<string, RosterCatalogSnapshot["sections"][number]>();
  for (const section of snapshot.sections) {
    const course = snapshot.courses.find((c) => c.id === section.courseId);
    if (course === undefined) continue;
    sectionsByKey.set(
      sectionKey(course.code.toUpperCase(), section.name, section.term ?? undefined),
      section,
    );
  }

  const enrolledPairs = new Set<string>();
  for (const enrollment of snapshot.enrollments) {
    enrolledPairs.add(`${enrollment.studentId}\n${enrollment.sectionId}`);
  }

  // Departments: create-only, keyed by first-seen code. A later row using a
  // different name for the same code is surfaced rather than silently ignored.
  const departmentsToCreateMap = new Map<
    string,
    { code: string; name: string; firstRow?: RosterRow }
  >();
  // Courses to create keyed by code; departmentCode/title from first occurrence.
  const coursesToCreateMap = new Map<
    string,
    { code: string; title: string; departmentCode: string; firstRow?: RosterRow }
  >();

  const coursesToUpdate: RosterDiff["coursesToUpdate"] = [];
  const coursesToUpdateIds = new Set<string>();
  const sectionsToCreateMap = new Map<
    string,
    { courseCode: string; sectionName: string; term?: string }
  >();
  const enrollmentsToCreate: RosterDiff["enrollmentsToCreate"] = [];
  const enrollmentsToCreateKeys = new Set<string>();
  const pendingInviteEmails = new Set<string>();
  let enrollmentsExisting = 0;

  for (const row of usable) {
    if (
      !departmentsByCode.has(row.departmentCode) &&
      !departmentsToCreateMap.has(row.departmentCode)
    ) {
      departmentsToCreateMap.set(row.departmentCode, {
        code: row.departmentCode,
        name: row.departmentName,
        firstRow: row,
      });
    } else {
      const seen =
        departmentsByCode.get(row.departmentCode) ?? departmentsToCreateMap.get(row.departmentCode);
      const seenName =
        seen !== undefined && "name" in seen && seen.name !== undefined ? seen.name : undefined;
      if (
        seenName !== undefined &&
        seenName.trim().length > 0 &&
        seenName.trim().toLowerCase() !== row.departmentName.trim().toLowerCase()
      ) {
        addIssue(
          row,
          "departmentName",
          `department code "${row.departmentCode}" appears with conflicting names: "${seenName}" vs "${row.departmentName}"`,
        );
      }
    }

    const existingCourse = coursesByCode.get(row.courseCode);

    if (existingCourse === undefined) {
      const alreadyCreating = coursesToCreateMap.get(row.courseCode);
      if (alreadyCreating === undefined) {
        coursesToCreateMap.set(row.courseCode, {
          code: row.courseCode,
          title: row.courseTitle,
          departmentCode: row.departmentCode,
          firstRow: row,
        });
      } else if (
        alreadyCreating.title.trim().toLowerCase() !== row.courseTitle.trim().toLowerCase() ||
        alreadyCreating.departmentCode !== row.departmentCode
      ) {
        addIssue(
          row,
          "courseTitle",
          `course code "${row.courseCode}" appears with conflicting definitions: "${alreadyCreating.title}" (${alreadyCreating.departmentCode}) vs "${row.courseTitle}" (${row.departmentCode})`,
        );
      }
      if (
        !sectionsToCreateMap.has(sectionKey(row.courseCode, row.sectionName, row.term)) &&
        !sectionsByKey.has(sectionKey(row.courseCode, row.sectionName, row.term))
      ) {
        sectionsToCreateMap.set(sectionKey(row.courseCode, row.sectionName, row.term), {
          courseCode: row.courseCode,
          sectionName: row.sectionName,
          ...(row.term !== undefined ? { term: row.term } : {}),
        });
      }
      const student = snapshot.studentsByEmail[row.studentEmail];
      if (student === undefined) {
        pendingInviteEmails.add(row.studentEmail);
      } else {
        if (!enrollmentsToCreateKeys.has(enrollmentKey(row))) {
          enrollmentsToCreateKeys.add(enrollmentKey(row));
          enrollmentsToCreate.push({
            studentEmail: row.studentEmail,
            courseCode: row.courseCode,
            sectionName: row.sectionName,
            ...(row.term !== undefined ? { term: row.term } : {}),
          });
        }
      }
      continue;
    }

    // Existing course: check title, plus both linking an unlinked course and
    // re-assigning a linked one — a roster that moves a course to a new
    // department must surface as an update, not be silently ignored. A move
    // to a department that doesn't exist yet keeps departmentId null: the
    // apply mutation resolves it after creating the new department.
    const titleDiffers = existingCourse.title.trim() !== row.courseTitle.trim();
    const snapshotDepartment = existingCourse.departmentId
      ? snapshot.departments.find((d) => d.id === existingCourse.departmentId)
      : undefined;
    const rosterDept = departmentsByCode.get(row.departmentCode);
    const rosterDeptPending = departmentsToCreateMap.get(row.departmentCode);
    const reassigningDepartment =
      existingCourse.departmentId != null &&
      (rosterDept !== undefined || rosterDeptPending !== undefined) &&
      rosterDept?.id !== existingCourse.departmentId;
    const departmentDiffers =
      ((existingCourse.departmentId == null || snapshotDepartment === undefined) &&
        (rosterDept !== undefined || rosterDeptPending !== undefined)) ||
      reassigningDepartment;
    if (reassigningDepartment) {
      addIssue(
        row,
        "departmentCode",
        `course ${row.courseCode} moves from department "${snapshotDepartment?.code ?? existingCourse.departmentId}" to "${row.departmentCode}"`,
      );
    }
    if ((titleDiffers || departmentDiffers) && !coursesToUpdateIds.has(existingCourse.id)) {
      coursesToUpdateIds.add(existingCourse.id);
      let departmentId: string | null = null;
      if (reassigningDepartment && rosterDept !== undefined) {
        departmentId = rosterDept.id;
      } else if (reassigningDepartment) {
        // Moving to a pending (not-yet-created) department: null lets the
        // apply mutation link the freshly created department.
        departmentId = null;
      } else if (
        existingCourse.departmentId !== null &&
        existingCourse.departmentId !== undefined
      ) {
        departmentId = existingCourse.departmentId;
      } else {
        const snapshotDept = departmentsByCode.get(row.departmentCode);
        if (snapshotDept !== undefined) {
          departmentId = snapshotDept.id;
        }
      }
      coursesToUpdate.push({
        id: existingCourse.id,
        code: row.courseCode,
        title: row.courseTitle,
        departmentId,
      });
    }

    const existingSection = sectionsByKey.get(
      sectionKey(row.courseCode, row.sectionName, row.term),
    );
    if (existingSection === undefined) {
      if (!sectionsToCreateMap.has(sectionKey(row.courseCode, row.sectionName, row.term))) {
        sectionsToCreateMap.set(sectionKey(row.courseCode, row.sectionName, row.term), {
          courseCode: row.courseCode,
          sectionName: row.sectionName,
          ...(row.term !== undefined ? { term: row.term } : {}),
        });
      }
    }

    const student = snapshot.studentsByEmail[row.studentEmail];
    if (student === undefined) {
      pendingInviteEmails.add(row.studentEmail);
      continue;
    }

    if (
      existingSection !== undefined &&
      enrolledPairs.has(`${student.id}\n${existingSection.id}`)
    ) {
      enrollmentsExisting += 1;
      continue;
    }

    const enrollmentId = enrollmentKey(row);
    if (!enrollmentsToCreateKeys.has(enrollmentId)) {
      enrollmentsToCreateKeys.add(enrollmentId);
      enrollmentsToCreate.push({
        studentEmail: row.studentEmail,
        courseCode: row.courseCode,
        sectionName: row.sectionName,
        ...(row.term !== undefined ? { term: row.term } : {}),
      });
    }
  }

  return {
    departmentsToCreate: [...departmentsToCreateMap.values()].map(({ code, name }) => ({
      code,
      name,
    })),
    coursesToCreate: [...coursesToCreateMap.values()].map(({ code, title, departmentCode }) => ({
      code,
      title,
      departmentCode,
    })),
    coursesToUpdate,
    sectionsToCreate: [...sectionsToCreateMap.values()],
    enrollmentsToCreate,
    enrollmentsExisting,
    pendingInviteEmails: [...pendingInviteEmails].sort(),
    droppedRows,
  };
}
