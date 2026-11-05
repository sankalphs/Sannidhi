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

/** Minutes since midnight (0–1439) of an instant in the institution timezone. */
export function institutionMinutesOfDay(timestamp: number): number {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", {
    timeZone: INSTITUTION_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(timestamp)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
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
