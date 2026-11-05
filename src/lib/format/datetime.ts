import { INSTITUTION_TIME_ZONE } from "@/lib/attendance/timezone";

/**
 * Display formatters pinned to the institution's clock, so server-rendered
 * and client-rendered surfaces agree no matter where the code runs.
 * Use these for any timestamp a person reads; use timezone.ts for bucketing.
 */
const LOCALE = "en-IN";

const DATE = new Intl.DateTimeFormat(LOCALE, {
  timeZone: INSTITUTION_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat(LOCALE, {
  timeZone: INSTITUTION_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  timeZone: INSTITUTION_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_TIME_SECONDS = new Intl.DateTimeFormat(LOCALE, {
  timeZone: INSTITUTION_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/** "5 Nov 2026" */
export function formatInstitutionDate(timestamp: number): string {
  return DATE.format(timestamp);
}

/** "1:33 pm" */
export function formatInstitutionTime(timestamp: number): string {
  return TIME.format(timestamp);
}

/** "5 Nov 2026, 1:33 pm" — pass `{ seconds: true }` for audit trails. */
export function formatInstitutionDateTime(
  timestamp: number,
  options: { seconds?: boolean } = {},
): string {
  return (options.seconds === true ? DATE_TIME_SECONDS : DATE_TIME).format(timestamp);
}

/** Asia/Kolkata has no DST, so the institution's UTC offset is fixed. */
const INSTITUTION_UTC_OFFSET = "+05:30";

/**
 * Epoch ms of institution-clock midnight for a "YYYY-MM-DD" key (what an
 * `<input type="date">` yields), or undefined for an empty/invalid key.
 */
export function institutionDayStartMs(dateKey: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return undefined;
  const ms = Date.parse(`${dateKey}T00:00:00${INSTITUTION_UTC_OFFSET}`);
  return Number.isNaN(ms) ? undefined : ms;
}
