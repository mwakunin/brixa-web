import { describe, expect, it } from "vitest";

import { type FoundPatient, foundLine, fullName, opNumberOf, type PatientRecord, recordFacts } from "./patients";

const today = "2026-11-22";

const found: FoundPatient = {
  id: "p-1",
  opNumber: "OP-000412",
  givenName: "Amina",
  middleNames: null,
  familyName: "Njeri",
  sex: "female",
  dateOfBirth: "1997-06-14",
  age: 29,
  phone: "+254712345678",
  idDocument: { type: "national_id", value: "31204567" },
};

const record: PatientRecord = {
  id: "p-1",
  givenName: "Amina",
  middleNames: null,
  familyName: "Njeri",
  sex: "female",
  dateOfBirth: "1997-06-14",
  age: 29,
  phone: "+254712345678",
  dobIsEstimated: false,
  noPhoneReason: null,
  noIdReason: null,
  unidentified: false,
  smsReminders: true,
  registeredAt: "2026-03-03T06:00:00.000Z",
  numbers: [{ kind: "outpatient", number: "OP-000412", issuedAt: "2026-03-03T06:00:00.000Z" }],
  identifiers: [{ type: "national_id", value: "31204567", addedAt: "2026-03-03T06:00:00.000Z" }],
  contacts: [],
};

const lastHere = { label: "Last here", value: "3 March, outpatient visit" };

describe("a patient's name", () => {
  it("is every name given, in order", () => {
    expect(fullName(found)).toBe("Amina Njeri");
    expect(fullName({ givenName: "Amina", middleNames: "Wambui", familyName: "Karanja" })).toBe("Amina Wambui Karanja");
  });
});

describe("a found patient's line", () => {
  it("tells two people of one name apart: number, sex, age, phone and ID", () => {
    expect(foundLine(found, today)).toEqual(["OP-000412", "Female", "29 years", "0712 345 678", "ID 31204567"]);
  });

  it("says when there is no phone or no ID, and a child's age in months", () => {
    expect(foundLine({ ...found, opNumber: null, sex: null, dateOfBirth: "2026-03-10", phone: null, idDocument: null }, today)).toEqual(["Sex not known", "8 months", "no phone", "no ID"]);
  });

  it("names a document other than a national ID", () => {
    expect(foundLine({ ...found, idDocument: { type: "birth_certificate", value: "BC-2201" } }, today)).toContain("Birth certificate BC-2201");
  });
});

describe("a record's facts", () => {
  it("are what the front desk confirms a patient by, in the order it asks", () => {
    expect(recordFacts(record, today, lastHere)).toEqual([
      { label: "Sex and age", value: "Female, 29 years" },
      { label: "Born", value: "14 June 1997" },
      { label: "Phone", value: "0712 345 678" },
      { label: "National ID", value: "31204567" },
      lastHere,
      { label: "Text reminders", value: "Yes" },
    ]);
  });

  it("say why a phone or an ID is missing, and that a birth date is only estimated", () => {
    const facts = recordFacts({ ...record, phone: null, noPhoneReason: "no_phone", identifiers: [], noIdReason: "not_carried", dobIsEstimated: true, smsReminders: null }, today, lastHere);

    expect(facts).toContainEqual({ label: "Born", value: "Not known: the age was given" });
    expect(facts).toContainEqual({ label: "Phone", value: "Has no phone" });
    expect(facts).toContainEqual({ label: "ID number", value: "Not carried when registered" });
    expect(facts).toContainEqual({ label: "Text reminders", value: "Not asked yet" });
  });

  it("list every document held", () => {
    const facts = recordFacts({ ...record, identifiers: [...record.identifiers, { type: "sha_number", value: "SHA-77", addedAt: record.registeredAt }] }, today, lastHere);

    expect(facts.filter(fact => fact.label.includes("ID") || fact.label.includes("SHA"))).toEqual([
      { label: "National ID", value: "31204567" },
      { label: "SHA number", value: "SHA-77" },
    ]);
  });
});

describe("the number staff quote", () => {
  it("is the outpatient number, when one has been issued", () => {
    expect(opNumberOf(record)).toBe("OP-000412");
    expect(opNumberOf({ ...record, numbers: [] })).toBeNull();
  });
});
