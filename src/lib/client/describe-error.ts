const SERVER_ERROR_FRAMING =
  /^\s*(?:\[Request ID: [^\]]*\]\s*)?(?:Server Error\s*)?(?:Uncaught (?:ConvexError|Error):\s*)?/;

/**
 * Removes the "[Request ID: …] Server Error\nUncaught ConvexError: " framing
 * Convex adds to error messages, plus any trailing stack lines, leaving only
 * the authored message ("" when nothing authored remains).
 */
export function stripServerErrorFraming(message: string): string {
  const [firstLine = ""] = message.replace(SERVER_ERROR_FRAMING, "").split("\n");
  return firstLine.trim();
}

/**
 * Reads the human-relevant message out of a thrown Convex error: the convex
 * client surfaces the original ConvexError message in `error.data` while
 * `error.message` degrades to a generic "Server Error".
 */
export function convexErrorMessage(cause: unknown): string | null {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (typeof data === "string") {
      const message = stripServerErrorFraming(data);
      if (message.length > 0) return message;
    }
  }
  return null;
}

export type ErrorTranslation = Array<{ match: string; message: string }>;

/**
 * Renders a mutation failure for the user: known error codes map to friendly
 * copy via per-surface translations, anything else falls back to a generic
 * retry message. One table replaces the per-component describeError copies.
 */
export function describeConvexError(
  cause: unknown,
  translations: ErrorTranslation,
  fallback: string,
): string {
  const raw = convexErrorMessage(cause);
  if (raw !== null) {
    for (const entry of translations) {
      if (raw === entry.match) return entry.message;
    }
    return raw;
  }
  return fallback;
}
