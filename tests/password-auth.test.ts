import { describe, expect, it } from "vitest";

import { hashPassword, SCRYPT_KEY_LENGTH, verifyPassword } from "@/lib/auth/password";
import {
  classifyIdentifier,
  describePasswordIssues,
  normalizeUsn,
  validateEmail,
  validatePassword,
  validateUsn,
} from "@/lib/auth/password-policy";

describe("password hashing", () => {
  it("round-trips a password through hash and verify", async () => {
    const hash = await hashPassword("correct horse battery 7");
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
    await expect(verifyPassword("correct horse battery 7", hash)).resolves.toBe(true);
  });

  it("rejects wrong passwords", async () => {
    const hash = await hashPassword("correct horse battery 7");
    await expect(verifyPassword("wrong horse battery 7", hash)).resolves.toBe(false);
  });

  it("produces a unique salt per hash", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password-1"),
      hashPassword("same-password-1"),
    ]);
    expect(a).not.toBe(b);
  });

  it("derives a full-length key", async () => {
    const hash = await hashPassword("whatever-99");
    const encoded = hash.split("$").at(-1) ?? "";
    expect(Buffer.from(encoded, "base64").length).toBe(SCRYPT_KEY_LENGTH);
  });

  it("returns false for malformed or truncated stored hashes", async () => {
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "bcrypt$10$abc$def")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$bad$8$1$!!!$!!!")).resolves.toBe(false);
    await expect(verifyPassword("x", "")).resolves.toBe(false);
  });
});

describe("password policy", () => {
  it.each([
    ["short1", ["password_too_short"]],
    ["no-digits-here", ["password_missing_digit"]],
    ["1234567890", ["password_missing_letter"]],
    ["a".repeat(129), ["password_too_long", "password_missing_digit"]],
  ])("flags %s", (password, expected) => {
    expect(validatePassword(password)).toEqual(expected);
  });

  it("accepts a strong-enough password", () => {
    expect(validatePassword("Sunny-Campus42")).toEqual([]);
  });

  it("describes issues as a single sentence", () => {
    expect(describePasswordIssues(["password_too_short", "password_missing_digit"])).toBe(
      "Password must be at least 10 characters. Password must include at least one number.",
    );
  });
});

describe("usn policy", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeUsn("  1si22cs001 ")).toBe("1SI22CS001");
  });

  it.each(["1SI22CS001", "ABC123", "22CS"])("accepts %s", (usn) => {
    expect(validateUsn(usn)).toEqual([]);
  });

  it.each(["", "AB", "1SI22CS00!#", "has space1", "x".repeat(25)])("rejects %s", (usn) => {
    expect(validateUsn(usn)).toEqual(["usn_invalid_format"]);
  });
});

describe("identifier classification", () => {
  it("treats @ as email and everything else as USN", () => {
    expect(classifyIdentifier("a@b.co")).toBe("email");
    expect(classifyIdentifier("1SI22CS001")).toBe("usn");
  });
});

describe("email validation", () => {
  it("accepts plain addresses and rejects junk", () => {
    expect(validateEmail("ananya@student.edu")).toBe(true);
    expect(validateEmail("not-an-email")).toBe(false);
    expect(validateEmail("missing@tld")).toBe(false);
  });
});
