"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import { TextField } from "@/components/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { patientKey, visitsKey } from "@/hooks/use-patients";
import { useRepeatSafe } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { ApiError, failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER, type WriteState } from "@/lib/api/repeat-safe";
import { businessDate } from "@/lib/dates";
import { type FoundPatient, fullName, type PatientRecord } from "@/lib/patients";
import {
  emptyGuardian,
  type Field,
  fieldProblem,
  type GuardianDraft,
  type IdentityDocument,
  LIMITS,
  MAX_GUARDIANS,
  type Problems,
  type RegisterBody,
  registrationBody,
  type RegistrationDraft,
} from "@/lib/registration";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

import { FoundLine } from "./found-line";

/** What follows registering: the visit started, an emergency, or nothing yet. */
export type Then = "opd" | "emergency" | null;

/** A patient already on file who looks like the one being registered, and why. */
type Candidate = FoundPatient & { reasons: (keyof typeof en.register.sameReasons)[] };

interface Props {
  draft: RegistrationDraft;
  onDraft: (draft: RegistrationDraft) => void;
  onBack: () => void;
  onRegistered: (record: PatientRecord, then: Then) => void;
  onOpen: (patient: FoundPatient) => void;
}

const words = en.register;
const SEXES = ["female", "male", "intersex"] as const;
const DOCUMENTS: IdentityDocument[] = ["national_id", "passport", "birth_certificate", "alien_id", "refugee_id"];

/** The fields a change in the form puts right, so their problems go as the clerk types. */
function fieldsOf(change: Partial<RegistrationDraft>): Field[] {
  const touched: Record<keyof RegistrationDraft, Field[]> = {
    unidentified: [],
    givenName: ["givenName"],
    middleNames: ["middleNames"],
    familyName: ["familyName"],
    sex: ["sex"],
    day: ["dateOfBirth"],
    month: ["dateOfBirth"],
    year: ["dateOfBirth"],
    age: ["age", "dateOfBirth"],
    phone: ["phone"],
    noPhone: ["phone"],
    idType: ["idNumber"],
    idNumber: ["idNumber"],
    noId: ["idNumber"],
    guardians: [],
  };
  return (Object.keys(change) as (keyof RegistrationDraft)[]).flatMap(key => touched[key]);
}

/** The label of the button that sends `then`. */
function actionLabel(then: Then): string {
  return then === "opd" ? words.registerAndStart : then === "emergency" ? words.registerAsEmergency : words.registerOnly;
}

/**
 * Registering a new patient (the journey's screen 3b): the form on the
 * left, and on the right the check for a patient already on file and the
 * way to register someone who cannot say who they are.
 *
 * Registering is repeat-safe, like every write: a dropped connection holds
 * the form as it was sent, with only Try again. A likely duplicate is the
 * API's to find; the clerk opens the record found, or says this is someone
 * else and registers anyway. Once registered, the patient's record opens on
 * the front desk, which starts the visit if that was asked for.
 */
export function RegisterPatient({ draft, onDraft, onBack, onRegistered, onOpen }: Props) {
  const queryClient = useQueryClient();
  const today = businessDate();
  const [problems, setProblems] = useState<Problems>({});
  const [refused, setRefused] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ request: RegisterBody; then: Then; message: string; candidates: Candidate[] } | null>(null);
  const [otherId, setOtherId] = useState(draft.idType !== "national_id");
  // Bumped each time problems are found, to bring the first into view: some fields sit below the fold.
  const [checked, setChecked] = useState(0);
  const body = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (checked > 0)
      body.current?.querySelector("[data-problem]")?.scrollIntoView({ block: "center" });
  }, [checked]);

  const register = useRepeatSafe<{ request: RegisterBody; then: Then }, PatientRecord>(async ({ key, body }, signal) => {
    const record = await unwrap(api.POST("/patients", { body: body.request, headers: { [IDEMPOTENCY_HEADER]: key }, signal }));
    // The answer is the whole record, and a patient registered a moment ago has no visits: neither is read again.
    queryClient.setQueryData(patientKey(record.id), record);
    queryClient.setQueryData(visitsKey(record.id), []);
    return record;
  });
  const { state } = register;
  const waiting = state.kind === "sending" || state.kind === "no_answer" ? state.action.body : null;

  // The duplicate check stands while the form is as it was when checked: a change is checked again.
  const now = registrationBody(draft, today);
  const stillChecked = duplicate !== null && now.ok && JSON.stringify(now.body) === JSON.stringify(duplicate.request);

  function change(patch: Partial<RegistrationDraft>) {
    onDraft({ ...draft, ...patch });
    const cleared = fieldsOf(patch);
    // A guardian added or removed moves the others' places: their problems no longer point at them.
    const moved = patch.guardians !== undefined && patch.guardians.length !== draft.guardians.length;
    setProblems(known => Object.fromEntries(Object.entries(known).filter(([field]) => !cleared.includes(field as Field) && !(moved && field.startsWith("guardians.")))));
  }

  function changeGuardian(at: number, patch: Partial<GuardianDraft>) {
    change({ guardians: draft.guardians.map((guardian, index) => (index === at ? { ...guardian, ...patch } : guardian)) });
    setProblems(known => Object.fromEntries(Object.entries(known).filter(([field]) => !field.startsWith(`guardians.${at}.`))));
  }

  /** What the answer to registering means for the screen. */
  function answered(ended: WriteState<{ request: RegisterBody; then: Then }, PatientRecord>, request: RegisterBody, then: Then) {
    if (ended.kind === "done") {
      onRegistered(ended.result, then);
      return;
    }
    if (ended.kind !== "refused")
      return;
    const refusal = ended.error instanceof ApiError ? ended.error.refusal : null;
    if (refusal?.kind === "refused" && refusal.code === "possible_duplicate") {
      const candidates = Array.isArray(refusal.fields.candidates) ? refusal.fields.candidates as Candidate[] : [];
      setDuplicate({ request: { ...request, confirmNotDuplicate: false }, then, message: refusal.message, candidates });
      return;
    }
    if (refusal?.kind === "invalid") {
      const found = refusal.issues.map(issue => fieldProblem(issue.path, draft)).filter(found => found !== null);
      setProblems(Object.fromEntries(found.map(({ field, problem }) => [field, problem])));
      setRefused(found.length > 0 ? words.checkFields : en.errors.invalid);
      setChecked(times => times + 1);
      return;
    }
    setRefused(failureText(ended.error));
  }

  async function send(then: Then, confirmNotDuplicate = false) {
    const built = registrationBody(draft, today, confirmNotDuplicate);
    setRefused(null);
    setDuplicate(null);
    if (!built.ok) {
      setProblems(built.problems);
      setRefused(words.checkFields);
      setChecked(times => times + 1);
      return;
    }
    setProblems({});
    answered(await register.press({ request: built.body, then }), built.body, then);
  }

  async function tryAgain() {
    if (!waiting)
      return;
    const { request, then } = waiting;
    answered(await register.press(waiting), request, then);
  }

  const held = waiting !== null;
  const mainThen: Then = draft.unidentified ? "emergency" : "opd";

  function footer() {
    if (state.kind === "no_answer") {
      return (
        <>
          <Alert variant="problem">
            <AlertTitle>{en.writes.noAnswerTitle}</AlertTitle>
            <AlertDescription>{en.writes.noAnswer}</AlertDescription>
          </Alert>
          <Button onClick={() => void tryAgain()}>{words.tryAgain(actionLabel(state.action.body.then))}</Button>
        </>
      );
    }
    const sending = state.kind === "sending" ? state.action.body.then : undefined;
    return (
      <>
        {refused && !stillChecked && (
          <Alert variant="problem">
            <AlertTitle>{en.writes.notDone}</AlertTitle>
            <AlertDescription>{refused}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button disabled={held} onClick={() => void send(mainThen)} className="flex-[999_1_300px]">
            {sending === mainThen ? words.registering : actionLabel(mainThen)}
          </Button>
          <Button variant="second" disabled={held} onClick={() => void send(null)} className="flex-[1_1_200px]">
            {sending === null ? words.registering : words.registerOnly}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{words.numberHint}</p>
      </>
    );
  }

  return (
    <main className="flex min-h-0 w-full flex-1 gap-5 px-6 py-4">
      <section aria-labelledby="register-title" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-4">
          <h1 id="register-title" className="text-name font-bold">{draft.unidentified ? words.unidentifiedTitle : words.title}</h1>
          <Button variant="link" disabled={held} onClick={onBack}>{words.back}</Button>
        </div>
        {/* On the pilot's wide screens a name field would stretch past 400 px: the fields keep to a readable width. */}
        <fieldset ref={body} disabled={held} className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 *:max-w-[1040px]">
          {draft.unidentified
            ? (
                <>
                  <p className="text-secondary-foreground">{words.unidentifiedHelp}</p>
                  <SexChoice value={draft.sex} notKnown onChange={sex => change({ sex })} problem={problems.sex} />
                  <TextField label={words.ageUnidentified} inputMode="numeric" maxLength={3} value={draft.age} onChange={event => change({ age: event.target.value })} problem={problems.age} className="w-[200px]" />
                </>
              )
            : (
                <>
                  <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                    <TextField label={words.givenName} autoComplete="off" maxLength={LIMITS.name} value={draft.givenName} onChange={event => change({ givenName: event.target.value })} problem={problems.givenName} />
                    <TextField
                      label={(
                        <>
                          {words.middleNames}
                          {" "}
                          <span className="font-normal text-muted-foreground">{words.ifAny}</span>
                        </>
                      )}
                      autoComplete="off"
                      maxLength={LIMITS.name}
                      value={draft.middleNames}
                      onChange={event => change({ middleNames: event.target.value })}
                      problem={problems.middleNames}
                    />
                    <TextField label={words.familyName} autoComplete="off" maxLength={LIMITS.name} value={draft.familyName} onChange={event => change({ familyName: event.target.value })} problem={problems.familyName} />
                  </div>
                  <SexChoice value={draft.sex} onChange={sex => change({ sex })} problem={problems.sex} />
                  <BirthAndAge draft={draft} change={change} problems={problems} />
                  <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <TextField label={words.phone} type="tel" autoComplete="off" maxLength={LIMITS.phone} disabled={draft.noPhone} value={draft.phone} onChange={event => change({ phone: event.target.value })} problem={problems.phone} />
                      <Tick label={words.noPhone} checked={draft.noPhone} onChange={noPhone => change({ noPhone })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {otherId && (
                        <label className="flex flex-col gap-1.5">
                          <span className="font-semibold">{words.idType}</span>
                          <select value={draft.idType} disabled={draft.noId !== null} onChange={event => change({ idType: event.target.value as IdentityDocument })} className="h-12 rounded-lg border border-input bg-card px-3 text-base">
                            {DOCUMENTS.map(type => <option key={type} value={type}>{en.patients.documents[type]}</option>)}
                          </select>
                        </label>
                      )}
                      <TextField label={otherId ? words.otherIdNumber : words.idNumber} autoComplete="off" maxLength={LIMITS.idNumber} disabled={draft.noId !== null} value={draft.idNumber} onChange={event => change({ idNumber: event.target.value })} problem={problems.idNumber} />
                      <div className="flex flex-wrap items-center gap-x-5">
                        <Tick label={words.notCarried} checked={draft.noId === "not_carried"} onChange={on => change({ noId: on ? "not_carried" : null })} />
                        <Tick label={words.noneHeld} checked={draft.noId === "none_held"} onChange={on => change({ noId: on ? "none_held" : null })} />
                        {!otherId && <Button variant="link" onClick={() => setOtherId(true)}>{words.otherId}</Button>}
                      </div>
                    </div>
                  </div>
                  <Guardians guardians={draft.guardians} problems={problems} change={change} changeGuardian={changeGuardian} />
                </>
              )}
        </fieldset>
        <div className="flex flex-none flex-col gap-2 border-t border-border bg-card px-6 py-3.5 shadow-[0_-6px_16px_rgba(15,23,42,0.06)]">
          {footer()}
        </div>
      </section>
      <aside aria-label={words.sameTitle} className="flex min-h-0 w-[300px] shrink-0 flex-col gap-4 overflow-y-auto xl:w-[360px]">
        {duplicate && stillChecked && (
          <Alert variant="caution" role="alert" className="rounded-xl p-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">{words.sameTitle}</h2>
              <p>{duplicate.message}</p>
              {duplicate.candidates.map(candidate => (
                <div key={candidate.id} className="flex flex-col gap-2 rounded-lg border border-caution-border bg-card p-3.5 text-foreground">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-bold">{fullName(candidate)}</span>
                    <FoundLine patient={candidate} />
                    {candidate.reasons.map(reason => <span key={reason} className="text-sm text-secondary-foreground">{words.sameReasons[reason]}</span>)}
                  </span>
                  <Button variant="second" disabled={held} onClick={() => onOpen(candidate)} className="min-h-12 text-base">{words.openThis}</Button>
                </div>
              ))}
              <Button variant="quiet" disabled={held} onClick={() => void send(duplicate.then, true)} className="min-h-12 border-caution-border text-caution-foreground">
                {words.someoneElse}
              </Button>
            </div>
          </Alert>
        )}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{draft.unidentified ? words.canSay : words.cannotSay}</h2>
          {!draft.unidentified && <p className="text-secondary-foreground">{words.cannotSayHelp}</p>}
          <Button variant="link" disabled={held} onClick={() => change({ unidentified: !draft.unidentified })} className="self-start text-left">
            {draft.unidentified ? words.registerByName : words.registerUnidentified}
          </Button>
        </div>
      </aside>
    </main>
  );
}

/** A choice pressed like a button: Female, Male, Intersex, and for an unidentified patient, Not known. */
function SexChoice({ value, notKnown = false, onChange, problem }: { value: RegistrationDraft["sex"]; notKnown?: boolean; onChange: (sex: RegistrationDraft["sex"]) => void; problem?: string }) {
  const id = useId();
  const options: { sex: RegistrationDraft["sex"]; label: string }[] = [
    ...SEXES.map(sex => ({ sex, label: en.patients.sex[sex] })),
    ...(notKnown ? [{ sex: null, label: words.sexNotKnown }] : []),
  ];
  return (
    <fieldset aria-describedby={problem ? `${id}-problem` : undefined} className="flex flex-col gap-2">
      <legend className="pb-2 font-semibold">{words.sex}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(({ sex, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={value === sex}
            onClick={() => onChange(sex)}
            className={cn(
              "min-h-12 rounded-lg border px-[22px]",
              value === sex ? "border-selected bg-selected font-bold text-primary-foreground" : "border-input bg-card font-semibold text-foreground hover:bg-muted",
              problem && value !== sex && "border-problem-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {problem && <p id={`${id}-problem`} data-problem className="text-sm font-semibold text-problem-foreground">{problem}</p>}
    </fieldset>
  );
}

/**
 * The date of birth in three parts, or about how old: one or the other. The
 * inputs line up along their bottoms, so their problems are said below them
 * both.
 */
function BirthAndAge({ draft, change, problems }: { draft: RegistrationDraft; change: (patch: Partial<RegistrationDraft>) => void; problems: Problems }) {
  const id = useId();
  const small = (label: string) => <span className="text-sm font-normal text-secondary-foreground">{label}</span>;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <fieldset aria-describedby={problems.dateOfBirth ? `${id}-date` : undefined} className="flex flex-col">
          <legend className="pb-1.5 font-semibold">{words.dateOfBirth}</legend>
          <div className="flex gap-3">
            <TextField label={small(words.day)} inputMode="numeric" maxLength={2} value={draft.day} onChange={event => change({ day: event.target.value })} className="w-16" />
            <TextField label={small(words.month)} inputMode="numeric" maxLength={2} value={draft.month} onChange={event => change({ month: event.target.value })} className="w-16" />
            <TextField label={small(words.year)} inputMode="numeric" maxLength={4} value={draft.year} onChange={event => change({ year: event.target.value })} className="w-24" />
          </div>
        </fieldset>
        <TextField
          label={words.age}
          inputMode="numeric"
          maxLength={3}
          value={draft.age}
          onChange={event => change({ age: event.target.value })}
          aria-describedby={problems.age ? `${id}-age` : undefined}
          aria-invalid={problems.age ? true : undefined}
          className="w-[220px]"
        />
      </div>
      {problems.dateOfBirth && <p id={`${id}-date`} data-problem className="text-sm font-semibold text-problem-foreground">{problems.dateOfBirth}</p>}
      {problems.age && <p id={`${id}-age`} data-problem className="text-sm font-semibold text-problem-foreground">{problems.age}</p>}
    </div>
  );
}

/** A child's guardians: up to three, with only the name required. */
function Guardians({ guardians, problems, change, changeGuardian }: {
  guardians: GuardianDraft[];
  problems: Problems;
  change: (patch: Partial<RegistrationDraft>) => void;
  changeGuardian: (at: number, patch: Partial<GuardianDraft>) => void;
}) {
  const problem = (at: number, field: keyof GuardianDraft) => problems[`guardians.${at}.${field}`];
  return (
    <div className="flex flex-col gap-4">
      {guardians.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-muted px-3.5 py-1">
          <span>
            <strong>{words.child}</strong>
            {" "}
            {words.childHelp}
          </span>
          <Button variant="link" onClick={() => change({ guardians: [{ ...emptyGuardian }] })}>{words.addGuardian}</Button>
        </div>
      )}
      {guardians.map((guardian, at) => (
        // A guardian has no id until registered; one is only ever added at the end, or removed.
        <fieldset key={at} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <legend className="px-1 font-semibold">{words.guardian(at + 1)}</legend>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <TextField label={words.guardianName} autoComplete="off" maxLength={LIMITS.name} value={guardian.name} onChange={event => changeGuardian(at, { name: event.target.value })} problem={problem(at, "name")} />
            <TextField label={words.relationship} hint={words.relationshipHint} autoComplete="off" maxLength={LIMITS.relationship} value={guardian.relationship} onChange={event => changeGuardian(at, { relationship: event.target.value })} problem={problem(at, "relationship")} />
            <TextField label={words.phone} type="tel" autoComplete="off" maxLength={LIMITS.phone} value={guardian.phone} onChange={event => changeGuardian(at, { phone: event.target.value })} problem={problem(at, "phone")} />
            <TextField label={words.guardianId} autoComplete="off" maxLength={LIMITS.idNumber} value={guardian.idNumber} onChange={event => changeGuardian(at, { idNumber: event.target.value })} problem={problem(at, "idNumber")} />
          </div>
          <Button variant="link" onClick={() => change({ guardians: guardians.filter((_, index) => index !== at) })} className="self-start">{words.removeGuardian}</Button>
        </fieldset>
      ))}
      {guardians.length > 0 && guardians.length < MAX_GUARDIANS && (
        <Button variant="link" onClick={() => change({ guardians: [...guardians, { ...emptyGuardian }] })} className="self-start">{words.addAnotherGuardian}</Button>
      )}
    </div>
  );
}

function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2.5">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="size-[22px] accent-selected" />
      {label}
    </label>
  );
}
