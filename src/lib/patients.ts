import type { paths } from "@/lib/api/schema";

import { printedAge, printedDate } from "@/lib/dates";
import { printedPhone } from "@/lib/phone";
import { en } from "@/strings/en";

/** A patient as a search finds them (`GET /patients?q=`). */
export type FoundPatient = paths["/patients"]["get"]["responses"][200]["content"]["application/json"]["patients"][number];

/** A patient's record, as opening it returns it (`GET /patients/{id}`). */
export type PatientRecord = paths["/patients/{id}"]["get"]["responses"][200]["content"]["application/json"];

/** One labelled fact, as a record lists them. */
export interface Fact {
  label: string;
  value: string;
}

export function fullName(patient: Pick<FoundPatient, "givenName" | "middleNames" | "familyName">): string {
  return [patient.givenName, patient.middleNames, patient.familyName].filter(Boolean).join(" ");
}

function sexWord(sex: FoundPatient["sex"]): string {
  return sex ? en.patients.sex[sex] : en.patients.sexNotKnown;
}

/** The outpatient number, which staff quote, if one has been issued. */
export function opNumberOf(record: PatientRecord): string | null {
  return record.numbers.find(number => number.kind === "outpatient")?.number ?? null;
}

/**
 * The line under a found patient's name, part by part: what tells two people
 * of the same name apart without opening either record, since each opening
 * is audited. A line breaks between parts, never inside one ("no ID").
 */
export function foundLine(patient: FoundPatient, today: string): string[] {
  const { inLine } = en.patients;
  return [
    patient.opNumber,
    sexWord(patient.sex),
    printedAge(patient.dateOfBirth, today),
    patient.phone ? printedPhone(patient.phone) : inLine.noPhone,
    patient.idDocument ? `${inLine.documents[patient.idDocument.type]} ${patient.idDocument.value}` : inLine.noId,
  ].filter(part => part !== null);
}

/**
 * The facts the front desk confirms a patient by, in the order they are
 * asked: sex and age, birth, phone, each document, then the visit and the
 * reminders. What is missing says why, as it was recorded.
 */
export function recordFacts(record: PatientRecord, today: string, visit: Fact): Fact[] {
  const words = en.patients;
  const documents = record.identifiers.map(identifier => ({ label: words.documents[identifier.type], value: identifier.value }));
  return [
    { label: words.sexAndAgeLabel, value: words.sexAndAge(sexWord(record.sex), printedAge(record.dateOfBirth, today)) },
    { label: words.born, value: record.dobIsEstimated ? words.bornEstimated : printedDate(record.dateOfBirth) },
    { label: words.phone, value: record.phone ? printedPhone(record.phone) : record.noPhoneReason ? words.noPhone[record.noPhoneReason] : words.notRecorded },
    ...(documents.length > 0 ? documents : [{ label: words.idNumber, value: record.noIdReason ? words.noId[record.noIdReason] : words.notRecorded }]),
    visit,
    { label: words.reminders, value: record.smsReminders === null ? words.remindersSaid.notAsked : record.smsReminders ? words.remindersSaid.yes : words.remindersSaid.no },
  ];
}
