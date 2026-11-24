import { describe, expect, it } from "vitest";

import { ageWords, emptyTriage, type TriageDraft, triageBody, triageFieldProblem, waitingWords } from "./triage";

const ready: TriageDraft = { ...emptyTriage, complaint: "Fever and headache for three days", priority: "urgent", clinicId: "00000000-0000-4000-8000-0000000000c1" };

describe("what triage sends", () => {
  it("is the complaint, the readings taken, how soon and the clinic, with nothing about allergies when they were not asked", () => {
    const result = triageBody({ ...ready, readings: { temperature: " 38.4 ", pulse: "104", spo2: "" } });
    expect(result).toEqual({
      ok: true,
      body: {
        complaint: "Fever and headache for three days",
        readings: [{ code: "temperature", value: 38.4 }, { code: "pulse", value: 104 }],
        priority: "urgent",
        nextServicePointId: "00000000-0000-4000-8000-0000000000c1",
      },
    });
  });

  it("takes a decimal comma as a point", () => {
    expect(triageBody({ ...ready, readings: { weight: "62,5" } })).toMatchObject({ ok: true, body: { readings: [{ code: "weight", value: 62.5 }] } });
  });

  it("says when the patient has no known allergies, or the one found", () => {
    expect(triageBody({ ...ready, allergies: "none_known" })).toMatchObject({ ok: true, body: { allergies: [{ noKnownAllergies: true }] } });
    const found = triageBody({ ...ready, allergies: "recorded", allergy: { category: "drug", allergen: " Penicillin ", reaction: " Rash ", severity: "severe" } });
    expect(found).toMatchObject({ ok: true, body: { allergies: [{ category: "drug", allergen: "Penicillin", reaction: "Rash", severity: "severe" }] } });
    const bare = triageBody({ ...ready, allergies: "recorded", allergy: { category: "food", allergen: "Groundnuts", reaction: "", severity: null } });
    expect(bare).toMatchObject({ ok: true, body: { allergies: [{ category: "food", allergen: "Groundnuts" }] } });
  });

  it("asks for what is missing, each at its field: the complaint, how soon, where to, an allergy's name, and a reading that is not a number", () => {
    const result = triageBody({ ...emptyTriage, readings: { temperature: "38.4.1" }, allergies: "recorded" });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : Object.keys(result.problems).sort()).toEqual(["allergen", "clinic", "complaint", "priority", "temperature"]);
  });
});

describe("a triage field the API did not accept", () => {
  const sent = triageBody({ ...ready, readings: { temperature: "384", pulse: "104" } });
  const body = sent.ok ? sent.body : null;

  it("is the reading it named, by its place in what was sent", () => {
    expect(triageFieldProblem("readings.0.value", body)?.field).toBe("temperature");
  });

  it("is the complaint or the allergy's name", () => {
    expect(triageFieldProblem("complaint", body)?.field).toBe("complaint");
    expect(triageFieldProblem("allergies.0.allergen", body)?.field).toBe("allergen");
  });

  it("is none for a path the screen has no field for", () => {
    expect(triageFieldProblem("nextServicePointId", body)).toBeNull();
  });
});

describe("how a patient in the queue is told", () => {
  it("says their age in years, and a baby's as under a year", () => {
    expect(ageWords(29)).toBe("29 years");
    expect(ageWords(1)).toBe("1 year");
    expect(ageWords(0)).toBe("under a year");
  });

  it("says how long they have waited today, in minutes, then hours and minutes", () => {
    const now = new Date("2026-11-24T07:00:00.000Z");
    expect(waitingWords("2026-11-24T06:46:00.000Z", now)).toBe("waiting 14 min");
    expect(waitingWords("2026-11-24T06:59:40.000Z", now)).toBe("waiting under a minute");
    expect(waitingWords("2026-11-24T05:35:00.000Z", now)).toBe("waiting 1 h 25 min");
  });

  it("says since when they have waited, once they joined before today, Nairobi's", () => {
    const now = new Date("2026-11-24T07:00:00.000Z");
    // 23:30 on the 23rd in Nairobi.
    expect(waitingWords("2026-11-23T20:30:00.000Z", now)).toBe("waiting since 23 November, 23:30");
  });
});
