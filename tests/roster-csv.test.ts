import { describe, expect, it } from "vitest";

import { parseRosterCsv, ROSTER_CSV_HEADERS } from "@/lib/roster/csv";

const HEADER = ROSTER_CSV_HEADERS.join(",");

describe("parseRosterCsv", () => {
  it("parses the happy path with normalization", () => {
    const csv =
      "department_code,department_name,course_code,course_title,section_name,term,student_email,student_name,usn\n" +
      " cse ,Computer Science, cs101 ,Introduction to Computer Science,Section A,2026-Autumn, Aarav.Patel@Sit.Edu.In ,Aarav Patel,SIT-001";
    const result = parseRosterCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      {
        departmentCode: "CSE",
        departmentName: "Computer Science",
        courseCode: "CS101",
        courseTitle: "Introduction to Computer Science",
        sectionName: "Section A",
        term: "2026-Autumn",
        studentEmail: "aarav.patel@sit.edu.in",
        studentName: "Aarav Patel",
        studentUsn: "SIT-001",
      },
    ]);
  });

  it("treats empty term and usn as undefined", () => {
    const csv = `${HEADER}\nMATH,Mathematics,MA201,Discrete Mathematics,Section A,,x@y.edu.in,X Person,`;
    const result = parseRosterCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      {
        departmentCode: "MATH",
        departmentName: "Mathematics",
        courseCode: "MA201",
        courseTitle: "Discrete Mathematics",
        sectionName: "Section A",
        term: undefined,
        studentEmail: "x@y.edu.in",
        studentName: "X Person",
        studentUsn: undefined,
      },
    ]);
  });

  it("rejects a header mismatch and drops all rows", () => {
    const csv = `dept_code,department_name,course_code,course_title,section_name,term,student_email,student_name,usn\nCSE,Computer Science,CS101,Intro,Section A,2026-Autumn,a@b.edu.in,A Person,`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      {
        row: 1,
        field: "",
        message:
          'header mismatch: expected "department_code,department_name,course_code,course_title,section_name,term,student_email,student_name,usn"',
      },
    ]);
  });

  it("rejects a header with correct columns in the wrong order", () => {
    const csv =
      "student_email,student_name,usn,department_code,department_name,course_code,course_title,section_name,term\n" +
      "a@b.edu.in,A Person,,CSE,Computer Science,CS101,Intro,Section A,2026-Autumn";
    const result = parseRosterCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      {
        row: 1,
        field: "",
        message:
          'header mismatch: expected "department_code,department_name,course_code,course_title,section_name,term,student_email,student_name,usn"',
      },
    ]);
  });

  it("accepts a case-insensitive trimmed header in the exact column order", () => {
    const csv =
      " Department_Code ,DEPARTMENT_NAME,Course_Code,COURSE_TITLE,Section_Name,TERM,Student_Email,Student_Name,USN\n" +
      "CSE,Computer Science,CS101,Intro,Section A,2026-Autumn,a@b.edu.in,A Person,";
    const result = parseRosterCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it("drops rows missing required fields with per-field issues", () => {
    const csv = `${HEADER}\nCSE,Computer Science,CS101,Intro,Section A,2026-Autumn,not-an-email,A Person,\nCSE,Computer Science,,Intro,Section A,2026-Autumn,b@c.edu.in,B Person,`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      { row: 2, field: "student_email", message: 'invalid email "not-an-email"' },
      { row: 3, field: "course_code", message: "missing course_code" },
    ]);
  });

  it("drops invalid emails and keeps valid rows", () => {
    const csv = `${HEADER}\nCSE,Computer Science,CS101,Intro,Section A,2026-Autumn,nope,A Person,\nCSE,Computer Science,CS101,Intro,Section A,2026-Autumn,ok@sit.edu.in,Ok Person,`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.studentEmail).toBe("ok@sit.edu.in");
    expect(result.issues).toEqual([
      { row: 2, field: "student_email", message: 'invalid email "nope"' },
    ]);
  });

  it("drops missing required fields with a row-numbered issue", () => {
    const csv = `${HEADER}\nCSE,Computer Science,CS101,Intro,Section A,2026-Autumn,,A Person,\nCSE,Computer Science,CS101,Intro,,2026-Autumn,b@c.edu.in,B Person,`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      { row: 2, field: "student_email", message: "missing student_email" },
      { row: 3, field: "section_name", message: "missing section_name" },
    ]);
  });

  it("dedupes the same student+course+section+term, reporting the duplicate", () => {
    const csv =
      `${HEADER}\n` +
      "CSE,Computer Science,CS101,Intro,Section A,2026-Autumn,a@sit.edu.in,A Person,\n" +
      "CSE,Computer Science,CS101,Intro,Section A,2026-Autumn,a@sit.edu.in,A Person Again,\n" +
      "CSE,Computer Science,CS101,Intro,Section A,,a@sit.edu.in,A Person,";
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]?.term).toBeUndefined();
    expect(result.issues).toEqual([
      {
        row: 3,
        field: "student_email",
        message: 'duplicate enrollment for "a@sit.edu.in" in CS101 Section A (first seen on row 2)',
      },
    ]);
  });

  it("returns empty rows and issues for an empty file or header-only file", () => {
    expect(parseRosterCsv("")).toEqual({ rows: [], issues: [] });
    expect(parseRosterCsv(HEADER)).toEqual({ rows: [], issues: [] });
    expect(parseRosterCsv(`${HEADER}\n\n\n`)).toEqual({ rows: [], issues: [] });
  });

  it("handles quoted fields with commas and CRLF line endings", () => {
    const csv = `${HEADER}\r\nCSE,"Computer, Science",CS101,Intro,"Section A",2026-Autumn,a@sit.edu.in,"A ""AP"" Person",\r\n`;
    const result = parseRosterCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      {
        departmentCode: "CSE",
        departmentName: "Computer, Science",
        courseCode: "CS101",
        courseTitle: "Intro",
        sectionName: "Section A",
        term: "2026-Autumn",
        studentEmail: "a@sit.edu.in",
        studentName: 'A "AP" Person',
        studentUsn: undefined,
      },
    ]);
  });

  it("reports an unterminated quoted field with a row number", () => {
    const csv = `${HEADER}\nCSE,"Computer Science,CS101,Intro,Section A,2026-Autumn,a@sit.edu.in,A Person,`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([{ row: 2, field: "", message: "unterminated quoted field" }]);
  });
});
