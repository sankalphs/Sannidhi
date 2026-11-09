import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import { convexRouteErrorResponse, publicConvexError } from "@/lib/api/route-errors";
import { convexErrorMessage, stripServerErrorFraming } from "@/lib/client/describe-error";

/** What ConvexHttpClient throws: framing in `message`, the authored text in `data`. */
function httpClientError(data: string): ConvexError<string> {
  const error = new ConvexError<string>(data);
  Object.defineProperty(error, "message", {
    value: `[Request ID: bb05f00d] Server Error\nUncaught ConvexError: ${data}\n`,
  });
  return error;
}

describe("stripServerErrorFraming", () => {
  it("removes the request id, Server Error and Uncaught prefixes", () => {
    expect(
      stripServerErrorFraming(
        "[Request ID: bb05f00d] Server Error\nUncaught ConvexError: unreadable clientDataJSON\n",
      ),
    ).toBe("unreadable clientDataJSON");
  });

  it("drops trailing stack lines and leaves clean messages alone", () => {
    expect(stripServerErrorFraming("Uncaught Error: boom\n    at handler (convex/x.ts:1)")).toBe(
      "boom",
    );
    expect(stripServerErrorFraming("Enter a valid email address.")).toBe(
      "Enter a valid email address.",
    );
  });

  it("returns empty when nothing authored remains", () => {
    expect(stripServerErrorFraming("[Request ID: 1] Server Error")).toBe("");
  });

  it("is applied by convexErrorMessage", () => {
    expect(convexErrorMessage({ data: "Uncaught ConvexError: invite expired" })).toBe(
      "invite expired",
    );
    expect(convexErrorMessage({ data: "[Request ID: 1] Server Error" })).toBeNull();
  });
});

describe("publicConvexError", () => {
  it("maps a WebAuthn origin mismatch to human copy", () => {
    const mapped = publicConvexError(
      httpClientError(
        'registration verification failed: Unexpected registration response origin "https://x.vercel.app", expected "https://sannidhi.app"',
      ),
    );
    expect(mapped?.message).toMatch(/main web address/);
    expect(mapped?.message).not.toMatch(/Request ID|Uncaught|origin/);
  });

  it("maps generic ceremony failures and unauthorized", () => {
    expect(publicConvexError(httpClientError("unreadable clientDataJSON"))?.message).toBe(
      "We couldn't verify your passkey. Please try again.",
    );
    expect(publicConvexError(httpClientError("unauthorized: token expired"))).toEqual({
      message: "You don't have access to do that. Sign in again and retry.",
      status: 403,
    });
  });

  it("passes other authored messages through sentence-cased", () => {
    expect(publicConvexError(httpClientError("you cannot change your own role"))).toEqual({
      message: "You cannot change your own role",
      status: 400,
    });
  });

  it("never forwards non-Convex errors or configuration detail", () => {
    expect(publicConvexError(new Error("[Request ID: 1] Server Error"))).toBeNull();
    expect(
      publicConvexError(httpClientError("NEXT_PUBLIC_APP_URL is not a valid URL: nope")),
    ).toBeNull();
  });
});

describe("convexRouteErrorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the raw error and answers with the fallback for infrastructure faults", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new Error("[Request ID: 1] Server Error\nUncaught Error: db down");
    const response = convexRouteErrorResponse("scope", raw, "Try again later.");
    expect(log).toHaveBeenCalledWith("[scope]", raw);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Try again later." });
  });
});
