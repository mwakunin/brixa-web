"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { paths } from "@/lib/api/schema";

import { TextField } from "@/components/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useRepeatSafe } from "@/hooks/use-repeat-safe";
import { useAllergies } from "@/hooks/use-triage";
import { api } from "@/lib/api/client";
import { ApiError, failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER, waitingIn } from "@/lib/api/repeat-safe";
import { businessDate, clockTime, printedDay } from "@/lib/dates";
import {
  type AllergyCategory,
  ageWords,
  emptyAllergy,
  type Priority,
  type QueueEntry,
  type Severity,
  type TriageBody,
  triageBody,
  type TriageDraft,
  triageFieldProblem,
  type TriageProblems,
  VITAL_SIGNS,
} from "@/lib/triage";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

const words = en.triage;

type ServicePoint = paths["/service-points"]["get"]["responses"][200]["content"]["application/json"]["servicePoints"][number];
type Triaged = paths["/queue-entries/{id}/triage"]["post"]["responses"][200]["content"]["application/json"];

/** As long as the API takes a complaint, an allergen, a reaction and a reading. */
const LIMITS = { complaint: 200, allergen: 100, reaction: 200, reading: 6 };

/** A patient sent on: what their Done says. */
export interface Sent {
  entryId: string;
  name: string;
  clinic: string;
  priority: Priority;
  savedAt: string;
}

/**
 * The triage form for the patient with the nurse: today's complaint, the
 * vital signs taken, the allergies asked about, how soon they must be seen,
 * and the clinic they go to. One press saves all of it and sends them on
 * (`POST /queue-entries/{id}/triage`), or, on a refusal, none of it.
 *
 * Repeat-safe: with no answer, what was sent is held and the only way on is
 * Try again. A refusal is shown in the API's words beside the button, and
 * one that names a field shows there, in ours; what was typed is kept.
 */
export function TriageForm({ entry, clinics, clinicsRead, draft, setDraft, onSent }: {
  entry: QueueEntry;
  clinics: ServicePoint[];
  clinicsRead: boolean;
  draft: TriageDraft;
  setDraft: (update: (known: TriageDraft) => TriageDraft) => void;
  onSent: (sent: Sent) => void;
}) {
  const name = entry.patient.name;
  const allergies = useAllergies(entry.patient.id);
  const [problems, setProblems] = useState<TriageProblems>({});
  const main = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLDivElement>(null);
  const chosenClinic = clinics.find(clinic => clinic.id === draft.clinicId) ?? null;

  const triage = useRepeatSafe<TriageBody, Triaged>(`triage:${entry.entryId}`, async ({ key, body }, signal) =>
    unwrap(api.POST("/queue-entries/{id}/triage", { params: { path: { id: entry.entryId } }, body, headers: { [IDEMPOTENCY_HEADER]: key }, signal })));
  const { state } = triage;
  const waiting = waitingIn(state);

  // The button that pressed may be gone once an answer comes: the main one takes the keyboard's place.
  useEffect(() => {
    if (state.kind === "no_answer")
      main.current?.focus();
  }, [state.kind]);

  // What must be put right is brought into view: the first problem, wherever the form was scrolled to.
  useEffect(() => {
    if (Object.keys(problems).length > 0)
      form.current?.querySelector("[data-problem]")?.scrollIntoView({ block: "center" });
  }, [problems]);

  function change(update: (known: TriageDraft) => TriageDraft) {
    setDraft(update);
    setProblems({});
  }

  async function press() {
    const result = waiting ? { ok: true as const, body: waiting.body } : triageBody(draft);
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }
    setProblems({});
    const ended = await triage.press(result.body);
    if (ended.kind === "done") {
      const clinic = clinics.find(point => point.id === ended.result.next?.servicePointId);
      onSent({
        entryId: entry.entryId,
        name,
        clinic: clinic?.name ?? "",
        priority: result.body.priority,
        savedAt: clockTime(new Date(ended.result.finished.endedAt ?? Date.now())),
      });
      return;
    }
    // A refusal naming a field shows at that field, in our words.
    if (ended.kind === "refused" && ended.error instanceof ApiError && ended.error.refusal.kind === "invalid") {
      const found = ended.error.refusal.issues.map(issue => triageFieldProblem(issue.path, result.body)).filter(field => field !== null);
      setProblems(Object.fromEntries(found.map(({ field, problem }) => [field, problem])));
    }
  }

  const mainLabel = state.kind === "sending"
    ? words.saving
    : state.kind === "no_answer"
      ? words.tryAgain(chosenClinic?.name ?? "")
      : chosenClinic ? words.save(chosenClinic.name) : words.saveBare;

  return (
    <section aria-label={words.patient} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-3.5">
        <h1 className="text-name font-bold">{name}</h1>
        <span className="text-lg text-secondary-foreground">
          {[entry.patient.opNumber, entry.patient.sex ? en.patients.sex[entry.patient.sex] : words.sexNotKnown, ageWords(entry.patient.ageYears)].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div ref={form} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
        <fieldset disabled={waiting !== null} className="flex min-w-0 max-w-[1100px] flex-col gap-6">
          <TextField
            label={words.complaint(name)}
            hint={words.complaintHint}
            autoComplete="off"
            maxLength={LIMITS.complaint}
            value={draft.complaint}
            onChange={event => change(known => ({ ...known, complaint: event.target.value }))}
            problem={problems.complaint}
            labelClassName="text-lg"
            inputClassName="h-[52px] text-lg"
          />
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="pb-3 text-lg font-semibold">{words.vitals}</legend>
            <div className="grid grid-cols-2 items-end gap-3.5 xl:grid-cols-4">
              {VITAL_SIGNS.map(({ code, decimal }) => (
                <TextField
                  key={code}
                  label={words.vitalLabels[code]}
                  inputMode={decimal ? "decimal" : "numeric"}
                  autoComplete="off"
                  maxLength={LIMITS.reading}
                  value={draft.readings[code] ?? ""}
                  onChange={event => change(known => ({ ...known, readings: { ...known.readings, [code]: event.target.value } }))}
                  problem={problems[code]}
                  inputClassName="h-[52px] text-title font-semibold"
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{words.vitalsHint}</p>
          </fieldset>
          <Allergies allergies={allergies} draft={draft} onChange={change} problem={problems.allergen} />
          <Choices<Priority>
            legend={words.howSoon(name)}
            options={(["emergency", "urgent", "routine"] as const).map(priority => ({ value: priority, label: words.priorities[priority] }))}
            value={draft.priority}
            onChange={priority => change(known => ({ ...known, priority }))}
            problem={problems.priority}
            tone={priority => priority}
          />
          <fieldset aria-describedby={problems.clinic ? "clinic-problem" : undefined} className="flex min-w-0 flex-col gap-2.5">
            <legend className="pb-2.5 text-lg font-semibold">{words.sendTo(name)}</legend>
            {clinicsRead
              ? clinics.length === 0
                ? <p className="text-secondary-foreground">{words.noClinics}</p>
                : (
                    <div className="flex flex-wrap gap-2">
                      {clinics.map((clinic) => {
                        const pressed = clinic.id === draft.clinicId;
                        return (
                          <button
                            key={clinic.id}
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => change(known => ({ ...known, clinicId: clinic.id }))}
                            className={cn(
                              "flex min-h-[60px] flex-col items-start justify-center rounded-lg border px-[18px] py-2 text-left",
                              pressed ? "border-selected bg-selected text-primary-foreground" : "border-input bg-card text-foreground hover:bg-muted",
                              problems.clinic && "border-problem-foreground",
                            )}
                          >
                            <span className={pressed ? "font-bold" : "font-semibold"}>{clinic.name}</span>
                            <span className={cn("text-sm", !pressed && "text-muted-foreground")}>{words.clinicWaiting(clinic.waiting)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )
              : <p role="status" className="text-muted-foreground">{words.clinicsChecking}</p>}
            {problems.clinic && <p id="clinic-problem" data-problem className="text-sm font-semibold text-problem-foreground">{problems.clinic}</p>}
          </fieldset>
          <details className="border-t border-secondary pt-1">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-link">{words.howItWorks}</summary>
            <div className="flex flex-col gap-2 pb-2 text-secondary-foreground">
              <p>{words.howReadings}</p>
              <p>{words.howDoctor}</p>
            </div>
          </details>
        </fieldset>
      </div>
      <div className="flex flex-none flex-col gap-2 border-t border-border bg-card px-6 py-3.5 shadow-[0_-6px_16px_rgba(15,23,42,0.06)]">
        {state.kind === "no_answer" && (
          <Alert variant="problem">
            <AlertTitle>{en.writes.noAnswerTitle}</AlertTitle>
            <AlertDescription>{en.writes.noAnswer}</AlertDescription>
          </Alert>
        )}
        {state.kind === "refused" && (
          <Alert variant="problem">
            <AlertTitle>{words.notSaved}</AlertTitle>
            <AlertDescription>{failureText(state.error)}</AlertDescription>
          </Alert>
        )}
        <Button ref={main} disabled={state.kind === "sending"} onClick={() => void press()}>{mainLabel}</Button>
        <p className="text-sm text-muted-foreground">
          {state.kind === "refused"
            ? words.kept
            : chosenClinic && draft.priority ? words.joins(name, chosenClinic.name, words.priorityAs[draft.priority]) : null}
        </p>
      </div>
    </section>
  );
}

/** Allergies: those on record, and what was asked today, "none known" or one found. */
function Allergies({ allergies, draft, onChange, problem }: {
  allergies: ReturnType<typeof useAllergies>;
  draft: TriageDraft;
  onChange: (update: (known: TriageDraft) => TriageDraft) => void;
  problem?: string;
}) {
  const today = useBusinessDate();
  const standing = allergies.data?.filter(allergy => allergy.removedAt === null) ?? [];
  const noneKnown = standing.find(allergy => allergy.category === "none_known") ?? null;
  const found = standing.filter(allergy => allergy.category !== "none_known");
  const neverAsked = allergies.data !== undefined && standing.length === 0;
  const set = (allergiesAsked: TriageDraft["allergies"]) => onChange(known => ({ ...known, allergies: known.allergies === allergiesAsked ? "not_asked" : allergiesAsked }));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <legend className="pb-2.5 text-lg font-semibold">
        {words.allergies}
        {neverAsked && <span className="text-base font-normal text-muted-foreground">{` ${words.allergiesNotAsked}`}</span>}
      </legend>
      {allergies.isPending && <p role="status" className="text-muted-foreground">{words.allergiesChecking}</p>}
      {allergies.isError && (
        <Alert variant="problem">
          <AlertDescription>{words.allergiesReadFailed(failureText(allergies.error))}</AlertDescription>
          <Button variant="link" className="self-start" onClick={() => void allergies.refetch()}>{en.errors.tryAgain}</Button>
        </Alert>
      )}
      {found.length > 0 && (
        <ul className="flex flex-col gap-0.5 font-semibold">
          {found.map(allergy => (
            <li key={allergy.id}>
              {words.allergyLine(allergy.allergen ?? "", [allergy.severity ? words.severities[allergy.severity] : null, allergy.reaction].filter(part => part !== null))}
            </li>
          ))}
        </ul>
      )}
      {noneKnown && <p>{words.noneKnownBefore(printedDay(businessDate(new Date(noneKnown.recordedAt)), today), noneKnown.recordedBy.name)}</p>}
      <div className="flex flex-wrap gap-2">
        {/* "None known" only once the record is read and none stands, as the API refuses it beside an allergy on record; kept
            while chosen, so a choice the record has since made wrong can be taken back. */}
        {((allergies.data !== undefined && found.length === 0 && !noneKnown) || draft.allergies === "none_known") && <ChoiceButton pressed={draft.allergies === "none_known"} onClick={() => set("none_known")}>{words.noneKnown}</ChoiceButton>}
        <ChoiceButton pressed={draft.allergies === "recorded"} onClick={() => set("recorded")}>
          {found.length > 0 ? words.recordAnother : words.recordAllergy}
        </ChoiceButton>
      </div>
      {draft.allergies === "recorded" && (
        <div className="flex max-w-[900px] flex-col gap-4 rounded-lg border border-border p-4">
          <TextField
            label={words.allergen}
            hint={words.allergenHint}
            autoComplete="off"
            maxLength={LIMITS.allergen}
            value={draft.allergy.allergen}
            onChange={event => onChange(known => ({ ...known, allergy: { ...known.allergy, allergen: event.target.value } }))}
            problem={problem}
          />
          <Choices<AllergyCategory>
            legend={words.category}
            options={(["drug", "food", "environment", "other"] as const).map(category => ({ value: category, label: words.categories[category] }))}
            value={draft.allergy.category}
            onChange={category => onChange(known => ({ ...known, allergy: { ...known.allergy, category } }))}
            small
          />
          <TextField
            label={words.reaction}
            hint={words.reactionHint}
            autoComplete="off"
            maxLength={LIMITS.reaction}
            value={draft.allergy.reaction}
            onChange={event => onChange(known => ({ ...known, allergy: { ...known.allergy, reaction: event.target.value } }))}
          />
          <Choices<Severity>
            legend={words.severity}
            options={(["mild", "moderate", "severe"] as const).map(severity => ({ value: severity, label: words.severities[severity] }))}
            value={draft.allergy.severity}
            onChange={severity => onChange(known => ({ ...known, allergy: { ...known.allergy, severity: known.allergy.severity === severity ? null : severity } }))}
            small
          />
          <Button variant="link" className="self-start" onClick={() => onChange(known => ({ ...known, allergies: "not_asked", allergy: emptyAllergy }))}>{words.notNow}</Button>
        </div>
      )}
    </fieldset>
  );
}

function ChoiceButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-12 rounded-lg border px-[18px]",
        pressed ? "border-selected bg-selected font-bold text-primary-foreground" : "border-input bg-card font-semibold text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One of a few, pressed like a button. How soon a patient must be seen is
 * told by word, and helped by its colour and a tick once chosen.
 */
function Choices<Value extends string>({ legend, options, value, onChange, problem, tone, small = false }: {
  legend: string;
  options: { value: Value; label: string }[];
  value: Value | null;
  onChange: (value: Value) => void;
  problem?: string;
  /** How soon, for its colours: emergency, urgent or routine. */
  tone?: (value: Value) => Priority;
  small?: boolean;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={problem ? `${id}-problem` : undefined} className="flex min-w-0 flex-col gap-2.5">
      <legend className={cn("pb-2.5", small ? "font-semibold" : "text-lg font-semibold")}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const pressed = option.value === value;
          const kind = tone?.(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-[22px]",
                small ? "min-h-12 border px-[18px]" : "min-h-[52px] border-2",
                !kind && (pressed ? "border-selected bg-selected font-bold text-primary-foreground" : "border-input bg-card font-semibold text-foreground hover:bg-muted"),
                kind === "emergency" && (pressed ? "border-status-now bg-status-now font-bold text-status-now-foreground" : "border-status-now bg-card font-semibold text-status-now hover:bg-muted"),
                kind === "urgent" && (pressed ? "border-status-soon-border bg-status-soon font-bold text-status-soon-foreground" : "border-status-soon-border bg-card font-semibold text-foreground hover:bg-muted"),
                kind === "routine" && (pressed ? "border-selected bg-selected font-bold text-primary-foreground" : "border-input bg-card font-semibold text-foreground hover:bg-muted"),
                problem && "border-problem-foreground",
              )}
            >
              {pressed && kind && <Check aria-hidden="true" className="size-[18px]" strokeWidth={3} />}
              {option.label}
            </button>
          );
        })}
      </div>
      {problem && <p id={`${id}-problem`} data-problem className="text-sm font-semibold text-problem-foreground">{problem}</p>}
    </fieldset>
  );
}

