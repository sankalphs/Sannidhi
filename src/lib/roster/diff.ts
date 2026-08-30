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

  const usable: RosterRow[] = [];
  for (const row of rows) {
    const fields = [row.departmentCode, row.courseCode, row.sectionName, row.studentEmail];
    if (fields.some((value) => value.trim().length === 0)) {
      droppedRows.push({
        row: 0,
        field: "row",
        message: `row for "${row.studentEmail}" (${row.courseCode} ${row.sectionName}) is empty after trimming`,
      });
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

  // Departments: create-only, keyed by first-seen name.
  const departmentsToCreateMap = new Map<string, { code: string; name: string }>();
  // Courses to create keyed by code; departmentCode from first occurrence.
  const coursesToCreateMap = new Map<
    string,
    { code: string; title: string; departmentCode: string }
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
      });
    }

    const existingCourse = coursesByCode.get(row.courseCode);

    if (existingCourse === undefined) {
      if (!coursesToCreateMap.has(row.courseCode)) {
        coursesToCreateMap.set(row.courseCode, {
          code: row.courseCode,
          title: row.courseTitle,
          departmentCode: row.departmentCode,
        });
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

    // Existing course: check title and department linking.
    const titleDiffers = existingCourse.title.trim() !== row.courseTitle.trim();
    const snapshotDepartment = existingCourse.departmentId
      ? snapshot.departments.find((d) => d.id === existingCourse.departmentId)
      : undefined;
    const rosterDeptExists =
      departmentsByCode.has(row.departmentCode) || departmentsToCreateMap.has(row.departmentCode);
    const departmentDiffers =
      (existingCourse.departmentId === null ||
        existingCourse.departmentId === undefined ||
        snapshotDepartment === undefined) &&
      rosterDeptExists;
    if ((titleDiffers || departmentDiffers) && !coursesToUpdateIds.has(existingCourse.id)) {
      coursesToUpdateIds.add(existingCourse.id);
      let departmentId: string | null = null;
      if (existingCourse.departmentId !== null && existingCourse.departmentId !== undefined) {
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
    departmentsToCreate: [...departmentsToCreateMap.values()],
    coursesToCreate: [...coursesToCreateMap.values()],
    coursesToUpdate,
    sectionsToCreate: [...sectionsToCreateMap.values()],
    enrollmentsToCreate,
    enrollmentsExisting,
    pendingInviteEmails: [...pendingInviteEmails].sort(),
    droppedRows,
  };
}
