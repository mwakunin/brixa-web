import { describe, expect, it } from "vitest";

import { emptyWalkIn, offeredTests, testsMatching, walkInBody, walkInFieldProblem } from "./walk-in";

const malaria = { id: "t-1", billableItemId: "i-1", code: "MRDT", name: "Malaria rapid test", specimenType: "blood" as const, isActive: true, sensitiveCategory: null, analytes: [] };
const count = { ...malaria, id: "t-2", billableItemId: "i-2", code: "FBC", name: "Full blood count" };
const retired = { ...malaria, id: "t-3", billableItemId: "i-3", code: "ESR", name: "ESR", isActive: false };
const item = (id: string, cashPriceCents: number | null) => ({ id, code: id, name: id, category: "lab" as const, isActive: true, printedName: null, cashPriceCents });

describe("the body sent for an outside request", () => {
  it("names the requester as the form does, with the tests chosen", () => {
    expect(walkInBody({ ...emptyWalkIn, doctor: " Dr Otieno ", facility: "Riverside Clinic", testIds: ["t-1", "t-2"] })).toEqual({
      ok: true,
      body: { requester: { name: "Dr Otieno", facility: "Riverside Clinic" }, labTestIds: ["t-1", "t-2"] },
    });
  });

  it("carries the licence number, the urgency and what the tests are for, when given", () => {
    expect(walkInBody({ ...emptyWalkIn, doctor: "Dr Otieno", facility: "Riverside Clinic", licence: "A123", urgent: true, indication: " Fever ", testIds: ["t-1"] })).toMatchObject({
      ok: true,
      body: { requester: { licenceNumber: "A123" }, urgency: "urgent", indication: "Fever" },
    });
  });

  it("names no requester when the patient asks for the tests, whatever was typed", () => {
    expect(walkInBody({ ...emptyWalkIn, doctor: "half typed", selfRequested: true, testIds: ["t-1"] })).toEqual({ ok: true, body: { selfRequested: true, labTestIds: ["t-1"] } });
  });
});

describe("what must be put right first", () => {
  it("is the requester and the tests, each at its field", () => {
    expect(walkInBody(emptyWalkIn)).toEqual({ ok: false, problems: { doctor: expect.any(String), facility: expect.any(String), tests: expect.any(String) } });
  });

  it("is more tests than one request takes, said with the limit", () => {
    const tests = Array.from({ length: 31 }, (_, n) => `t-${n}`);

    expect(walkInBody({ ...emptyWalkIn, selfRequested: true, testIds: tests })).toEqual({ ok: false, problems: { tests: "Choose at most 30 tests: one request takes no more." } });
    expect(walkInBody({ ...emptyWalkIn, selfRequested: true, testIds: tests.slice(0, 30) }).ok).toBe(true);
  });

  it("is only the tests when the patient asks for them", () => {
    expect(walkInBody({ ...emptyWalkIn, selfRequested: true })).toEqual({ ok: false, problems: { tests: expect.any(String) } });
  });
});

describe("a field the API did not accept", () => {
  it("is found from the path it gave", () => {
    expect(walkInFieldProblem("requester.facility")?.field).toBe("facility");
    expect(walkInFieldProblem("requester.licenceNumber")?.field).toBe("licence");
    expect(walkInFieldProblem("requester")?.field).toBe("doctor");
    expect(walkInFieldProblem("labTestIds.0")?.field).toBe("tests");
    expect(walkInFieldProblem("urgency")).toBeNull();
  });
});

describe("the tests offered", () => {
  it("are those in use, by name, each with today's price or none", () => {
    expect(offeredTests([malaria, retired, count], [item("i-1", 30_000)])).toEqual([
      { id: "t-2", name: "Full blood count", priceCents: null },
      { id: "t-1", name: "Malaria rapid test", priceCents: 30_000 },
    ]);
  });

  it("are found by every word typed, in any order and case", () => {
    const tests = offeredTests([malaria, count], []);

    expect(testsMatching(tests, "test MALARIA").map(test => test.id)).toEqual(["t-1"]);
    expect(testsMatching(tests, "  ").map(test => test.id)).toEqual(["t-2", "t-1"]);
    expect(testsMatching(tests, "urine")).toEqual([]);
  });
});
