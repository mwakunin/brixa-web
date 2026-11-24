import { describe, expect, it } from "vitest";

import { billLine, billsToChoose, type Charge, creditFor, owingBillOf, emptyPayment, emptyWaiver, matchingPayments, mayReadAccount, NOT_BILLED, type PaymentDraft, paymentFieldProblem, payingFor, printedQuantity, standingCharges, visitWords, waiverFor } from "./cashier";

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

describe("what a payment sends", () => {
  const draft: PaymentDraft = { ...emptyPayment, amount: "2,200" };

  it("is the amount typed, for cash", () => {
    expect(payingFor({ ...draft, method: "cash" }, null)).toEqual({ ok: true, paying: { method: "cash", amountCents: 220_000 } });
  });

  it("is the card's or the transfer's reference, trimmed, beside the amount", () => {
    expect(payingFor({ ...draft, method: "card_or_bank", cardOrBank: "card", reference: " AUTH 778899 " }, null)).toEqual({ ok: true, paying: { method: "card", amountCents: 220_000, reference: "AUTH 778899" } });
    expect(payingFor({ ...draft, method: "card_or_bank", cardOrBank: "bank", reference: "FT2611/0042" }, null)).toMatchObject({ ok: true, paying: { method: "bank" } });
  });

  it("is the phone to prompt, trimmed", () => {
    expect(payingFor({ ...draft, method: "prompt", phone: " 0712 345 678 " }, null)).toEqual({ ok: true, paying: { method: "prompt", amountCents: 220_000, phone: "0712 345 678" } });
  });

  it("is the M-Pesa payment chosen, for its own amount, whatever was typed", () => {
    expect(payingFor({ ...draft, method: "paybill", transactionId: "tx-1" }, 150_000)).toEqual({ ok: true, paying: { method: "paybill", transactionId: "tx-1", amountCents: 150_000 } });
  });

  it("asks again for what is missing or not possible, at its field", () => {
    expect(payingFor({ ...draft, method: "cash", amount: "0" }, null)).toEqual({ ok: false, problems: { amount: expect.any(String) } });
    expect(payingFor({ ...draft, method: "cash", amount: "2200.50" }, null)).toEqual({ ok: false, problems: { amount: expect.any(String) } });
    expect(payingFor({ ...draft, method: "prompt", phone: "0712" }, null)).toEqual({ ok: false, problems: { phone: expect.any(String) } });
    expect(payingFor({ ...draft, method: "card_or_bank", reference: "AB" }, null)).toEqual({ ok: false, problems: { reference: expect.any(String) } });
    expect(payingFor({ ...draft, method: "card_or_bank", reference: "AUTH#1" }, null)).toEqual({ ok: false, problems: { reference: expect.any(String) } });
    expect(payingFor({ ...draft, method: "paybill" }, null)).toEqual({ ok: false, problems: { transaction: expect.any(String) } });
  });
});

describe("an M-Pesa payment waiting to be matched", () => {
  const waiting = [
    { transactionId: "QK72HD91XZ", msisdn: "254712345678" },
    { transactionId: "QK72HE00AB", msisdn: "254722000111" },
  ];

  it("is found by its code, in any case, or by the phone that paid, as dialled at home or with the country code", () => {
    expect(matchingPayments(waiting, "qk72hd").map(t => t.transactionId)).toEqual(["QK72HD91XZ"]);
    expect(matchingPayments(waiting, "0712 345 678").map(t => t.transactionId)).toEqual(["QK72HD91XZ"]);
    expect(matchingPayments(waiting, "+254 722 000").map(t => t.transactionId)).toEqual(["QK72HE00AB"]);
    expect(matchingPayments(waiting, "678").map(t => t.transactionId)).toEqual(["QK72HD91XZ"]);
  });

  it("is found by the digits of its code as well as by phone", () => {
    expect(matchingPayments(waiting, "91").map(t => t.transactionId)).toEqual(["QK72HD91XZ"]);
    expect(matchingPayments(waiting, "00").map(t => t.transactionId)).toEqual(["QK72HE00AB"]);
  });

  it("is every one waiting when nothing is typed", () => {
    expect(matchingPayments(waiting, " ")).toHaveLength(2);
  });
});

describe("a payment's field the API did not accept", () => {
  it("is found from the path it gave, and said in our words", () => {
    expect(paymentFieldProblem("phone")?.field).toBe("phone");
    expect(paymentFieldProblem("reference")?.field).toBe("reference");
    expect(paymentFieldProblem("amountCents")?.field).toBe("amount");
    expect(paymentFieldProblem("patientId")).toBeNull();
  });
});

describe("who sees what a patient owes", () => {
  it("is whoever handles money, not a records clerk alone", () => {
    expect(mayReadAccount(["records_clerk", "cashier"])).toBe(true);
    expect(mayReadAccount(["auditor"])).toBe(true);
    expect(mayReadAccount(["records_clerk"])).toBe(false);
    expect(mayReadAccount(["nurse", "doctor"])).toBe(false);
  });
});

describe("what a waiver asks for", () => {
  it("is the amount and the reason, on the bill chosen", () => {
    expect(waiverFor({ billId: "bill-1", amount: "1,000", reason: " Cannot pay, as the in-charge said " })).toEqual({ ok: true, waiver: { invoiceId: "bill-1", amountCents: 100_000, reason: "Cannot pay, as the in-charge said" } });
  });

  it("is on no bill yet when the charges not billed are chosen, which are billed first", () => {
    expect(waiverFor({ billId: NOT_BILLED, amount: "300", reason: "Staff child" })).toMatchObject({ ok: true, waiver: { invoiceId: null } });
  });

  it("asks again for what is missing, at its field", () => {
    expect(waiverFor(emptyWaiver)).toEqual({ ok: false, problems: { bill: expect.any(String), amount: expect.any(String), reason: expect.any(String) } });
    expect(waiverFor({ billId: "bill-1", amount: "300", reason: "ok" })).toEqual({ ok: false, problems: { reason: expect.any(String) } });
  });
});

describe("the bills out a payment can be taken against", () => {
  const bill = (id: string, balanceCents: number) => ({ id, balanceCents });
  const none = () => false;

  it("are those still owing, oldest first, the oldest chosen at first", () => {
    const { listed, first } = billsToChoose([bill("a", 0), bill("b", 20_000), bill("c", 5_000)], none);
    expect(listed.map(b => b.id)).toEqual(["b", "c"]);
    expect(first?.id).toBe("b");
  });

  it("keep one paid off whose payment is still to show, and choose it at first, so its Try again or its Done is reached", () => {
    const { listed, first } = billsToChoose([bill("a", 0), bill("b", 20_000), bill("c", 0)], shown => shown.id === "c");
    expect(listed.map(b => b.id)).toEqual(["b", "c"]);
    expect(first?.id).toBe("c");
  });

  it("are none once nothing is owed and no payment is still to show", () => {
    expect(billsToChoose([bill("a", 0)], none)).toEqual({ listed: [], first: null });
  });
});

describe("credit the cashier can use on a visit", () => {
  const visit = "00000000-0000-4000-8000-0000000000aa";
  const other = "00000000-0000-4000-8000-0000000000bb";
  const credit = (paymentId: string, encounterId: string | null, unallocatedCents: number) => ({ paymentId, encounterId, receivedAt: "2026-11-24T06:40:00.000Z", unallocatedCents });

  it("is the patient's own credit and this visit's deposits, never another visit's, oldest first as the account lists them", () => {
    const listed = [credit("patient", null, 60_000), credit("other-visit", other, 20_000), credit("this-visit", visit, 9_200), credit("spent", null, 0)];
    expect(creditFor(listed, visit).map(c => c.paymentId)).toEqual(["patient", "this-visit"]);
  });
});

describe("the bill a visit's credit goes on", () => {
  const visit = "00000000-0000-4000-8000-0000000000aa";
  const bill = (id: string, encounterId: string, balanceCents: number) => ({ id, number: id, encounterId, totalCents: 50_800, balanceCents });

  it("is the visit's oldest bill still owing", () => {
    expect(owingBillOf([bill("other", "elsewhere", 100), bill("paid", visit, 0), bill("old", visit, 5_000), bill("new", visit, 8_000)], visit)?.id).toBe("old");
  });

  it("is none when nothing out on the visit owes", () => {
    expect(owingBillOf([bill("paid", visit, 0)], visit)).toBeNull();
  });
});
