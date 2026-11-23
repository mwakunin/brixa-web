import { describe, expect, it } from "vitest";

import { emptyDraft, emptyGuardian, fieldProblem, namesFromSearch, type RegistrationDraft, registrationBody } from "./registration";

const today = "2026-11-22";

const adult: RegistrationDraft = {
  ...emptyDraft,
  givenName: " Brian ",
  familyName: "Kiplagat",
  sex: "male",
  age: "34",
  phone: "0733 555 010",
  noId: "not_carried",
};

describe("the body sent to register a patient", () => {
  it("carries what was typed, trimmed, with the reason a document is missing", () => {
    expect(registrationBody(adult, today)).toEqual({
      ok: true,
      body: {
        givenName: "Brian",
        familyName: "Kiplagat",
        sex: "male",
        estimatedAgeYears: 34,
        phone: "0733 555 010",
        noIdReason: "not_carried",
        contacts: [],
        confirmNotDuplicate: false,
      },
    });
  });

  it("takes a date of birth from its three parts, and the ID document of the kind chosen", () => {
    const result = registrationBody({ ...adult, age: "", day: "3", month: "7", year: "1992", noId: null, idType: "passport", idNumber: "A123", middleNames: "Kibet", noPhone: true, phone: "" }, today);

    expect(result.ok && result.body).toMatchObject({
      middleNames: "Kibet",
      dateOfBirth: "1992-07-03",
      noPhoneReason: "no_phone",
      identifiers: [{ type: "passport", value: "A123" }],
    });
    expect(result.ok && "estimatedAgeYears" in result.body).toBe(false);
  });

  it("says the clerk saw the likely duplicates when told so", () => {
    expect(registrationBody(adult, today, true)).toMatchObject({ ok: true, body: { confirmNotDuplicate: true } });
  });

  it("names the guardians that have anything typed, with only what was typed", () => {
    const child: RegistrationDraft = {
      ...adult,
      guardians: [
        { ...emptyGuardian },
        { name: "Grace Kiplagat", relationship: "Mother", phone: "0711 000 111", idNumber: "22334455" },
        { ...emptyGuardian, name: "Paul Kiplagat" },
      ],
    };

    expect(registrationBody(child, today)).toMatchObject({
      ok: true,
      body: {
        contacts: [
          { name: "Grace Kiplagat", relationship: "Mother", phone: "0711 000 111", idDocument: { type: "national_id", value: "22334455" } },
          { name: "Paul Kiplagat" },
        ],
      },
    });
  });

  it("puts someone who cannot say who they are on file under a placeholder name, every detail missing for that reason", () => {
    expect(registrationBody({ ...emptyDraft, unidentified: true, sex: "male", age: "30", givenName: "ignored" }, today)).toEqual({
      ok: true,
      body: { givenName: "Unknown", familyName: "Male", sex: "male", estimatedAgeYears: 30, noPhoneReason: "unidentified", noIdReason: "unidentified", unidentified: true, confirmNotDuplicate: false },
    });
    expect(registrationBody({ ...emptyDraft, unidentified: true, age: "30" }, today)).toMatchObject({ ok: true, body: { givenName: "Unknown", familyName: "Patient", sex: null } });
  });
});

describe("what must be put right before registering", () => {
  it("is every required detail left out, each at its field", () => {
    const result = registrationBody(emptyDraft, today);

    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.problems).sort()).toEqual(["dateOfBirth", "familyName", "givenName", "idNumber", "phone", "sex"]);
  });

  it("is a name shorter than two letters, a middle name included", () => {
    expect(registrationBody({ ...adult, givenName: "B", middleNames: "K" }, today)).toMatchObject({ ok: false, problems: { givenName: expect.any(String), middleNames: expect.any(String) } });
  });

  it.each([
    ["31 February", { day: "31", month: "2", year: "2000" }],
    ["a day not yet come", { day: "23", month: "11", year: "2026" }],
    ["a year before 1900", { day: "1", month: "1", year: "1899" }],
    ["part of a date", { day: "3", month: "", year: "1992" }],
  ])("is a date of birth that is not possible: %s", (_label, date) => {
    expect(registrationBody({ ...adult, age: "", ...date }, today)).toMatchObject({ ok: false, problems: { dateOfBirth: "Not a possible date of birth: check the day, month and year." } });
  });

  it("accepts a date of birth of today, for a baby born here", () => {
    expect(registrationBody({ ...adult, age: "", day: "22", month: "11", year: "2026" }, today)).toMatchObject({ ok: true, body: { dateOfBirth: "2026-11-22" } });
  });

  it("is a date of birth and an age both given, or an age that is not whole years", () => {
    expect(registrationBody({ ...adult, day: "3", month: "7", year: "1992" }, today)).toMatchObject({ ok: false, problems: { dateOfBirth: "Give the date of birth or the age, not both." } });
    expect(registrationBody({ ...adult, age: "3.5" }, today)).toMatchObject({ ok: false, problems: { age: expect.any(String) } });
    expect(registrationBody({ ...adult, age: "121" }, today)).toMatchObject({ ok: false, problems: { age: expect.any(String) } });
  });

  it("is a guardian with details but no name, at that guardian's place in the form", () => {
    expect(registrationBody({ ...adult, guardians: [{ ...emptyGuardian }, { ...emptyGuardian, phone: "0711 000 111", relationship: "M" }] }, today)).toEqual({
      ok: false,
      problems: { "guardians.1.name": expect.any(String), "guardians.1.relationship": expect.any(String) },
    });
  });

  it("is an unidentified patient's age, the one detail asked for", () => {
    expect(registrationBody({ ...emptyDraft, unidentified: true }, today)).toEqual({ ok: false, problems: { age: expect.any(String) } });
  });
});

describe("a field the API did not accept", () => {
  it("is found from the path it gave, and said in our words", () => {
    expect(fieldProblem("phone", adult)).toEqual({ field: "phone", problem: expect.stringContaining("Not a phone number we recognise") });
    expect(fieldProblem("identifiers.0.value", adult)?.field).toBe("idNumber");
    expect(fieldProblem("estimatedAgeYears", adult)?.field).toBe("age");
    expect(fieldProblem("somethingElse", adult)).toBeNull();
  });

  it("is a guardian's, at that guardian's place in the form, skipping the empty ones", () => {
    const draft = { ...adult, guardians: [{ ...emptyGuardian }, { ...emptyGuardian, name: "Grace", phone: "123" }] };

    expect(fieldProblem("contacts.0.phone", draft)?.field).toBe("guardians.1.phone");
    expect(fieldProblem("contacts.0.idDocument.value", draft)?.field).toBe("guardians.1.idNumber");
    expect(fieldProblem("contacts.3.name", draft)).toBeNull();
  });
});

describe("the names a search was for", () => {
  it("start the form: the first word, the middle ones, and the last", () => {
    expect(namesFromSearch("brian kiplagat")).toEqual({ givenName: "brian", middleNames: "", familyName: "kiplagat" });
    expect(namesFromSearch(" Amina  Wambui Karanja ")).toEqual({ givenName: "Amina", middleNames: "Wambui", familyName: "Karanja" });
    expect(namesFromSearch("Wanjirū")).toEqual({ givenName: "Wanjirū", middleNames: "", familyName: "" });
  });

  it("are none for a number", () => {
    expect(namesFromSearch("0712 345 678")).toEqual({ givenName: "", middleNames: "", familyName: "" });
    expect(namesFromSearch("OP0004")).toEqual({ givenName: "", middleNames: "", familyName: "" });
  });
});
