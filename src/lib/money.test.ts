import { describe, expect, it } from "vitest";

import { centsFromShillings, formatKes } from "./money";

describe("printing money", () => {
  it("prints whole shillings without cents, grouped in thousands", () => {
    expect(formatKes(0)).toBe("KES 0");
    expect(formatKes(60_000)).toBe("KES 600");
    expect(formatKes(123_456_700)).toBe("KES 1,234,567");
  });

  it("prints cents only when there are some, as a unit price has", () => {
    expect(formatKes(250)).toBe("KES 2.50");
    expect(formatKes(105)).toBe("KES 1.05");
  });

  it("prints a credit with its sign", () => {
    expect(formatKes(-150_000)).toBe("-KES 1,500");
  });

  it("refuses what is not a whole number of cents", () => {
    expect(() => formatKes(2.5)).toThrow(RangeError);
    expect(() => formatKes(Number.NaN)).toThrow(RangeError);
  });
});

describe("an amount typed in shillings", () => {
  it("is cents, written with or without thousands grouped", () => {
    expect(centsFromShillings("2000")).toBe(200_000);
    expect(centsFromShillings(" 2,000 ")).toBe(200_000);
    expect(centsFromShillings("1 250 000")).toBe(125_000_000);
    expect(centsFromShillings("0")).toBe(0);
  });

  it("is nothing for what is not whole shillings", () => {
    for (const typed of ["", "2000.50", "2,00", "-500", "KES 500", "five", "1e3", "20,000,001"])
      expect(centsFromShillings(typed)).toBeNull();
  });

  it("is at most what the API takes as one amount, KES 20,000,000", () => {
    expect(centsFromShillings("20,000,000")).toBe(2_000_000_000);
    expect(centsFromShillings("20000001")).toBeNull();
  });
});
