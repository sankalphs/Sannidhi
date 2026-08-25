import { describe, expect, it, vi } from "vitest";

import { convexErrorMessage, deviceErrorResponse } from "../src/lib/api/device-errors";

class ConvexError extends Error {
  data: string;
  constructor(data: string) {
    super("Server Error");
    this.name = "ConvexError";
    this.data = data;
  }
}

describe("convexErrorMessage", () => {
  it("prefers ConvexError.data over the generic message", () => {
    expect(convexErrorMessage(new ConvexError("another active device already exists"))).toBe(
      "another active device already exists",
    );
  });

  it("falls back to error.message for plain errors", () => {
    expect(convexErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to a placeholder for unknown shapes", () => {
    expect(convexErrorMessage(undefined)).toBe("Device request failed");
    expect(convexErrorMessage({ data: 42 })).toBe("Device request failed");
  });
});

describe("deviceErrorResponse", () => {
  async function jsonResponse(error: unknown) {
    const response = deviceErrorResponse("test", error);
    return { status: response.status, body: await response.json() };
  }

  it("maps a ConvexError about an existing active device to 409", async () => {
    const { status, body } = await jsonResponse(
      new ConvexError(
        "another active device already exists; request a replacement to switch devices",
      ),
    );
    expect(status).toBe(409);
    expect(body.error).toContain("Another active device already exists");
  });

  it("maps an incorrect possession code to 400", async () => {
    const { status, body } = await jsonResponse(new ConvexError("incorrect code"));
    expect(status).toBe(400);
    expect(body.error).toContain("Incorrect verification code");
  });

  it("maps verification expiry to 400", async () => {
    const { status } = await jsonResponse(new ConvexError("verification expired"));
    expect(status).toBe(400);
  });

  it("maps unauthorized to 403", async () => {
    const { status } = await jsonResponse(new ConvexError("unauthorized"));
    expect(status).toBe(403);
  });

  it("maps identity re-verification to 403", async () => {
    const { status, body } = await jsonResponse(
      new ConvexError("identity re-verification required"),
    );
    expect(status).toBe(403);
    expect(body.error).toContain("re-verification");
  });

  it("returns a generic 500 for unmatched errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await jsonResponse(new ConvexError("something novel"));
    expect(status).toBe(500);
    expect(body.error).toBe("Something went wrong. Please try again.");
    consoleSpy.mockRestore();
  });
});
