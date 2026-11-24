import { describe, expect, it } from "vitest";

import { type Adjustment, decidedToday, waitingWaivers } from "./waivers";

function adjustment(over: Partial<Adjustment>): Adjustment {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    invoiceId: "00000000-0000-4000-8000-000000000002",
    invoiceNumber: "INV-2026-000512",
    invoiceTotalCents: 80_000,
    encounterId: "00000000-0000-4000-8000-000000000003",
    patient: { id: "00000000-0000-4000-8000-000000000004", name: "Samuel Mutua", opNumber: "OP-000409" },
    documentId: null,
    number: null,
    kind: "waiver",
    amountCents: 50_000,
    reason: "Cannot pay. The doctor waived the fee.",
    status: "pending",
    requestedBy: "00000000-0000-4000-8000-000000000005",
    requestedByName: "Joyce Mwangi",
    requestedAt: "2026-11-24T07:40:00.000Z",
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    reversedAt: null,
    reversalReason: null,
    ...over,
  };
}

describe("the waivers waiting for the in-charge", () => {
  it("are the waivers still pending, the longest waiting first", () => {
    const later = adjustment({ id: "later", requestedAt: "2026-11-24T08:15:00.000Z" });
    const earlier = adjustment({ id: "earlier", requestedAt: "2026-11-24T07:40:00.000Z" });
    const decided = adjustment({ id: "decided", status: "approved", decidedAt: "2026-11-24T08:00:00.000Z" });
    const creditNote = adjustment({ id: "credit-note", kind: "credit_note" });
    expect(waitingWaivers([later, decided, creditNote, earlier]).map(a => a.id)).toEqual(["earlier", "later"]);
  });
});

describe("the waivers decided today", () => {
  it("are those approved or rejected on Nairobi's today, the latest first", () => {
    const approved = adjustment({ id: "approved", status: "approved", decidedAt: "2026-11-24T06:12:00.000Z" });
    // 00:30 on the 24th in Nairobi, though still the 23rd in UTC.
    const rejected = adjustment({ id: "rejected", status: "rejected", decidedAt: "2026-11-23T21:30:00.000Z" });
    const yesterday = adjustment({ id: "yesterday", status: "approved", decidedAt: "2026-11-23T20:30:00.000Z" });
    const withdrawn = adjustment({ id: "withdrawn", status: "withdrawn", decidedAt: "2026-11-24T06:00:00.000Z" });
    const pending = adjustment({ id: "pending" });
    expect(decidedToday([rejected, pending, yesterday, withdrawn, approved], "2026-11-24").map(a => a.id)).toEqual(["approved", "rejected"]);
  });

  it("are waivers only", () => {
    const writeOff = adjustment({ kind: "write_off", status: "approved", decidedAt: "2026-11-24T06:12:00.000Z" });
    expect(decidedToday([writeOff], "2026-11-24")).toEqual([]);
  });
});
