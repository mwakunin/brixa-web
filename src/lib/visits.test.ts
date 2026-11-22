import { describe, expect, it } from "vitest";

import { hasOpenOutpatientVisit, type Visit, visitFact } from "./visits";

const today = "2026-11-22";

function visit(overrides: Partial<Visit>): Visit {
  return {
    id: "e-1",
    patientId: "p-1",
    kind: "opd",
    status: "closed",
    startedAt: "2026-03-03T06:10:00.000Z",
    endedAt: "2026-03-03T12:00:00.000Z",
    cancelReason: null,
    parentEncounterId: null,
    queue: null,
    attending: null,
    admission: null,
    ...overrides,
  };
}

const waiting = visit({
  status: "open",
  startedAt: "2026-11-22T06:12:00.000Z",
  endedAt: null,
  queue: { entryId: "q-1", servicePointId: "sp-1", servicePointName: "Triage", status: "waiting", joinedAt: "2026-11-22T06:12:00.000Z", servingAt: null },
});

describe("what the front desk says of a patient's visits", () => {
  it("is where they are now while a visit is open, on Nairobi's clock", () => {
    expect(visitFact([waiting, visit({})], today)).toEqual({ label: "Here now", value: "Outpatient visit, waiting at Triage since 09:12" });
  });

  it("says who has them, once they are being seen", () => {
    const serving = visit({ ...waiting, kind: "emergency", queue: { ...waiting.queue!, servicePointName: "General OPD", status: "serving", servingAt: "2026-11-22T06:30:00.000Z" } });

    expect(visitFact([serving], today).value).toBe("Emergency, with General OPD since 09:30");
  });

  it("gives the date too when a visit still open began before today", () => {
    const fromYesterday = visit({ ...waiting, queue: { ...waiting.queue!, joinedAt: "2026-11-21T17:11:00.000Z" } });

    expect(visitFact([fromYesterday], today).value).toBe("Outpatient visit, waiting at Triage since 21 November, 20:11");
  });

  it("says when an open visit is in no queue", () => {
    expect(visitFact([visit({ ...waiting, queue: null })], today).value).toBe("Outpatient visit, open since 09:12, in no queue");
  });

  it("is the day they were last here otherwise, not counting a visit opened by mistake", () => {
    const mistake = visit({ status: "cancelled", startedAt: "2026-11-20T07:00:00.000Z" });

    expect(visitFact([mistake, visit({})], today)).toEqual({ label: "Last here", value: "3 March, outpatient visit" });
  });

  it("takes the day in Nairobi, where a visit at 01:00 began", () => {
    expect(visitFact([visit({ startedAt: "2026-11-20T22:00:00.000Z" })], today).value).toBe("Yesterday, outpatient visit");
  });

  it("says when they have not been here before", () => {
    expect(visitFact([], today)).toEqual({ label: "Last here", value: "Not here before" });
  });
});

describe("an open outpatient visit", () => {
  it("is found among a patient's visits; an open emergency is another kind", () => {
    expect(hasOpenOutpatientVisit([waiting])).toBe(true);
    expect(hasOpenOutpatientVisit([visit({ ...waiting, kind: "emergency" })])).toBe(false);
    expect(hasOpenOutpatientVisit([visit({})])).toBe(false);
  });
});
