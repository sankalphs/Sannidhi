import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/analytics/csv";

describe("toCsv", () => {
  it("emits plain fields unquoted with a trailing CRLF", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2\r\n");
  });

  it("quotes fields containing commas", () => {
    expect(toCsv(["name"], [["Doe, John"]])).toBe('name\r\n"Doe, John"\r\n');
  });

  it("doubles embedded quotes inside quoted fields", () => {
    expect(toCsv(["name"], [['He said "hi"']])).toBe('name\r\n"He said ""hi"""\r\n');
  });

  it("quotes fields containing newlines and carriage returns", () => {
    expect(toCsv(["v"], [["line1\nline2"]])).toBe('v\r\n"line1\nline2"\r\n');
    expect(toCsv(["v"], [["line1\rline2"]])).toBe('v\r\n"line1\rline2"\r\n');
  });

  it("leaves fields with no special characters unquoted", () => {
    expect(toCsv(["v"], [["plain"]])).toBe("v\r\nplain\r\n");
    expect(toCsv(["v"], [["with space"]])).toBe("v\r\nwith space\r\n");
  });

  it("renders null, undefined, and numbers per RFC 4180 field rules", () => {
    expect(toCsv(["a", "b", "c"], [[null, undefined, 42]])).toBe("a,b,c\r\n,,42\r\n");
    expect(toCsv(["n"], [[0.5]])).toBe("n\r\n0.5\r\n");
  });

  it("supports single-column rows without separators", () => {
    expect(toCsv(["only"], [["x"], ["y"]])).toBe("only\r\nx\r\ny\r\n");
  });

  it("serializes empty rows and multiple data rows", () => {
    expect(toCsv(["h"], [[], ["a"], []])).toBe("h\r\n\r\na\r\n\r\n");
  });

  it("neutralizes formula-like string cells so spreadsheets render them as text", () => {
    expect(toCsv(["v"], [["=SUM(A1:A2)"]])).toBe("v\r\n'=SUM(A1:A2)\r\n");
    expect(toCsv(["v"], [["+cmd|' /C calc'!A1"]])).toBe("v\r\n'+cmd|' /C calc'!A1\r\n");
    expect(toCsv(["v"], [["-2+3+cmd|' /C calc'!A1"]])).toBe("v\r\n'-2+3+cmd|' /C calc'!A1\r\n");
    expect(toCsv(["v"], [["@x(name)"]])).toBe("v\r\n'@x(name)\r\n");
  });

  it("leaves numeric cells and plain negatives untouched", () => {
    expect(toCsv(["n"], [[-5]])).toBe("n\r\n-5\r\n");
    expect(toCsv(["n"], [[0.5]])).toBe("n\r\n0.5\r\n");
  });
});
