import { en } from "@/strings/en";

/**
 * Business dates, as the API computes them (brixa-api `lib/dates.ts`).
 *
 * "Today" is Nairobi's, never the device's: a desk computer set to another
 * zone, or to UTC, would otherwise show yesterday's date for the first three
 * hours of each day. Kenya has kept UTC+3 without daylight saving since 1942.
 * Each value is assembled from typed parts, so the layout never depends on
 * how the browser punctuates a locale.
 */
export const BUSINESS_TIME_ZONE = "Africa/Nairobi";

function partsOf(format: Intl.DateTimeFormat, at: Date): (type: Intl.DateTimeFormatPartTypes) => string {
  const parts = format.formatToParts(at);
  return type => parts.find(part => part.type === type)?.value ?? "";
}

const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Kenyan calendar day of `at`, as `YYYY-MM-DD`, the shape the API's dates take. */
export function businessDate(at: Date = new Date()): string {
  const part = partsOf(dayParts, at);
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Whole years from `dateOfBirth` to `today`, both Kenyan days. */
function ageInYears(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

/**
 * How long until the next Kenyan day begins, at Nairobi's midnight: for a
 * screen left open overnight to move to the new day by itself. Kenya has
 * kept +03:00 since 1942, so the next midnight is fixed.
 */
export function msUntilNextBusinessDay(at: Date = new Date()): number {
  return msUntilDayAfter(businessDate(at), at);
}

/** How long until the Kenyan day after `date` begins: less than nothing once it has. */
export function msUntilDayAfter(date: string, at: Date = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d + 1) - 3 * 3_600_000 - at.getTime();
}

/** An age as staff say it, and as the API prints it on a document: "34 years", "8 months", "12 days". */
export function printedAge(dateOfBirth: string, today: string): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const years = ageInYears(dateOfBirth, today);
  if (years >= 1)
    return plural(years, "year");
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months >= 1)
    return plural(months, "month");
  return plural(Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / 86_400_000), "day");
}

// A date is a day, not an instant: it is printed as itself, read in UTC. Read at Nairobi's midnight, a day
// before 1942, when Nairobi kept +02:45 (and +02:30 before that), would print as the day before.
const longDayParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** A date in words: `1997-06-14` → "14 June 1997". */
export function printedDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const part = partsOf(longDayParts, new Date(Date.UTC(y, m - 1, d)));
  return `${part("day")} ${part("month")} ${part("year")}`;
}

/** A date in words, without its year when it is this year's: "3 March", "30 December 2025". */
export function printedDateThisYear(date: string, today: string): string {
  const printed = printedDate(date);
  return date.slice(0, 4) === today.slice(0, 4) ? printed.slice(0, printed.lastIndexOf(" ")) : printed;
}

/** The calendar day before `date`, both `YYYY-MM-DD`. */
export function dayBefore(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** A recent day, as said at a desk: "Today", "Yesterday", else the date ("3 March"). */
export function printedDay(date: string, today: string): string {
  if (date === today)
    return en.dates.today;
  if (date === dayBefore(today))
    return en.dates.yesterday;
  return printedDateThisYear(date, today);
}

const clockParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  numberingSystem: "latn",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The Kenyan wall-clock time of `at`: "09:42". */
export function clockTime(at: Date): string {
  const part = partsOf(clockParts, at);
  return `${part("hour")}:${part("minute")}`;
}

/** When something began, as "since …" goes on: the time today ("09:42"), with its date before today ("21 November, 20:11"). */
export function printedSince(at: Date, today: string): string {
  const date = businessDate(at);
  return date === today ? clockTime(at) : en.dates.dayAndTime(printedDateThisYear(date, today), clockTime(at));
}
