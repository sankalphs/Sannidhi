export const CHECK_IN_PATH = "/student/check-in";

/** The URL encoded in the class QR, so a phone's camera app opens check-in directly. */
export function checkInLink(origin: string, token: string): string {
  return `${origin}${CHECK_IN_PATH}?code=${encodeURIComponent(token)}`;
}

/** The challenge token from scanned or pasted input: a raw token, or a check-in link's `code`. */
export function extractCheckInCode(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  return url.searchParams.get("code")?.trim() ?? trimmed;
}
