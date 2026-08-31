import { describe, expect, it } from "vitest";

import { computeRosterDiff } from "@/lib/roster/diff";
import type { RosterCatalogSnapshot, RosterRow } from "@/lib/roster/types";

function row(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    departmentCode: "CSE",
    departmentName: "Computer Science",
    courseCode: "CS101",
    courseTitle: "Introduction to Computer Science",
    sectionName: "Section A",
    term: "2026-Autumn",
    studentEmail: "aarav.patel@sit.edu.in",
    studentName: "Aarav Patel",
    ...overrides,
  };
}

function snapshot(overrides: Partial<RosterCatalogSnapshot> = {}): RosterCatalogSnapshot {
  return {
    departments: [
      { id: "dept-cse", code: "CSE", name: "Computer Science" },
      { id: "dept-math", code: "MATH", name: "Mathematics" },
    ],
    courses: [
      {
        id: "course-cs101",
        code: "CS101",
        title: "Introduction to Computer Science",
        departmentId: "dept-cse",
      },
      {
        id: "course-ma201",
        code: "MA201",
        title: "Discrete Mathematics",
        departmentId: "dept-math",
      },
    ],
    sections: [
      { id: "section-cs101-a", courseId: "course-cs101", name: "Section A", term: "2026-Autumn" },
      { id: "section-ma201-a", courseId: "course-ma201", name: "Section A", term: "2026-Autumn" },
    ],
    enrollments: [{ studentId: "user-aarav", sectionId: "section-cs101-a" }],
    studentsByEmail: {
      "aarav.patel@sit.edu.in": { id: "user-aarav", name: "Aarav Patel", usn: "SIT-CS-2023-001" },
      "diya.sharma@sit.edu.in": { id: "user-diya", name: "Diya Sharma", usn: null },
    },
    ...overrides,
  };
}

describe("computeRosterDiff", () => {
  it("classifies an existing enrollment as existing (idempotent)", () => {
    const diff = computeRosterDiff([row({ sectionName: "Section A" })], snapshot());
    expect(diff.enrollmentsExisting).toBe(1);
    expect(diff.enrollmentsToCreate).toEqual([]);
    expect(diff.departmentsToCreate).toEqual([]);
    expect(diff.coursesToCreate).toEqual([]);
    expect(diff.coursesToUpdate).toEqual([]);
    expect(diff.sectionsToCreate).toEqual([]);
    expect(diff.pendingInviteEmails).toEqual([]);
    expect(diff.droppedRows).toEqual([]);
  });

  it("creates departments not present in the snapshot and ignores name drift on existing ones", () => {
    const diff = computeRosterDiff(
      [
        row({ departmentCode: "ECE", departmentName: "Electronics" }),
        row({ departmentCode: "CSE", departmentName: "Totally Renamed" }),
      ],
      snapshot(),
    );
    expect(diff.departmentsToCreate).toEqual([{ code: "ECE", name: "Electronics" }]);
  });

  it("plans new courses and new sections for to-create departments", () => {
    const diff = computeRosterDiff(
      [
        row({
          departmentCode: "ECE",
          departmentName: "Electronics",
          courseCode: "EC210",
          courseTitle: "Digital Electronics",
          sectionName: "Section A",
          studentEmail: "diya.sharma@sit.edu.in",
        }),
      ],
      snapshot(),
    );
    expect(diff.departmentsToCreate).toEqual([{ code: "ECE", name: "Electronics" }]);
    expect(diff.coursesToCreate).toEqual([
      { code: "EC210", title: "Digital Electronics", departmentCode: "ECE" },
    ]);
    expect(diff.sectionsToCreate).toEqual([
      { courseCode: "EC210", sectionName: "Section A", term: "2026-Autumn" },
    ]);
    expect(diff.enrollmentsToCreate).toEqual([
      {
        studentEmail: "diya.sharma@sit.edu.in",
        courseCode: "EC210",
        sectionName: "Section A",
        term: "2026-Autumn",
      },
    ]);
  });

  it("flags existing courses whose title differs for update", () => {
    const diff = computeRosterDiff([row({ courseTitle: "Intro to Computer Science" })], snapshot());
    expect(diff.coursesToUpdate).toEqual([
      {
        id: "course-cs101",
        code: "CS101",
        title: "Intro to Computer Science",
        departmentId: "dept-cse",
      },
    ]);
    expect(diff.coursesToCreate).toEqual([]);
  });

  it("links an existing departmentless course to a snapshot department id", () => {
    const snap = snapshot({
      courses: [{ id: "course-cs101", code: "CS101", title: "Introduction to Computer Science" }],
    });
    const diff = computeRosterDiff([row({})], snap);
    expect(diff.coursesToUpdate).toEqual([
      {
        id: "course-cs101",
        code: "CS101",
        title: "Introduction to Computer Science",
        departmentId: "dept-cse",
      },
    ]);
  });

  it("sets departmentId to null for an unlinked course when the department is also new", () => {
    const snap = snapshot({
      courses: [{ id: "course-ec210", code: "EC210", title: "Digital Electronics" }],
    });
    const diff = computeRosterDiff(
      [
        row({
          departmentCode: "ECE",
          departmentName: "Electronics",
          courseCode: "EC210",
          courseTitle: "Digital Electronics",
          sectionName: "Section A",
          studentEmail: "diya.sharma@sit.edu.in",
        }),
      ],
      snap,
    );
    expect(diff.coursesToUpdate).toEqual([
      { id: "course-ec210", code: "EC210", title: "Digital Electronics", departmentId: null },
    ]);
  });

  it("creates a new section on an existing course and counts it as a to-create enrollment", () => {
    const diff = computeRosterDiff(
      [row({ sectionName: "Section B", studentEmail: "diya.sharma@sit.edu.in" })],
      snapshot(),
    );
    expect(diff.sectionsToCreate).toEqual([
      { courseCode: "CS101", sectionName: "Section B", term: "2026-Autumn" },
    ]);
    expect(diff.enrollmentsToCreate).toEqual([
      {
        studentEmail: "diya.sharma@sit.edu.in",
        courseCode: "CS101",
        sectionName: "Section B",
        term: "2026-Autumn",
      },
    ]);
    expect(diff.enrollmentsExisting).toBe(0);
  });

  it("collects and sorts pending invite emails without duplicates", () => {
    const diff = computeRosterDiff(
      [
        row({ studentEmail: "zoe@sit.edu.in" }),
        row({ studentEmail: "amy@sit.edu.in", sectionName: "Section B" }),
        row({ studentEmail: "amy@sit.edu.in", sectionName: "Section B", term: "2026-Spring" }),
        row({ studentEmail: "aarav.patel@sit.edu.in", sectionName: "Section B" }),
      ],
      snapshot(),
    );
    expect(diff.pendingInviteEmails).toEqual(["amy@sit.edu.in", "zoe@sit.edu.in"]);
  });

  it("does not add existing enrollments to pendingInviteEmails for new sections of enrolled students", () => {
    const diff = computeRosterDiff(
      [row({ studentEmail: "aarav.patel@sit.edu.in", sectionName: "Section B" })],
      snapshot(),
    );
    expect(diff.pendingInviteEmails).toEqual([]);
    expect(diff.enrollmentsToCreate).toEqual([
      {
        studentEmail: "aarav.patel@sit.edu.in",
        courseCode: "CS101",
        sectionName: "Section B",
        term: "2026-Autumn",
      },
    ]);
  });

  it("drops rows that are empty after trimming at the diff stage", () => {
    const diff = computeRosterDiff(
      [{ ...row(), departmentCode: "   ", courseCode: "", sectionName: "", studentEmail: "  " }],
      snapshot(),
    );
    expect(diff.droppedRows).toHaveLength(1);
    expect(diff.droppedRows[0]?.field).toBe("row");
    expect(diff.enrollmentsToCreate).toEqual([]);
    expect(diff.departmentsToCreate).toEqual([]);
  });

  it("is fully idempotent when the snapshot already contains everything", () => {
    const rows = [
      row({}),
      row({ studentEmail: "diya.sharma@sit.edu.in" }),
      row({
        departmentCode: "ECE",
        departmentName: "Electronics",
        courseCode: "EC210",
        courseTitle: "Digital Electronics",
        sectionName: "Section A",
        studentEmail: "aarav.patel@sit.edu.in",
      }),
      row({
        departmentCode: "ECE",
        departmentName: "Electronics",
        courseCode: "EC210",
        courseTitle: "Digital Electronics",
        sectionName: "Section A",
        studentEmail: "diya.sharma@sit.edu.in",
      }),
    ];
    const applied = snapshot({
      departments: [
        { id: "dept-cse", code: "CSE", name: "Computer Science" },
        { id: "dept-math", code: "MATH", name: "Mathematics" },
        { id: "dept-ece", code: "ECE", name: "Electronics" },
      ],
      courses: [
        {
          id: "course-cs101",
          code: "CS101",
          title: "Introduction to Computer Science",
          departmentId: "dept-cse",
        },
        {
          id: "course-ma201",
          code: "MA201",
          title: "Discrete Mathematics",
          departmentId: "dept-math",
        },
        {
          id: "course-ec210",
          code: "EC210",
          title: "Digital Electronics",
          departmentId: "dept-ece",
        },
      ],
      sections: [
        { id: "section-cs101-a", courseId: "course-cs101", name: "Section A", term: "2026-Autumn" },
        { id: "section-ma201-a", courseId: "course-ma201", name: "Section A", term: "2026-Autumn" },
        { id: "section-ec210-a", courseId: "course-ec210", name: "Section A", term: "2026-Autumn" },
      ],
      enrollments: [
        { studentId: "user-aarav", sectionId: "section-cs101-a" },
        { studentId: "user-diya", sectionId: "section-cs101-a" },
        { studentId: "user-aarav", sectionId: "section-ec210-a" },
        { studentId: "user-diya", sectionId: "section-ec210-a" },
      ],
      studentsByEmail: {
        "aarav.patel@sit.edu.in": { id: "user-aarav", name: "Aarav Patel", usn: "SIT-CS-2023-001" },
        "diya.sharma@sit.edu.in": { id: "user-diya", name: "Diya Sharma", usn: null },
      },
    });
    const diff = computeRosterDiff(rows, applied);
    expect(diff.departmentsToCreate).toEqual([]);
    expect(diff.coursesToCreate).toEqual([]);
    expect(diff.coursesToUpdate).toEqual([]);
    expect(diff.sectionsToCreate).toEqual([]);
    expect(diff.enrollmentsToCreate).toEqual([]);
    expect(diff.pendingInviteEmails).toEqual([]);
    expect(diff.droppedRows).toEqual([]);
    expect(diff.enrollmentsExisting).toBe(4);
  });

  it("re-assigns a linked course to a new department and surfaces the move as an issue", () => {
    const diff = computeRosterDiff(
      [row({ departmentCode: "MATH", departmentName: "Mathematics" })],
      snapshot(),
    );
    expect(diff.coursesToUpdate).toEqual([
      {
        id: "course-cs101",
        code: "CS101",
        title: "Introduction to Computer Science",
        departmentId: "dept-math",
      },
    ]);
    expect(diff.droppedRows).toEqual([
      {
        row: 0,
        field: "departmentCode",
        message: 'course CS101 moves from department "CSE" to "MATH"',
      },
    ]);
  });

  it("re-assigns a linked course to a not-yet-created department with a null id the apply mutation resolves", () => {
    const diff = computeRosterDiff(
      [row({ departmentCode: "ECE", departmentName: "Electronics" })],
      snapshot(),
    );
    expect(diff.coursesToUpdate).toEqual([
      {
        id: "course-cs101",
        code: "CS101",
        title: "Introduction to Computer Science",
        departmentId: null,
      },
    ]);
    expect(diff.departmentsToCreate).toEqual([{ code: "ECE", name: "Electronics" }]);
    expect(diff.droppedRows).toEqual([
      {
        row: 0,
        field: "departmentCode",
        message: 'course CS101 moves from department "CSE" to "ECE"',
      },
    ]);
  });

  it("surfaces conflicting names for the same department code", () => {
    const diff = computeRosterDiff(
      [
        row({ departmentCode: "ECE", departmentName: "Electronics", sourceRow: 2 }),
        row({
          departmentCode: "ECE",
          departmentName: "Electronics & Communication",
          sourceRow: 5,
          courseCode: "EC210",
          courseTitle: "Digital Electronics",
          studentEmail: "diya.sharma@sit.edu.in",
        }),
      ],
      snapshot(),
    );
    expect(diff.droppedRows).toEqual([
      {
        row: 2,
        field: "departmentCode",
        message: 'course CS101 moves from department "CSE" to "ECE"',
      },
      {
        row: 5,
        field: "departmentName",
        message:
          'department code "ECE" appears with conflicting names: "Electronics" vs "Electronics & Communication"',
      },
    ]);
  });

  it("surfaces conflicting definitions for the same new course code", () => {
    const diff = computeRosterDiff(
      [
        row({
          departmentCode: "ECE",
          departmentName: "Electronics",
          courseCode: "EC210",
          courseTitle: "Digital Electronics",
          sourceRow: 2,
        }),
        row({
          departmentCode: "ECE",
          departmentName: "Electronics",
          courseCode: "EC210",
          courseTitle: "Digital Circuits",
          studentEmail: "diya.sharma@sit.edu.in",
          sourceRow: 7,
        }),
      ],
      snapshot(),
    );
    expect(diff.droppedRows).toEqual([
      {
        row: 7,
        field: "courseTitle",
        message:
          'course code "EC210" appears with conflicting definitions: "Digital Electronics" (ECE) vs "Digital Circuits" (ECE)',
      },
    ]);
  });

  it("cites the source row when a trimmed-empty row is dropped", () => {
    const diff = computeRosterDiff(
      [row({ courseCode: "   ", sourceRow: 9 })],
      snapshot(),
    );
    expect(diff.droppedRows).toEqual([
      {
        row: 9,
        field: "row",
        message: `row for "aarav.patel@sit.edu.in" (${"   "} Section A) is empty after trimming`,
      },
    ]);
  });
});
