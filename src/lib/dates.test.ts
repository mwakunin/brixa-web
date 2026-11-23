import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { businessDate, clockTime, printedAge, printedDate, printedDay, printedSince } from "./dates";

// A desk computer set to another zone: every answer below must still be Nairobi's.
const devicesZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  process.env.TZ = devicesZone;
});

describe("today, in Nairobi", () => {
  it.each([
    // 01:30 in Nairobi on 1 January is still 31 December in UTC, and in Los Angeles.
    ["2026-12-31T22:30:00Z", "2027-01-01"],
    ["2026-08-31T21:00:00Z", "2026-09-01"],
    // 23:59 in Nairobi is still the same day.
    ["2026-08-31T20:59:00Z", "2026-08-31"],
  ])("at %s is %s, whatever the device's zone", (instant, date) => {
    expect(businessDate(new Date(instant))).toBe(date);
  });

  it("is not the device's day, which these tests would otherwise not notice", () => {
    expect(new Date("2026-12-31T22:30:00Z").getDate()).toBe(31);
  });

  it("tells the time on Nairobi's clock", () => {
    expect(clockTime(new Date("2026-11-22T06:42:00Z"))).toBe("09:42");
    expect(clockTime(new Date("2026-11-22T21:05:00Z"))).toBe("00:05");
  });
});

describe("ages, as staff say them", () => {
  it.each([
    ["1997-06-14", "2026-11-22", "29 years"],
    ["2025-11-22", "2026-11-22", "1 year"],
    ["2025-11-23", "2026-11-22", "11 months"],
    ["2026-10-22", "2026-11-22", "1 month"],
    ["2026-11-10", "2026-11-22", "12 days"],
    ["2026-11-22", "2026-11-22", "0 days"],
  ])("born %s, on %s, is %s", (born, today, age) => {
    expect(printedAge(born, today)).toBe(age);
  });
});

describe("dates in words", () => {
  it("print the day, the month's name and the year", () => {
    expect(printedDate("1997-06-14")).toBe("14 June 1997");
    expect(printedDate("2027-01-01")).toBe("1 January 2027");
  });

  it("print a birth date from before 1942 as the day it was, though Nairobi kept other offsets then", () => {
    // +02:45 until 1942, +02:30 before that: a date read as midnight at +03:00 fell on the day before.
    expect(printedDate("1940-06-14")).toBe("14 June 1940");
    expect(printedDate("1930-01-01")).toBe("1 January 1930");
    expect(printedDay("1940-06-14", "2026-11-22")).toBe("14 June 1940");
  });

  it.each([
    ["2026-11-22", "Today"],
    ["2026-11-21", "Yesterday"],
    ["2026-03-03", "3 March"],
    ["2025-12-30", "30 December 2025"],
  ])("say %s, seen on 22 November 2026, as %s", (date, said) => {
    expect(printedDay(date, "2026-11-22")).toBe(said);
  });

  it("say since when: the time today, the date and time before it", () => {
    expect(printedSince(new Date("2026-11-22T06:42:00Z"), "2026-11-22")).toBe("09:42");
    expect(printedSince(new Date("2026-11-21T17:11:00Z"), "2026-11-22")).toBe("21 November, 20:11");
    // 22:30 UTC on the 21st is 01:30 on the 22nd in Nairobi: today.
    expect(printedSince(new Date("2026-11-21T22:30:00Z"), "2026-11-22")).toBe("01:30");
    expect(printedSince(new Date("2025-12-30T06:00:00Z"), "2026-11-22")).toBe("30 December 2025, 09:00");
  });

  it("know yesterday across a month and a year", () => {
    expect(printedDay("2026-12-31", "2027-01-01")).toBe("Yesterday");
    expect(printedDay("2026-02-28", "2026-03-01")).toBe("Yesterday");
  });
});
