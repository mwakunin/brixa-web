import { describe, expect, it } from "vitest";

import { printedPhone } from "./phone";

describe("a phone number, as staff read it", () => {
  it("is a Kenyan number as it is dialled at home, in three groups", () => {
    expect(printedPhone("+254712345678")).toBe("0712 345 678");
    expect(printedPhone("+254112345678")).toBe("0112 345 678");
  });

  it("is any other number as it was given, with its country code", () => {
    expect(printedPhone("+256772123456")).toBe("+256772123456");
  });
});
