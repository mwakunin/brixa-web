"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePatient, usePatientVisits, visitsKey } from "@/hooks/use-patients";
import { useRepeatSafe } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER } from "@/lib/api/repeat-safe";
import { businessDate, clockTime } from "@/lib/dates";
import { type Fact, type FoundPatient, fullName, opNumberOf, recordFacts } from "@/lib/patients";
import { hasOpenOutpatientVisit, type Visit, visitFact } from "@/lib/visits";
import { en } from "@/strings/en";

interface Start {
  patientId: string;
  kind: "opd" | "emergency";
}

/** What starting the visit led to, in the words the Done message uses. */
function startedText(name: string, visit: Visit): string {
  const words = en.frontDesk;
  if (!visit.queue)
    return words.inNoQueue(name);
  return visit.kind === "emergency" ? words.inQueueAsEmergency(name, visit.queue.servicePointName) : words.inQueue(name, visit.queue.servicePointName);
}

/**
 * The patient in front of the clerk: who they are, where they are today,
 * and the one dark button that starts their visit. Their name and number
 * stay put, the record scrolls, and the buttons are pinned at the bottom.
 *
 * Starting the visit is repeat-safe: a dropped connection leaves only Try
 * again, under the same key. The answer adds the new visit to the list
 * already read, so the record is not opened again to show it.
 */
export function PatientPanel({ id, found, onNext }: { id: string; found: FoundPatient | null; onNext: () => void }) {
  const record = usePatient(id);
  const visits = usePatientVisits(id);
  const queryClient = useQueryClient();
  const main = useRef<HTMLButtonElement>(null);
  const today = businessDate();

  const start = useRepeatSafe<Start, Visit>(async ({ key, body }, signal) => {
    const opened = await unwrap(api.POST("/encounters", { body, headers: { [IDEMPOTENCY_HEADER]: key }, signal }));
    queryClient.setQueryData<Visit[]>(visitsKey(body.patientId), known => known && [opened, ...known.filter(visit => visit.id !== opened.id)]);
    return opened;
  });
  const { state } = start;

  // The button that pressed may be gone once an answer comes: the main one takes the keyboard's place.
  useEffect(() => {
    if (state.kind === "done" || state.kind === "no_answer")
      main.current?.focus();
  }, [state.kind]);

  const name = found ? fullName(found) : record.data ? fullName(record.data) : null;
  const opNumber = found?.opNumber ?? (record.data ? opNumberOf(record.data) : null);
  const visit: Fact = visits.data
    ? visitFact(visits.data, today)
    : { label: en.visits.lastHere, value: visits.isError ? en.visits.notChecked : en.visits.checking };
  const alreadyHere = visits.data !== undefined && hasOpenOutpatientVisit(visits.data);
  const sending = state.kind === "sending" ? state.action.body.kind : null;

  function footer() {
    const words = en.frontDesk;
    if (state.kind === "done")
      return <Button ref={main} onClick={onNext}>{words.next}</Button>;
    if (state.kind === "no_answer") {
      return (
        <>
          <Alert variant="problem">
            <AlertTitle>{en.writes.noAnswerTitle}</AlertTitle>
            <AlertDescription>{en.writes.noAnswer}</AlertDescription>
          </Alert>
          <Button ref={main} onClick={() => void start.press(state.action.body)}>
            {state.action.body.kind === "emergency" ? words.tryAgainEmergency : words.tryAgainStart}
          </Button>
        </>
      );
    }
    return (
      <>
        {state.kind === "refused" && (
          <Alert variant="problem">
            <AlertTitle>{en.writes.notDone}</AlertTitle>
            <AlertDescription>{failureText(state.error)}</AlertDescription>
          </Alert>
        )}
        {/* On a narrow panel Emergency wraps below, full width; beside the main button it keeps its own width. */}
        <div className="flex flex-wrap gap-3">
          {alreadyHere
            ? <Button ref={main} disabled={sending !== null} onClick={onNext} className="flex-[999_1_300px]">{words.next}</Button>
            : (
                <Button ref={main} disabled={sending !== null} onClick={() => void start.press({ patientId: id, kind: "opd" })} className="flex-[999_1_300px]">
                  {sending === "opd" ? words.starting : words.start}
                </Button>
              )}
          <Button variant="emergency" disabled={sending !== null} onClick={() => void start.press({ patientId: id, kind: "emergency" })} className="flex-[1_1_200px]">
            {sending === "emergency" ? words.starting : words.emergency}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{alreadyHere && name ? words.alreadyHere(name) : words.startHint}</p>
      </>
    );
  }

  return (
    <section aria-label={en.frontDesk.patient} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-secondary px-6 py-4">
        <h1 className="text-name font-bold">{name ?? en.frontDesk.opening}</h1>
        {opNumber && <span className="text-lg font-semibold text-secondary-foreground">{opNumber}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {state.kind === "done" && (
          <Alert variant="done">
            <AlertTitle>{startedText(name ?? en.frontDesk.patient, state.result)}</AlertTitle>
            <AlertDescription>{en.frontDesk.startedAt(clockTime(new Date(state.result.startedAt)))}</AlertDescription>
          </Alert>
        )}
        {record.data
          ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 2xl:grid-cols-3">
                {recordFacts(record.data, today, visit).map((fact, index) => (
                  // Two documents may share a label ("Other ID"), and the list is never reordered.
                  <div key={`${fact.label}-${index}`}>
                    <dt className="text-sm text-muted-foreground">{fact.label}</dt>
                    <dd className="font-semibold">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )
          : record.isError
            ? (
                <Alert variant="problem">
                  <AlertDescription>{failureText(record.error)}</AlertDescription>
                  <Button variant="link" className="self-start" onClick={() => void record.refetch()}>{en.errors.tryAgain}</Button>
                </Alert>
              )
            : <p role="status" className="text-muted-foreground">{en.frontDesk.opening}</p>}
        {record.data && visits.isError && (
          <Button variant="link" className="self-start" onClick={() => void visits.refetch()}>{en.errors.tryAgain}</Button>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2 border-t border-border bg-card px-6 py-3.5 shadow-[0_-6px_16px_rgba(15,23,42,0.06)]">
        {footer()}
      </div>
    </section>
  );
}
