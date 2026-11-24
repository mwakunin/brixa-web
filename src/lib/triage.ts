import type { paths } from "@/lib/api/schema";

import { businessDate, printedSince } from "@/lib/dates";
import { en } from "@/strings/en";

/** What triage sends (`POST /queue-entries/{id}/triage`). */
export type TriageBody = NonNullable<paths["/queue-entries/{id}/triage"]["post"]["requestBody"]>["content"]["application/json"];

/** A patient in a queue (`GET /service-points/{id}/queue`). */
export type QueueEntry = paths["/service-points/{id}/queue"]["get"]["responses"][200]["content"]["application/json"]["entries"][number];

/** The vital signs the triage form asks for, in the mockup's order, with the keyboard each needs. */
export const VITAL_SIGNS = [
  { code: "temperature", decimal: true },
  { code: "pulse", decimal: false },
  { code: "respiratory_rate", decimal: false },
  { code: "spo2", decimal: false },
  { code: "bp_systolic", decimal: false },
  { code: "bp_diastolic", decimal: false },
  { code: "weight", decimal: true },
  { code: "pain_score", decimal: false },
] as const;

export type VitalSign = (typeof VITAL_SIGNS)[number]["code"];
export type Priority = TriageBody["priority"];
export type AllergyCategory = "drug" | "food" | "environment" | "other";
export type Severity = "mild" | "moderate" | "severe";

/** An allergy the nurse found, as typed. */
export interface AllergyDraft {
  category: AllergyCategory;
  allergen: string;
  reaction: string;
  severity: Severity | null;
}

/** The triage form, as typed: nothing is sent until the nurse presses. */
export interface TriageDraft {
  complaint: string;
  /** Each reading as typed; a blank one was not taken. */
  readings: Partial<Record<VitalSign, string>>;
  /** Whether allergies were asked about, and what was found. */
  allergies: "not_asked" | "none_known" | "recorded";
  allergy: AllergyDraft;
  priority: Priority | null;
  clinicId: string | null;
}

export const emptyAllergy: AllergyDraft = { category: "drug", allergen: "", reaction: "", severity: null };

export const emptyTriage: TriageDraft = { complaint: "", readings: {}, allergies: "not_asked", allergy: emptyAllergy, priority: null, clinicId: null };

export type TriageField = "complaint" | VitalSign | "allergen" | "priority" | "clinic";
export type TriageProblems = Partial<Record<TriageField, string>>;

/** A reading as typed, as a number: a decimal comma is a point. Ranges are the API's to check. */
function reading(typed: string): number | null {
  const value = Number(typed.trim().replace(",", "."));
  return /^-?\d+(?:[.,]\d+)?$/.test(typed.trim()) && Number.isFinite(value) ? value : null;
}

/**
 * What the triage form sends, or what must be put right first, at its
 * field. The complaint, how soon and the clinic are asked for; the readings
 * taken are sent, the blank ones left out; allergies are sent only when
 * they were asked about. Whether a reading could be one is the API's to say.
 */
export function triageBody(draft: TriageDraft): { ok: true; body: TriageBody } | { ok: false; problems: TriageProblems } {
  const words = en.triage.problems;
  const problems: TriageProblems = {};
  const complaint = draft.complaint.trim();
  if (complaint.length < 2)
    problems.complaint = words.complaint;
  const readings: { code: VitalSign; value: number }[] = [];
  for (const { code } of VITAL_SIGNS) {
    const typed = draft.readings[code]?.trim() ?? "";
    if (typed === "")
      continue;
    const value = reading(typed);
    if (value === null)
      problems[code] = words.reading;
    else
      readings.push({ code, value });
  }
  const allergen = draft.allergy.allergen.trim();
  if (draft.allergies === "recorded" && allergen === "")
    problems.allergen = words.allergen;
  if (!draft.priority)
    problems.priority = words.priority;
  if (!draft.clinicId)
    problems.clinic = words.clinic;
  if (Object.keys(problems).length > 0 || !draft.priority || !draft.clinicId)
    return { ok: false, problems };

  const reaction = draft.allergy.reaction.trim();
  const allergies: TriageBody["allergies"] = draft.allergies === "none_known"
    ? [{ noKnownAllergies: true }]
    : draft.allergies === "recorded"
      ? [{ category: draft.allergy.category, allergen, ...(reaction ? { reaction } : {}), ...(draft.allergy.severity ? { severity: draft.allergy.severity } : {}) }]
      : undefined;
  return {
    ok: true,
    body: {
      complaint,
      ...(readings.length > 0 ? { readings } : {}),
      ...(allergies ? { allergies } : {}),
      priority: draft.priority,
      nextServicePointId: draft.clinicId,
    },
  };
}

const isVitalSign = (code: string): code is VitalSign => VITAL_SIGNS.some(sign => sign.code === code);

/**
 * The field a refused triage's 422 names (its path, as `readings.0.value`),
 * with the problem in our words: a reading by its place in what was sent,
 * the complaint, or an allergy's name. None for a path the screen has no
 * field for.
 */
export function triageFieldProblem(path: string, sent: TriageBody | null): { field: TriageField; problem: string } | null {
  const words = en.triage.notAccepted;
  const [first, index, last] = path.split(".");
  if (first === "complaint")
    return { field: "complaint", problem: words.complaint };
  if (first === "readings" && /^\d+$/.test(index ?? "")) {
    const code = sent?.readings?.[Number(index)]?.code;
    return code && isVitalSign(code) ? { field: code, problem: words.reading } : null;
  }
  if (first === "allergies" && last === "allergen")
    return { field: "allergen", problem: words.allergen };
  return null;
}

/** A queued patient's age, from the whole years the queue gives. */
export function ageWords(years: number): string {
  const { age } = en.triage;
  return years === 0 ? age.underOne : age.years(years);
}

/** How long a patient has waited since they joined the queue, as a row says it: since when, once it was before today. */
export function waitingWords(joinedAt: string, now: Date): string {
  const { waited } = en.triage;
  const joined = new Date(joinedAt);
  const today = businessDate(now);
  if (businessDate(joined) !== today)
    return waited.since(printedSince(joined, today));
  const minutes = Math.floor((now.getTime() - joined.getTime()) / 60_000);
  if (minutes < 1)
    return waited.underMinute;
  return minutes < 60 ? waited.minutes(minutes) : waited.hours(Math.floor(minutes / 60), minutes % 60);
}
