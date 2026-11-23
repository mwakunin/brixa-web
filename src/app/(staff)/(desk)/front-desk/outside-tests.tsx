"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import type { paths } from "@/lib/api/schema";

import { TextField } from "@/components/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLabTests, usePriceList } from "@/hooks/use-desk";
import { visitsKey } from "@/hooks/use-patients";
import { useRepeatSafe, waitingBody } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { ApiError, failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER } from "@/lib/api/repeat-safe";
import { formatKes } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Visit } from "@/lib/visits";
import {
  offeredTests,
  testsMatching,
  WALK_IN_LIMITS,
  type WalkInBody,
  walkInBody,
  type WalkInDraft,
  walkInFieldProblem,
  type WalkInProblems,
} from "@/lib/walk-in";
import { en } from "@/strings/en";

/** What an outside request waiting for its answer sent, for the panel to show its form again as it was. */
export function waitingOutsideTests(patientId: string): WalkInDraft | null {
  return waitingBody<Entry>(`outside-tests:${patientId}`)?.draft ?? null;
}

export type WalkInOrder = paths["/encounters/{id}/walk-in-orders"]["post"]["responses"][201]["content"]["application/json"];

interface Entry {
  patientId: string;
  /** The outpatient visit open now, which the tests go on; null to open one, in no queue. */
  visitId: string | null;
  request: WalkInBody;
  /** The form as it was when sent: shown again as it was if the panel is left and opened again before an answer. */
  draft: WalkInDraft;
}

const words = en.walkIn;

/**
 * Tests from an outside doctor's request (the walk-in lab client): who asked,
 * which of the lab's tests, and whether it is urgent. The patient goes
 * straight to the lab, with no triage: their visit is opened in no queue,
 * unless one is open already, and the tests are entered on it.
 *
 * The two requests are one action for the clerk, and one key: the visit
 * goes as `<key>.visit` and the tests as `<key>.tests`, so Try again after a
 * lost answer replays whichever was done already, and does the rest.
 *
 * It fills the patient panel below the name: the form scrolls, the buttons
 * stay at the bottom.
 */
export function OutsideTests({ patientId, name, openVisitId, draft, setDraft, onEntered, onBack }: {
  patientId: string;
  name: string;
  openVisitId: string | null;
  /** The form, kept by the panel, so going back to the record and returning finds it as it was left. */
  draft: WalkInDraft;
  setDraft: React.Dispatch<React.SetStateAction<WalkInDraft>>;
  onEntered: (order: WalkInOrder) => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const tests = useLabTests();
  const prices = usePriceList();
  const action = `outside-tests:${patientId}`;
  const [problems, setProblems] = useState<WalkInProblems>({});
  const [refused, setRefused] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const main = useRef<HTMLButtonElement>(null);

  const enter = useRepeatSafe<Entry, WalkInOrder>(action, async ({ key, body }, signal) => {
    let visitId = body.visitId;
    if (!visitId) {
      const opened = await unwrap(api.POST("/encounters", { body: { patientId: body.patientId, kind: "opd", queueAt: null }, headers: { [IDEMPOTENCY_HEADER]: `${key}.visit` }, signal }));
      // Known from here on, so a refused entry pressed again goes on this visit rather than opening another;
      // a read of the visits begun before it opened would not have it, so it is stopped first.
      await queryClient.cancelQueries({ queryKey: visitsKey(body.patientId), exact: true });
      queryClient.setQueryData<Visit[]>(visitsKey(body.patientId), known => [opened, ...(known ?? []).filter(visit => visit.id !== opened.id)]);
      visitId = opened.id;
    }
    return unwrap(api.POST("/encounters/{id}/walk-in-orders", { params: { path: { id: visitId } }, body: body.request, headers: { [IDEMPOTENCY_HEADER]: `${key}.tests` }, signal }));
  });
  const { state } = enter;
  const held = state.kind === "sending" || state.kind === "no_answer";

  useEffect(() => {
    if (state.kind === "no_answer")
      main.current?.focus();
  }, [state.kind]);

  // The tests are entered: acted on here, from the state, whichever press sent them. One sent before the
  // panel was left and opened again ends here too, rather than leaving the form to be sent a second time.
  useEffect(() => {
    if (state.kind === "done")
      onEntered(state.result);
  }, [state, onEntered]);

  function change(patch: Partial<WalkInDraft>) {
    setDraft(known => ({ ...known, ...patch }));
    const cleared = Object.keys(patch).flatMap(key => (key === "testIds" ? ["tests"] : key === "selfRequested" ? ["doctor", "facility", "licence"] : [key]));
    setProblems(known => Object.fromEntries(Object.entries(known).filter(([field]) => !cleared.includes(field))));
  }

  async function send() {
    setRefused(null);
    let entry: Entry;
    if (state.kind === "no_answer") {
      entry = state.action.body;
    }
    else {
      const built = walkInBody(draft);
      if (!built.ok) {
        setProblems(built.problems);
        setRefused(en.register.checkFields);
        return;
      }
      setProblems({});
      entry = { patientId, visitId: openVisitId, request: built.body, draft };
    }
    const ended = await enter.press(entry);
    if (ended.kind !== "refused")
      return;
    const refusal = ended.error instanceof ApiError ? ended.error.refusal : null;
    if (refusal?.kind === "invalid") {
      const found = refusal.issues.map(issue => walkInFieldProblem(issue.path)).filter(found => found !== null);
      setProblems(Object.fromEntries(found.map(({ field, problem }) => [field, problem])));
      setRefused(found.length > 0 ? en.register.checkFields : en.errors.invalid);
      return;
    }
    setRefused(failureText(ended.error));
  }

  // "See the marked fields" goes once none is left; a refusal of the API's stays until the next press.
  const shownRefusal = refused === en.register.checkFields && Object.keys(problems).length === 0 ? null : refused;
  const offered = tests.data && prices.data ? offeredTests(tests.data, prices.data) : null;
  const shown = offered ? testsMatching(offered, find) : [];
  const catalogueFailed = tests.isError || prices.isError;

  return (
    <>
      <fieldset disabled={held} className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 *:max-w-[1040px]">
        <h2 className="text-title font-bold">{words.title}</h2>
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-3 text-lg font-semibold">{words.who}</legend>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <TextField label={words.doctor} autoComplete="off" maxLength={WALK_IN_LIMITS.doctor} disabled={draft.selfRequested} value={draft.doctor} onChange={event => change({ doctor: event.target.value })} problem={problems.doctor} />
            <TextField label={words.facility} autoComplete="off" maxLength={WALK_IN_LIMITS.facility} disabled={draft.selfRequested} value={draft.facility} onChange={event => change({ facility: event.target.value })} problem={problems.facility} />
          </div>
          <TextField
            label={(
              <>
                {words.licence}
                {" "}
                <span className="font-normal text-muted-foreground">{words.ifOnRequest}</span>
              </>
            )}
            autoComplete="off"
            maxLength={WALK_IN_LIMITS.licence}
            disabled={draft.selfRequested}
            value={draft.licence}
            onChange={event => change({ licence: event.target.value })}
            problem={problems.licence}
            className="w-[280px]"
          />
          <label className="flex min-h-11 items-center gap-2.5">
            <input type="checkbox" checked={draft.selfRequested} onChange={event => change({ selfRequested: event.target.checked })} className="size-[22px] accent-selected" />
            {words.selfRequested}
          </label>
        </fieldset>
        <fieldset aria-describedby={problems.tests ? `${id}-tests` : undefined} className="flex flex-col gap-3">
          <legend className="pb-3 text-lg font-semibold">{words.tests}</legend>
          <TextField label={words.findTest} type="search" autoComplete="off" value={find} onChange={event => setFind(event.target.value)} className="w-[320px]" />
          {problems.tests && <p id={`${id}-tests`} data-problem className="text-sm font-semibold text-problem-foreground">{problems.tests}</p>}
          {offered
            ? shown.length === 0
              ? <p className="text-secondary-foreground">{words.noTestMatches}</p>
              : (
                  <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {shown.map((test) => {
                      const chosen = draft.testIds.includes(test.id);
                      return (
                        <li key={test.id}>
                          <label className={cn("flex min-h-12 items-center gap-2.5 rounded-lg border px-3 py-2", chosen ? "border-selected bg-selected-tint" : "border-border")}>
                            <input
                              type="checkbox"
                              checked={chosen}
                              onChange={event => change({ testIds: event.target.checked ? [...draft.testIds, test.id] : draft.testIds.filter(chosenId => chosenId !== test.id) })}
                              className="size-[22px] accent-selected"
                            />
                            <span className="flex-1">{test.name}</span>
                            <span className="text-sm text-muted-foreground">{test.priceCents === null ? words.noPrice : formatKes(test.priceCents)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )
            : catalogueFailed
              ? (
                  <Alert variant="problem">
                    <AlertDescription>{failureText(tests.error ?? prices.error)}</AlertDescription>
                    <Button variant="link" className="self-start" onClick={() => void Promise.all([tests.refetch(), prices.refetch()])}>{en.errors.tryAgain}</Button>
                  </Alert>
                )
              : <p role="status" className="text-muted-foreground">{words.testsLoading}</p>}
        </fieldset>
        <label className="flex min-h-11 items-center gap-2.5">
          <input type="checkbox" checked={draft.urgent} onChange={event => change({ urgent: event.target.checked })} className="size-[22px] accent-selected" />
          {words.urgent}
        </label>
        <TextField label={words.indication} hint={words.indicationHint} autoComplete="off" maxLength={WALK_IN_LIMITS.indication} value={draft.indication} onChange={event => change({ indication: event.target.value })} problem={problems.indication} />
      </fieldset>
      <div className="flex flex-none flex-col gap-2 border-t border-border bg-card px-6 py-3.5 shadow-[0_-6px_16px_rgba(15,23,42,0.06)]">
        {state.kind === "no_answer"
          ? (
              <>
                <Alert variant="problem">
                  <AlertTitle>{en.writes.noAnswerTitle}</AlertTitle>
                  <AlertDescription>{en.writes.noAnswer}</AlertDescription>
                </Alert>
                <Button ref={main} onClick={() => void send()}>{words.tryAgain}</Button>
              </>
            )
          : (
              <>
                {shownRefusal && (
                  <Alert variant="problem">
                    <AlertTitle>{en.writes.notDone}</AlertTitle>
                    <AlertDescription>{shownRefusal}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button ref={main} disabled={held} onClick={() => void send()} className="flex-[999_1_300px]">
                    {state.kind === "sending" ? words.entering : words.send(draft.testIds.length, name)}
                  </Button>
                  <Button variant="second" disabled={held} onClick={onBack} className="flex-[1_1_240px]">{words.back}</Button>
                </div>
                <p className="text-sm text-muted-foreground">{words.hint}</p>
              </>
            )}
      </div>
    </>
  );
}
