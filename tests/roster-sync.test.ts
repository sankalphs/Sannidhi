import { describe, expect, it } from "vitest";

import { MAX_ROSTER_ROWS, normalizeRosterRows } from "../convex/lib/rosterSyncRows";
import type { RosterRow } from "@/lib/roster/types";

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
    studentUsn: "SIT-001",
    ...overrides,
  };
}

describe("normalizeRosterRows", () => {
  it("trims, uppercases codes, and lowercases emails defensively", () => {
    const { rows, issues } = normalizeRosterRows([
      row({
        departmentCode: " cse ",
        departmentName: " Computer Science ",
        courseCode: " cs101 ",
        courseTitle: " Intro to CS ",
        sectionName: " Section A ",
        term: " 2026-Autumn ",
        studentEmail: " Aarav.Patel@Sit.Edu.In ",
        studentName: " Aarav Patel ",
        studentUsn: " SIT-001 ",
      }),
    ]);
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        departmentCode: "CSE",
        departmentName: "Computer Science",
        courseCode: "CS101",
        courseTitle: "Intro to CS",
        sectionName: "Section A",
        term: "2026-Autumn",
        studentEmail: "aarav.patel@sit.edu.in",
        studentName: "Aarav Patel",
        studentUsn: "SIT-001",
      },
    ]);
  });

  it("treats blank term and usn as undefined", () => {
    const { rows, issues } = normalizeRosterRows([row({ term: "   ", studentUsn: "" })]);
    expect(issues).toEqual([]);
    expect(rows[0]).not.toHaveProperty("term");
    expect(rows[0]).not.toHaveProperty("studentUsn");
    expect(rows[0].term).toBeUndefined();
    expect(rows[0].studentUsn).toBeUndefined();
  });

  it("drops exact duplicate enrollments, reporting the 1-based row and first occurrence", () => {
    const { rows, issues } = normalizeRosterRows([
      row(),
      row({ studentEmail: "diya.sharma@sit.edu.in", studentName: "Diya Sharma" }),
      row(),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].studentEmail).toBe("diya.sharma@sit.edu.in");
    expect(issues).toEqual([
      {
        row: 3,
        field: "student_email",
        message:
          'duplicate enrollment for "aarav.patel@sit.edu.in" in CS101 Section A (first seen on row 1)',
      },
    ]);
  });

  it("keeps duplicates that differ by term as distinct enrollments", () => {
    const { rows, issues } = normalizeRosterRows([row(), row({ term: "2026-Spring" })]);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("normalizes before deduping so case variants collapse to one row", () => {
    const { rows, issues } = normalizeRosterRows([
      row(),
      row({ courseCode: "cs101", studentEmail: "AARAV.PATEL@SIT.EDU.IN" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(issues).toEqual([
      {
        row: 2,
        field: "student_email",
        message:
          'duplicate enrollment for "aarav.patel@sit.edu.in" in CS101 Section A (first seen on row 1)',
      },
    ]);
  });

  it("handles empty input", () => {
    const { rows, issues } = normalizeRosterRows([]);
    expect(rows).toEqual([]);
    expect(issues).toEqual([]);
  });
});

describe("MAX_ROSTER_ROWS", () => {
  it("caps the per-call row count at a sane batch size", () => {
    expect(MAX_ROSTER_ROWS).toBe(500);
  });
});
