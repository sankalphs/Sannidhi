import { NextResponse } from "next/server";

export function errorResponse(error: unknown, fallbackMessage = "Request failed") {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = /unauthorized|challenge invalid|not recognized/i.test(message) ? 403 : 400;
  if (/secret|token/i.test(message) && /invalid|missing/i.test(message)) {
    return NextResponse.json({ error: fallbackMessage }, { status });
  }
  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
