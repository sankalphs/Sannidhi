export const LEDGER_EVENT_CATEGORIES = ["device", "identity", "attendance"] as const;

export type LedgerEventCategory = (typeof LEDGER_EVENT_CATEGORIES)[number];

export type LedgerEventCore = {
  institutionId: string;
  category: LedgerEventCategory;
  type: string;
  actorUserId?: string;
  subjectUserId?: string;
  deviceId?: string;
  payload: Record<string, unknown>;
};

export type LedgerHashInput = LedgerEventCore & {
  seq: number;
  prevEventHash?: string | null;
};

export const GENESIS_SEQ = 0;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

export function canonicalEventJson(event: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(event));
}

const textEncoder = new TextEncoder();

export async function computeEventHash(input: LedgerHashInput): Promise<string> {
  const canonical = canonicalEventJson({
    seq: input.seq,
    prevEventHash: input.prevEventHash ?? null,
    institutionId: input.institutionId,
    category: input.category,
    type: input.type,
    actorUserId: input.actorUserId ?? null,
    subjectUserId: input.subjectUserId ?? null,
    deviceId: input.deviceId ?? null,
    payload: input.payload ?? {},
  });
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
