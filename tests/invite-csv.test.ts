import { describe, expect, it } from "vitest";

import { parseInviteCsv } from "@/lib/invites/csv";

describe("parseInviteCsv", () => {
  it("parses the happy path", () => {
    const result = parseInviteCsv("email,name,role\naarav@sit.edu.in,Aarav Patel,student");
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { email: "aarav@sit.edu.in", name: "Aarav Patel", role: "student" },
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const csv = 'email,name,role\ndiya@sit.edu.in,"Sharma, Diya ""Di""",faculty';
    const result = parseInviteCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { email: "diya@sit.edu.in", name: 'Sharma, Diya "Di"', role: "faculty" },
    ]);
  });

  it("tolerates CRLF line endings and a UTF-8 BOM", () => {
    const csv = "\uFEFFemail,name,role\r\npriya@sit.edu.in,Priya Menon,faculty\r\n";
    const result = parseInviteCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { email: "priya@sit.edu.in", name: "Priya Menon", role: "faculty" },
    ]);
  });

  it("accepts case-insensitive headers in any column order", () => {
    const csv = "Role,Name,Email\nadmin,Ananya Iyer,ananya@sit.edu.in";
    const result = parseInviteCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { email: "ananya@sit.edu.in", name: "Ananya Iyer", role: "admin" },
    ]);
  });

  it("rejects unknown roles but still parses valid rows", () => {
    const csv =
      "email,name,role\nvikram@sit.edu.in,Vikram Desai,principal\nrohan@sit.edu.in,Rohan Gupta,auditor";
    const result = parseInviteCsv(csv);
    expect(result.rows).toEqual([
      { email: "rohan@sit.edu.in", name: "Rohan Gupta", role: "auditor" },
    ]);
    expect(result.errors).toEqual([{ line: 2, reason: 'unknown role "principal"' }]);
  });

  it("rejects malformed emails and missing names with line numbers", () => {
    const csv = "email,name,role\nnot-an-email,No Email,student\nok@sit.edu.in,,student";
    const result = parseInviteCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { line: 2, reason: 'invalid email "not-an-email"' },
      { line: 3, reason: "missing name" },
    ]);
  });

  it("deduplicates repeated emails within the file (case-insensitively)", () => {
    const csv =
      "email,name,role\nmeera@sit.edu.in,Meera A,student\nMEERA@sit.edu.in,Meera B,student";
    const result = parseInviteCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      { line: 3, reason: 'duplicate email "MEERA@sit.edu.in" in file' },
    ]);
  });

  it("flags collisions against existing emails passed via options", () => {
    const csv = "email,name,role\naarav@sit.edu.in,Aarav Patel,student";
    const result = parseInviteCsv(csv, { existingEmails: ["AARAV@sit.edu.in"] });
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { line: 2, reason: '"aarav@sit.edu.in" already has an account' },
    ]);
  });

  it("reports unterminated quoted fields as malformed quoting", () => {
    const csv = 'email,name,role\naarav@sit.edu.in,"Aarav Patel,student';
    const result = parseInviteCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ line: 2, reason: "unterminated quoted field" }]);
  });

  it("rejects a file whose header is missing required columns", () => {
    const result = parseInviteCsv("address,name\nnowhere,Nobody");
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ line: 1, reason: 'header must include a "email" column' }]);
  });
});
