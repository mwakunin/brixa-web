import { describe, expect, it } from "vitest";

import { billLine, type Charge, printedQuantity, standingCharges, visitWords } from "./cashier";

const charge: Charge = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "CONS-GEN",
  name: "Consultation, General clinic",
  category: "consultation",
  quantity: "1.000",
  unitPriceCents: 50_000,
  amountCents: 50_000,
  serviceDate: "2026-11-23",
  bedDay: false,
  manualReason: null,
  capturedAt: "2026-11-23T06:10:00.000Z",
  cancelledAt: null,
  cancellationReason: null,
};

describe("a quantity on the bill", () => {
  it("is said without the places the API keeps", () => {
    expect(printedQuantity("24.000")).toBe("24");
    expect(printedQuantity("1.500")).toBe("1.5");
    expect(printedQuantity("0.250")).toBe("0.25");
    expect(printedQuantity("10")).toBe("10");
  });
});

describe("a line of the bill", () => {
  it("is what was done, for one of it", () => {
    expect(billLine(charge)).toBe("Consultation, General clinic");
  });

  it("gives the price each when there was more than one", () => {
    expect(billLine({ ...charge, name: "Coartem 20/120 tablets", quantity: "24.000", unitPriceCents: 2_500, amountCents: 60_000 })).toBe("Coartem 20/120 tablets, at KES 25");
    expect(billLine({ ...charge, name: "Oxygen, per hour", quantity: "1.500", unitPriceCents: 25_050 })).toBe("Oxygen, per hour, at KES 250.50");
  });
});

describe("the lines on the bill", () => {
  it("leave out a cancelled charge", () => {
    const cancelled = { ...charge, id: "00000000-0000-4000-8000-000000000002", cancelledAt: "2026-11-23T07:00:00.000Z", cancellationReason: "Posted twice" };
    expect(standingCharges([charge, cancelled])).toEqual([charge]);
  });
});

describe("which visit a bill is for", () => {
  it("is today's, or yesterday's, by Nairobi's day", () => {
    expect(visitWords({ kind: "opd", startedAt: "2026-11-23T05:00:00.000Z" }, "2026-11-23")).toBe("today's outpatient visit");
    // 22:30 UTC on the 22nd is 01:30 on the 23rd in Nairobi.
    expect(visitWords({ kind: "emergency", startedAt: "2026-11-22T22:30:00.000Z" }, "2026-11-23")).toBe("today's emergency");
    expect(visitWords({ kind: "emergency", startedAt: "2026-11-22T20:30:00.000Z" }, "2026-11-23")).toBe("yesterday's emergency");
  });

  it("is named by its date when older", () => {
    expect(visitWords({ kind: "opd", startedAt: "2026-11-19T07:00:00.000Z" }, "2026-11-23")).toBe("outpatient visit of 19 November");
  });
});
