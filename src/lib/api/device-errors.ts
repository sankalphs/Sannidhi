import { NextResponse } from "next/server";

type MappedError = { status: number; message: string };

const ERROR_MAP: Array<{ pattern: RegExp; mapped: MappedError }> = [
  {
    pattern: /unauthorized|suspended devices can only be reinstated/i,
    mapped: { status: 403, message: "Forbidden" },
  },
  {
    pattern: /challenge invalid or expired|verification (expired|consumed|attempts-exhausted)/i,
    mapped: { status: 400, message: "Verification expired or invalid. Please start again." },
  },
  {
    pattern: /another active device already exists/i,
    mapped: {
      status: 409,
      message: "Another active device already exists. Request a replacement to switch devices.",
    },
  },
  {
    pattern: /identity re-verification required/i,
    mapped: { status: 403, message: "Identity re-verification required." },
  },
];

export function deviceErrorResponse(scope: string, error: unknown): NextResponse {
  const rawMessage = error instanceof Error ? error.message : "Device request failed";
  console.error(`[device-api:${scope}]`, error);
  for (const entry of ERROR_MAP) {
    if (entry.pattern.test(rawMessage)) {
      return NextResponse.json({ error: entry.mapped.message }, { status: entry.mapped.status });
    }
  }
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
