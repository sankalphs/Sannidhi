import { describe, expect, it } from "vitest";

import { checkInLink, extractCheckInCode } from "@/lib/client/check-in-link";

const TOKEN = "eyJzaWQiOiJhYmMifQ.c2lnbmF0dXJl-_";

describe("checkInLink", () => {
  it("points the phone camera at the student check-in page", () => {
    expect(checkInLink("https://sannidhi.example", TOKEN)).toBe(
      `https://sannidhi.example/student/check-in?code=${TOKEN}`,
    );
  });
});

describe("extractCheckInCode", () => {
  it("passes raw tokens through, trimmed", () => {
    expect(extractCheckInCode(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it("reads the code out of a check-in link", () => {
    expect(extractCheckInCode(checkInLink("https://sannidhi.example", TOKEN))).toBe(TOKEN);
    expect(extractCheckInCode(` http://localhost:3000/student/check-in?code=${TOKEN} `)).toBe(
      TOKEN,
    );
  });

  it("leaves links without a code untouched so the server reports them", () => {
    expect(extractCheckInCode("https://example.com/elsewhere")).toBe(
      "https://example.com/elsewhere",
    );
  });
});
