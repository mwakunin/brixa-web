import type { paths } from "@/lib/api/schema";

import { en } from "@/strings/en";

/**
 * Registering a new patient (`POST /patients`): the form as typed, and the
 * body the API takes, with what is missing found before anything is sent.
 *
 * The API decides the rest: whether a phone or an ID number is one it
 * accepts, and whether the patient looks like one already on file.
 */
export type RegisterBody = paths["/patients"]["post"]["requestBody"]["content"]["application/json"];
export type IdentityDocument = "national_id" | "passport" | "birth_certificate" | "alien_id" | "refugee_id";
type Sex = "female" | "male" | "intersex";

export interface GuardianDraft {
  name: string;
  relationship: string;
  phone: string;
  idNumber: string;
}

/** The form, as typed. */
export interface RegistrationDraft {
  /** Brought in unable to say who they are: no name, phone or ID yet. */
  unidentified: boolean;
  givenName: string;
  middleNames: string;
  familyName: string;
  sex: Sex | null;
  day: string;
  month: string;
  year: string;
  age: string;
  phone: string;
  noPhone: boolean;
  idType: IdentityDocument;
  idNumber: string;
  noId: "not_carried" | "none_held" | null;
  guardians: GuardianDraft[];
}

/** At most three contacts at registration; more are added to the record afterwards. */
export const MAX_GUARDIANS = 3;

export const emptyGuardian: GuardianDraft = { name: "", relationship: "", phone: "", idNumber: "" };

export const emptyDraft: RegistrationDraft = {
  unidentified: false,
  givenName: "",
  middleNames: "",
  familyName: "",
  sex: null,
  day: "",
  month: "",
  year: "",
  age: "",
  phone: "",
  noPhone: false,
  idType: "national_id",
  idNumber: "",
  noId: null,
  guardians: [],
};

type GuardianField = "name" | "relationship" | "phone" | "idNumber";
export type Field = "givenName" | "middleNames" | "familyName" | "sex" | "dateOfBirth" | "age" | "phone" | "idNumber" | `guardians.${number}.${GuardianField}`;
export type Problems = Partial<Record<Field, string>>;

const words = en.register.problems;
const filled = (text: string) => text.trim().length > 0;
const longEnough = (text: string) => text.trim().length >= 2;
const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** The guardians that have anything typed, with where each sits in the form. */
function typedGuardians(draft: RegistrationDraft): { guardian: GuardianDraft; at: number }[] {
  return draft.guardians
    .map((guardian, at) => ({ guardian, at }))
    .filter(({ guardian }) => Object.values(guardian).some(filled));
}

/** The date of birth typed, as `YYYY-MM-DD` if it is a real day from 1900 to today; else null. */
function birthDate(draft: RegistrationDraft, today: string): string | null {
  if (![draft.day, draft.month, draft.year].every(part => /^\d+$/.test(part.trim())))
    return null;
  const [day, month, year] = [draft.day, draft.month, draft.year].map(part => Number(part.trim()));
  const at = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day)
    return null;
  const date = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  return date <= today ? date : null;
}

/** How old, in whole years, from what was typed; null if it is not a whole number from 0 to 120. */
function ageYears(text: string): number | null {
  return /^\d{1,3}$/.test(text.trim()) && Number(text) <= 120 ? Number(text) : null;
}

/**
 * The body to send for what was typed, or what must be put right first. A
 * patient who cannot say who they are is on file under a placeholder name
 * ("Unknown Male") until identified, with every missing detail put down to
 * that.
 */
export function registrationBody(draft: RegistrationDraft, today: string, confirmNotDuplicate = false): { ok: true; body: RegisterBody } | { ok: false; problems: Problems } {
  const problems: Problems = {};

  if (draft.unidentified) {
    const age = ageYears(draft.age);
    if (age === null)
      return { ok: false, problems: { age: words.age } };
    return {
      ok: true,
      body: {
        givenName: en.register.unknownGiven,
        familyName: en.register.unknownFamily[draft.sex ?? "none"],
        sex: draft.sex,
        estimatedAgeYears: age,
        noPhoneReason: "unidentified",
        noIdReason: "unidentified",
        unidentified: true,
        confirmNotDuplicate,
      },
    };
  }

  if (!longEnough(draft.givenName))
    problems.givenName = words.name;
  if (filled(draft.middleNames) && !longEnough(draft.middleNames))
    problems.middleNames = words.name;
  if (!longEnough(draft.familyName))
    problems.familyName = words.name;
  if (!draft.sex)
    problems.sex = words.sex;

  const typedDate = [draft.day, draft.month, draft.year].some(filled);
  const dateOfBirth = typedDate ? birthDate(draft, today) : null;
  const age = filled(draft.age) ? ageYears(draft.age) : null;
  if (typedDate && filled(draft.age))
    problems.dateOfBirth = words.notBoth;
  else if (typedDate && !dateOfBirth)
    problems.dateOfBirth = words.date;
  else if (!typedDate && filled(draft.age) && age === null)
    problems.age = words.age;
  else if (!typedDate && !filled(draft.age))
    problems.dateOfBirth = words.dateOrAge;

  if (!draft.noPhone && !filled(draft.phone))
    problems.phone = words.phoneOrNone;
  if (!draft.noId && !filled(draft.idNumber))
    problems.idNumber = words.idOrReason;

  const contacts = typedGuardians(draft).map(({ guardian, at }) => {
    if (!longEnough(guardian.name))
      problems[`guardians.${at}.name`] = words.name;
    if (filled(guardian.relationship) && !longEnough(guardian.relationship))
      problems[`guardians.${at}.relationship`] = words.relationship;
    return {
      name: guardian.name.trim(),
      ...(filled(guardian.relationship) && { relationship: guardian.relationship.trim() }),
      ...(filled(guardian.phone) && { phone: guardian.phone.trim() }),
      ...(filled(guardian.idNumber) && { idDocument: { type: "national_id" as const, value: guardian.idNumber.trim() } }),
    };
  });

  if (Object.keys(problems).length > 0)
    return { ok: false, problems };
  return {
    ok: true,
    body: {
      givenName: draft.givenName.trim(),
      ...(filled(draft.middleNames) && { middleNames: draft.middleNames.trim() }),
      familyName: draft.familyName.trim(),
      sex: draft.sex,
      ...(dateOfBirth ? { dateOfBirth } : { estimatedAgeYears: age ?? 0 }),
      ...(draft.noPhone ? { noPhoneReason: "no_phone" as const } : { phone: draft.phone.trim() }),
      ...(draft.noId ? { noIdReason: draft.noId } : { identifiers: [{ type: draft.idType, value: draft.idNumber.trim() }] }),
      contacts,
      confirmNotDuplicate,
    },
  };
}

/**
 * The field a refused value belongs to, from the path the API gave it
 * (`contacts.0.phone`), with what to say there in our words: the API's own
 * words for a field are not written for staff.
 */
export function fieldProblem(path: string, draft: RegistrationDraft): { field: Field; problem: string } | null {
  const [first, index, inner] = path.split(".");
  const notAccepted = words.notAccepted;
  switch (first) {
    case "givenName":
    case "middleNames":
    case "familyName":
      return { field: first, problem: notAccepted.name };
    case "dateOfBirth":
      return { field: "dateOfBirth", problem: notAccepted.date };
    case "estimatedAgeYears":
      return { field: "age", problem: words.age };
    case "phone":
    case "noPhoneReason":
      return { field: "phone", problem: notAccepted.phone };
    case "identifiers":
    case "noIdReason":
      return { field: "idNumber", problem: notAccepted.id };
    case "contacts": {
      const at = typedGuardians(draft)[Number(index)]?.at;
      if (at === undefined)
        return null;
      if (inner === "phone")
        return { field: `guardians.${at}.phone`, problem: notAccepted.phone };
      if (inner === "idDocument")
        return { field: `guardians.${at}.idNumber`, problem: notAccepted.id };
      if (inner === "relationship")
        return { field: `guardians.${at}.relationship`, problem: notAccepted.relationship };
      return { field: `guardians.${at}.name`, problem: notAccepted.name };
    }
    default:
      return null;
  }
}

/**
 * The names a search was for, to start the form with when nobody was found:
 * the first word, any middle ones, and the last. A search with digits in it
 * was a number, not a name, and starts nothing.
 */
export function namesFromSearch(term: string): Pick<RegistrationDraft, "givenName" | "middleNames" | "familyName"> {
  const parts = term.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || !parts.every(part => /^[\p{L}'-]+$/u.test(part)))
    return { givenName: "", middleNames: "", familyName: "" };
  const [given, ...rest] = parts;
  return { givenName: given, middleNames: rest.slice(0, -1).join(" "), familyName: rest.at(-1) ?? "" };
}
