import { describe, expect, it } from "vitest";

import { formatKes } from "./money";

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
