/**
 * Institutions operate on IST; server-side "today" and day-key bucketing
 * must match what faculty and students see, not the UTC clock of whatever
 * machine the query runs on. All date-bucketing surfaces use this zone.
 */
export const INSTITUTION_TIME_ZONE = "Asia/Kolkata";

/**
 * 0=Sunday…6=Saturday in the institution timezone for a given instant —
 * mirrors Date#getDay() but pinned to IST instead of the server's zone.
 */
export function institutionDayOfWeek(timestamp: number): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: INSTITUTION_TIME_ZONE,
    weekday: "short",
  }).format(timestamp);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/** Calendar date (YYYY-MM-DD) of an instant in the institution timezone. */
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: INSTITUTION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function institutionDateKey(timestamp: number): string {
  return DATE_KEY_FORMATTER.format(timestamp);
}

/**
 * Minutes the institution timezone is offset from UTC at the given instant —
 * positive east of UTC. Lets callers compute IST wall-clock time from a UTC
 * clock without dragging in a full date library.
 */
export function institutionOffsetMinutes(timestamp: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: INSTITUTION_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(timestamp);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+5:30";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (match === null) return 330;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = match[3] !== undefined ? Number.parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}
